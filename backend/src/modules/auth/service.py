import logging
from typing import Any
from fastapi import HTTPException, status
from supabase import Client

from src.core.config import settings
from src.core.supabase import get_supabase_admin_client, get_supabase_client, get_user_supabase_client
from src.core.security import decode_access_token
from src.modules.auth.rbac import Role
from src.modules.auth.schemas import (
    AuthResponse,
    PasswordResetRequest,
    PasswordUpdateRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserLoginRequest,
    UserProfileResponse,
    UserRegisterRequest,
)

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self, anon_client: Client | None = None, admin_client: Client | None = None) -> None:
        self.anon_client = anon_client or get_supabase_client()
        self.admin_client = admin_client or get_supabase_admin_client()

    def register(self, payload: UserRegisterRequest) -> AuthResponse:
        """
        Registers a new user in Supabase Auth.
        The PostgreSQL trigger 'on_auth_user_created' automatically synchronizes public.profiles.
        """
        try:
            sign_up_options: dict[str, Any] = {
                "data": {
                    "full_name": payload.full_name or "",
                }
            }
            res = self.anon_client.auth.sign_up({
                "email": payload.email,
                "password": payload.password,
                "options": sign_up_options,
            })
            
            if not res.user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to register user.",
                )

            user_id = str(res.user.id)
            user_profile = self.get_profile_by_id(user_id, default_email=payload.email, default_name=payload.full_name)

            token_response = None
            message = "Registration successful."
            if res.session:
                token_response = TokenResponse(
                    access_token=res.session.access_token,
                    refresh_token=res.session.refresh_token,
                    expires_in=res.session.expires_in,
                    expires_at=res.session.expires_at,
                    token_type=res.session.token_type or "bearer",
                )
            else:
                message = "Registration successful. Please verify your email if required."

            return AuthResponse(user=user_profile, session=token_response, message=message)

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Sign up error: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Registration failed: {str(e)}",
            )

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

            if not user_profile.is_active:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password.",
                )

            if (
                user_profile.role == Role.CLIENT
                and user_profile.tenant_id is None
                and not user_profile.must_reset_password
            ):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password.",
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
                detail=f"Unable to refresh session: {str(e)}",
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
    ) -> UserProfileResponse:
        """
        Fetches the public.profiles record for a user.
        Falls back gracefully if the database trigger has slight eventual consistency latency.
        """
        try:
            # Use admin client to ensure we can read the profile across schema boundaries
            response = self.admin_client.table("profiles").select("*").eq("id", user_id).limit(1).execute()
            if response.data and len(response.data) > 0:
                record = response.data[0]
                return UserProfileResponse(
                    id=record["id"],
                    email=record.get("email") or default_email or "",
                    full_name=record.get("full_name") or default_name,
                    avatar_url=record.get("avatar_url"),
                    role=record.get("role", "CLIENT"),
                    is_active=record.get("is_active", True),
                    must_reset_password=record.get(
                        "must_reset_password", default_must_reset_password
                    ),
                    tenant_id=self._get_active_tenant_id(user_id),
                    created_at=record.get("created_at"),
                    updated_at=record.get("updated_at"),
                )
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
