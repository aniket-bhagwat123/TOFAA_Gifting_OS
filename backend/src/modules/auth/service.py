import logging
from typing import Any
from fastapi import HTTPException, status
from supabase import Client

from src.core.config import settings
from src.core.supabase import get_supabase_admin_client, get_supabase_client, get_user_supabase_client
from src.core.security import decode_access_token
from src.core.ttl_cache import MISSING, lookups
from src.modules.auth.rbac import Role
from src.modules.auth.schemas import (
    AuthResponse,
    PasswordResetRequest,
    PasswordUpdateRequest,
    ProfileUpdateRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserLoginRequest,
    UserProfileResponse,
)

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self, anon_client: Client | None = None, admin_client: Client | None = None) -> None:
        self.anon_client = anon_client or get_supabase_client()
        self.admin_client = admin_client or get_supabase_admin_client()

    def login(self, payload: UserLoginRequest) -> AuthResponse:
        """
        Authenticates a user with email and password using Supabase Auth.
        Returns JWT access and refresh tokens.
        """
        try:
            res = self.anon_client.auth.sign_in_with_password({
                "email": payload.email,
                "password": payload.password,
            })

            if not res.user or not res.session:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password.",
                )

            user_id = str(res.user.id)
            user_profile = self.get_profile_by_id(
                user_id,
                default_email=res.user.email,
                default_name=(res.user.user_metadata or {}).get("full_name"),
                default_must_reset_password=bool(
                    (res.user.app_metadata or {}).get("must_reset_password")
                ),
            )

            if user_profile.tenant_id is None:
                # Signing in with the invited credentials proves the user owns the invite, so
                # activate the pending membership now; otherwise tenant_id stays null forever.
                user_profile = self._accept_pending_invitation(user_id, user_profile)

            client_role = (res.user.user_metadata or {}).get("client_role")
            if client_role:
                user_profile = user_profile.model_copy(update={"client_role": client_role})

            # The password was right, so say what is wrong rather than leaving the user guessing.
            if not user_profile.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Your account isn't active. Please contact your administrator.",
                )
            # Clients and account managers must belong to an active tenant to sign in.
            # A super admin works across every tenant, so belonging to one is not required.
            if user_profile.tenant_id is None and user_profile.role != Role.SUPER_ADMIN:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Your account isn't linked to an active organisation. Please contact your administrator.",
                )

            token_response = TokenResponse(
                access_token=res.session.access_token,
                refresh_token=res.session.refresh_token,
                expires_in=res.session.expires_in,
                expires_at=res.session.expires_at,
                token_type=res.session.token_type or "bearer",
            )

            return AuthResponse(
                user=user_profile,
                session=token_response,
                message="Login successful.",
            )

        except HTTPException:
            raise
        except Exception:
            logger.warning("Login failed", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )

    def refresh(self, payload: RefreshTokenRequest) -> TokenResponse:
        """
        Exchanges a Supabase refresh token for a newly minted access & refresh token pair.
        """
        try:
            res = self.anon_client.auth.refresh_session(payload.refresh_token)
            if not res.session:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired refresh token.",
                )

            return TokenResponse(
                access_token=res.session.access_token,
                refresh_token=res.session.refresh_token,
                expires_in=res.session.expires_in,
                expires_at=res.session.expires_at,
                token_type=res.session.token_type or "bearer",
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Refresh token error: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to refresh session.",
            )

    def logout(self, access_token: str) -> None:
        """
        Terminates the user's active session.
        """
        try:
            user_client = get_user_supabase_client(access_token)
            user_client.auth.sign_out()
        except Exception as e:
            logger.warning(f"Logout warning: {str(e)}")

    def request_password_reset(self, payload: PasswordResetRequest) -> None:
        """
        Sends a password recovery email to the registered address.
        """
        try:
            self.anon_client.auth.reset_password_for_email(
                payload.email,
                options={"redirect_to": f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?flow=recovery"},
            )
        except Exception as e:
            logger.error(f"Password reset request error: {str(e)}", exc_info=True)
            # Do not leak whether the email exists for security
            pass

    def update_profile(self, user: UserProfileResponse, payload: ProfileUpdateRequest) -> UserProfileResponse:
        """Edit the signed-in user's own name, email and mobile number."""
        changes: dict[str, Any] = {}
        if payload.full_name is not None:
            changes["full_name"] = payload.full_name
        if "mobile_number" in payload.model_fields_set:
            changes["mobile_number"] = payload.mobile_number or None
        if payload.email is not None and payload.email.lower() != user.email.lower():
            email = payload.email.lower()
            taken = self.admin_client.table("profiles").select("id").eq("email", email).neq("id", user.id).limit(1).execute().data
            if taken:
                raise HTTPException(status_code=409, detail="That email is already used by another account.")
            try:
                # The email is the sign-in name, so it must change in Supabase Auth as well as on the profile.
                self.admin_client.auth.admin.update_user_by_id(user.id, {"email": email, "email_confirm": True})
            except Exception as exc:
                logger.exception("Could not update user email")
                raise HTTPException(status_code=409, detail="That email could not be used. Try a different one.") from exc
            changes["email"] = email
        if changes:
            result = self.admin_client.table("profiles").update(changes).eq("id", user.id).select("id").execute()
            if not result.data:
                raise HTTPException(status_code=404, detail="User not found.")
        return self.get_profile_by_id(user.id, user.email, use_cache=False)

    def update_password(self, access_token: str, payload: PasswordUpdateRequest) -> None:
        """
        Updates the password for the authenticated user.
        """
        token_payload = decode_access_token(access_token)
        try:
            auth_user_response = self.admin_client.auth.admin.get_user_by_id(token_payload.sub)
            auth_user = getattr(auth_user_response, "user", None)
            if not auth_user:
                raise HTTPException(status_code=404, detail="User not found.")
            app_metadata = dict(auth_user.app_metadata or {})
            app_metadata.pop("must_reset_password", None)
            self.admin_client.auth.admin.update_user_by_id(
                token_payload.sub,
                {"password": payload.new_password, "app_metadata": app_metadata},
            )
            profile_update = (
                self.admin_client.table("profiles")
                .update({"must_reset_password": False})
                .eq("id", token_payload.sub)
                .select("id")
                .execute()
            )
            if not profile_update.data:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Password changed, but the account reset state could not be updated. Retry the reset.",
                )
        except HTTPException:
            raise
        except Exception:
            logger.error("Password update failed", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Could not update password.",
            )

    def get_profile_by_id(
        self,
        user_id: str,
        default_email: str | None = None,
        default_name: str | None = None,
        default_must_reset_password: bool = False,
        *,
        use_cache: bool = True,
    ) -> UserProfileResponse:
        """
        The user's profile, remembered for ``AUTH_CACHE_SECONDS`` so a burst of requests (one screen
        makes several) reads the database once. Any successful write clears it. Pass
        ``use_cache=False`` to force a fresh read, e.g. right after accepting an invitation.
        """
        key = ("profile", user_id)
        ttl = settings.AUTH_CACHE_SECONDS
        if use_cache:
            cached = lookups.get(key, ttl)
            if cached is not MISSING:
                return cached
        profile, from_database = self._read_profile(user_id, default_email, default_name, default_must_reset_password)
        if from_database:  # never remember the stand-in profile used when the read failed
            lookups.set(key, profile)
        return profile

    def _read_profile(
        self,
        user_id: str,
        default_email: str | None,
        default_name: str | None,
        default_must_reset_password: bool,
    ) -> tuple[UserProfileResponse, bool]:
        """
        Fetches the public.profiles record for a user.
        Falls back gracefully if the database trigger has slight eventual consistency latency.
        """
        try:
            # Use admin client to ensure we can read the profile across schema boundaries
            record = self._profile_record(user_id)
            if record:
                tenant_id, tenant_name = (
                    self._active_tenant_info_from(record["tenant_memberships"])
                    if "tenant_memberships" in record
                    else (self._get_active_tenant_id(user_id), None)
                )
                return UserProfileResponse(
                    id=record["id"],
                    email=record.get("email") or default_email or "",
                    full_name=record.get("full_name") or default_name,
                    avatar_url=record.get("avatar_url"),
                    mobile_number=record.get("mobile_number"),
                    role=record.get("role", "CLIENT"),
                    is_active=record.get("is_active", True),
                    must_reset_password=record.get(
                        "must_reset_password", default_must_reset_password
                    ),
                    # Only a client's access depends on this. Staff get their home tenant for
                    # information; their access comes from their role and assignments.
                    tenant_id=tenant_id,
                    tenant_name=tenant_name,
                    created_at=record.get("created_at"),
                    updated_at=record.get("updated_at"),
                ), True
        except Exception as e:
            logger.warning(f"Could not fetch profile from public.profiles table: {str(e)}")

        # Fallback profile using known attributes
        return UserProfileResponse(
            id=user_id,
            email=default_email or "",
            full_name=default_name,
            role="CLIENT",
            is_active=True,
            must_reset_password=default_must_reset_password,
        ), False

    def _profile_record(self, user_id: str) -> dict | None:
        """The profile and its membership in one round trip; two separate reads if the join is unavailable."""
        try:
            response = (
                self.admin_client.table("profiles")
                .select("*,tenant_memberships(tenant_id,status,tenants(status,name))")
                .eq("id", user_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            logger.warning("Joined profile read failed, falling back to two reads: %s", exc)
            response = self.admin_client.table("profiles").select("*").eq("id", user_id).limit(1).execute()
        return response.data[0] if response.data else None

    @staticmethod
    def _active_tenant_from(memberships: object) -> str | None:
        """The tenant of an ACTIVE membership whose tenant is ACTIVE too."""
        tenant_id, _ = AuthService._active_tenant_info_from(memberships)
        return tenant_id

    @staticmethod
    def _active_tenant_info_from(memberships: object) -> tuple[str | None, str | None]:
        """The (tenant_id, tenant_name) of an ACTIVE membership whose tenant is ACTIVE too."""
        if isinstance(memberships, dict):
            memberships = [memberships]
        for membership in memberships or []:
            tenant = membership.get("tenants")
            tenant_status = tenant.get("status") if isinstance(tenant, dict) else None
            if membership.get("status") == "ACTIVE" and tenant_status == "ACTIVE":
                name = tenant.get("name") if isinstance(tenant, dict) else None
                return str(membership["tenant_id"]), (str(name) if name else None)
        return None, None

    def _accept_pending_invitation(self, user_id: str, profile: UserProfileResponse) -> UserProfileResponse:
        """Activate an unaccepted invitation and reload the profile; unchanged if there is nothing to accept."""
        try:
            self.admin_client.rpc("accept_tenant_invitation", {"p_user_id": user_id}).execute()
        except Exception as exc:
            logger.info("RPC accept_tenant_invitation failed for %s (%s) — trying direct membership promotion", user_id, exc)
            # Fallback: the invitation may already be ACCEPTED (admin-created users) but the
            # membership row was never promoted from INVITED to ACTIVE.  Promote it directly.
            try:
                result = (
                    self.admin_client.table("tenant_memberships")
                    .update({"status": "ACTIVE"})
                    .eq("user_id", user_id)
                    .eq("status", "INVITED")
                    .execute()
                )
                if not result.data:
                    logger.warning("No INVITED membership found to promote for user %s", user_id)
                    return profile
                self.admin_client.table("profiles").update({"is_active": True}).eq("id", user_id).execute()
            except Exception as fallback_exc:
                logger.warning("Direct membership promotion also failed for user %s: %s", user_id, fallback_exc)
                return profile
        return self.get_profile_by_id(
            user_id,
            default_email=profile.email,
            default_name=profile.full_name,
            default_must_reset_password=profile.must_reset_password,
            use_cache=False,
        )

    def _get_active_tenant_id(self, user_id: str) -> str | None:
        """Resolve the client's tenant from its active server-side membership."""
        try:
            response = (
                self.admin_client.table("tenant_memberships")
                .select("tenant_id,tenants!inner(status)")
                .eq("user_id", user_id)
                .eq("status", "ACTIVE")
                .eq("tenants.status", "ACTIVE")
                .limit(1)
                .execute()
            )
            if response.data:
                return str(response.data[0]["tenant_id"])
        except Exception as exc:
            logger.warning("Could not resolve tenant membership: %s", exc)
        return None


auth_service = AuthService()
