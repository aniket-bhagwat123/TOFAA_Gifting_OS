"""Tenant-scoped user and invitation use cases."""

import hmac
import logging
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4
from fastapi import HTTPException, status
from supabase import Client

from src.core import images
from src.core.config import settings
from src.core.pagination import PaginationMeta, next_page_cursor
from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Permission, Role, require_permission
from src.modules.auth.schemas import UserProfileResponse
from src.modules.tenants.models import TenantType
from src.modules.tenants.service import tenant_service
from src.modules.users.models import MembershipStatus, UserRole
from src.modules.users.email import user_email_service
from src.modules.users.schemas import SuperAdminBootstrap, KamOption, UserInviteCreate, UserInviteRead, UserList, UserRead, UserUpdate

logger = logging.getLogger(__name__)

# Long enough for a new user to sign in after a weekend or a failed first email.
INVITATION_TTL = timedelta(days=7)


class UserService:
    """Create tenant-bound users through invitations and enforce tenant scope."""

    def __init__(self, database: Client | None = None) -> None:
        self.database = database or get_supabase_admin_client()

    def list_users(
        self,
        tenant_id: str,
        actor: UserProfileResponse,
        *,
        page: int,
        limit: int,
    ) -> UserList:
        require_permission(actor, Permission.USER_READ)
        tenant_service.require_access(tenant_id, actor)
        offset = (page - 1) * limit
        result = (
            self._user_query(tenant_id, count="exact", clients_only=actor.role != Role.SUPER_ADMIN)
            .order("created_at", desc=True)
            .order("user_id", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        rows = result.data or []
        total_records = result.count or 0
        return UserList(
            items=[self._to_user(row) for row in rows],
            pagination=PaginationMeta(page=page, limit=limit, total_records=total_records),
            next_cursor=next_page_cursor(page, limit, total_records),
        )

    def list_active_kams(self, actor: UserProfileResponse) -> list[KamOption]:
        """Return active KAM profiles for client provisioning."""
        require_permission(actor, Permission.CLIENT_PROVISION)
        result = (
            self.database.table("profiles")
            .select("id,email,full_name")
            .eq("role", "KAM")
            .eq("is_active", True)
            .order("email")
            .execute()
        )
        return [KamOption.model_validate(row) for row in result.data or []]

    def bootstrap_super_admin(self, secret: str | None, payload: SuperAdminBootstrap) -> dict[str, str]:
        """Create the first super admin. Needs BOOTSTRAP_SECRET and refuses once one exists."""
        if not settings.BOOTSTRAP_SECRET:
            raise HTTPException(status_code=404, detail="Not found.")
        if not secret or not hmac.compare_digest(secret, settings.BOOTSTRAP_SECRET):
            raise HTTPException(status_code=403, detail="Invalid bootstrap secret.")
        existing = self.database.table("profiles").select("id").eq("role", "SUPER_ADMIN").limit(1).execute()
        if existing.data:
            raise HTTPException(status_code=409, detail="A super admin already exists.")

        email = payload.email.strip().lower()
        invitation = self.database.table("tenant_invitations").insert(
            {
                "tenant_id": tenant_service.internal_tenant_id(),
                "normalized_email": email,
                "full_name": payload.full_name,
                "role": "SUPER_ADMIN",
                "status": "PENDING",
                "invited_by_user_id": None,
                "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            }
        ).execute().data[0]
        try:
            created = self.database.auth.admin.create_user(
                {
                    "email": email,
                    "password": payload.password,
                    "email_confirm": True,
                    "user_metadata": {"full_name": payload.full_name or ""},
                }
            )
            user_id = str(created.user.id)
            self.database.table("tenant_invitations").update({"status": "SENT", "user_id": user_id}).eq(
                "id", invitation["id"]
            ).execute()
            self.database.rpc("accept_tenant_invitation", {"p_user_id": user_id}).execute()
        except Exception as exc:
            logger.exception("Could not bootstrap super admin")
            self.database.table("tenant_invitations").update({"status": "FAILED"}).eq(
                "id", invitation["id"]
            ).execute()
            raise HTTPException(status_code=409, detail="Could not create the super admin. Check the logs.") from exc
        return {"id": user_id, "email": email, "role": "SUPER_ADMIN"}

    def create_invitation(
        self,
        tenant_id: str,
        payload: UserInviteCreate,
        actor: UserProfileResponse,
    ) -> UserInviteRead:
        require_permission(actor, Permission.USER_INVITE)
        tenant_service.require_access(tenant_id, actor)
        if payload.role != UserRole.CLIENT:
            require_permission(actor, Permission.USER_INVITE_PLATFORM)
        tenant = tenant_service.get(tenant_id, actor)
        if tenant.status.value == "DEACTIVATED":
            raise HTTPException(status_code=409, detail="Cannot invite users to a deactivated tenant.")
        # Staff belong to the TOFAA team and nobody else does; mixing them would leak access.
        if (tenant.tenant_type == TenantType.INTERNAL) != (payload.role != UserRole.CLIENT):
            raise HTTPException(
                status_code=422,
                detail="Team members join the TOFAA team, and client users join a client.",
            )
        if payload.send_invitation:
            user_email_service.ensure_configured()

        email = payload.email.strip().lower()
        expires_at = datetime.now(timezone.utc) + INVITATION_TTL
        try:
            invitation_result = self.database.table("tenant_invitations").insert(
                {
                    "tenant_id": tenant_id,
                    "normalized_email": email,
                    "full_name": payload.full_name,
                    "role": payload.role.value,
                    "status": "PENDING",
                    "invited_by_user_id": actor.id,
                    "expires_at": expires_at.isoformat(),
                }
            ).execute()
        except Exception as exc:
            logger.exception("Could not create tenant invitation")
            raise HTTPException(
                status_code=409,
                detail="A pending account or invitation already exists for this email.",
            ) from exc
        if not invitation_result.data:
            raise HTTPException(status_code=500, detail="Invitation could not be prepared.")
        invitation = invitation_result.data[0]

        try:
            temporary_password = payload.password or self._generate_temporary_password()
            auth_result = self.database.auth.admin.create_user(
                {
                    "email": email,
                    "password": temporary_password,
                    "email_confirm": True,
                    "user_metadata": {"full_name": payload.full_name or ""},
                }
            )
            invited_user = getattr(auth_result, "user", None)
            invited_user_id = str(invited_user.id) if invited_user else None
            if not invited_user_id:
                raise RuntimeError("Supabase did not return the created user.")
            if payload.send_invitation:
                link_result = self.database.auth.admin.generate_link(
                    {
                        "type": "recovery",
                        "email": email,
                        "options": {
                            "redirect_to": f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?flow=invite"
                        },
                    }
                )
                user_email_service.send_temporary_password(
                    email=email,
                    full_name=payload.full_name,
                    temporary_password=temporary_password,
                    reset_url=link_result.properties.action_link,
                    idempotency_key=f"tenant-invite/{invitation['id']}/{uuid4().hex}",
                )
            sent_values = {"status": "SENT", "user_id": invited_user_id}
            if payload.send_invitation:
                sent_values["sent_at"] = datetime.now(timezone.utc).isoformat()
            update_result = (
                self.database.table("tenant_invitations").update(sent_values).eq("id", invitation["id"]).execute()
            )
            sent_record = update_result.data[0] if update_result.data else invitation
            if not payload.send_invitation:
                # Nobody is emailed and the administrator hands over the password, so the account works at
                # once instead of waiting for a first sign-in that could come after the invitation expires.
                self.database.rpc("accept_tenant_invitation", {"p_user_id": invited_user_id}).execute()
                sent_record = {**sent_record, "status": "ACCEPTED"}
        except Exception as exc:
            logger.exception("Could not send tenant invitation")
            self.database.table("tenant_invitations").update({"status": "FAILED"}).eq(
                "id", invitation["id"]
            ).execute()
            if "already been registered" in str(exc).lower():
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "This email already has a Supabase account, likely from an earlier invitation attempt. "
                        f"List users for tenant {tenant_id}, then resend the existing invitation with "
                        "POST /api/v1/tenants/{tenant_id}/users/{user_id}/resend-invite."
                    ),
                ) from exc
            if getattr(exc, "code", None) == "PGRST204":
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Tenant invitation setup is incomplete in Supabase. Apply migration "
                        "20261030100000_temporary_password_reset.sql, then resend this invitation."
                    ),
                ) from exc
            if isinstance(exc, HTTPException):
                raise exc
            raise HTTPException(
                status_code=409,
                detail="Invitation could not be sent. Check the address or resend after resolving the issue.",
            ) from exc
        return UserInviteRead(
            invitation_id=sent_record["id"],
            tenant_id=tenant_id,
            email=email,
            status=sent_record["status"],
            expires_at=sent_record["expires_at"],
        )

    def get_user(self, tenant_id: str, user_id: str, actor: UserProfileResponse) -> UserRead:
        require_permission(actor, Permission.USER_READ)
        tenant_service.require_access(tenant_id, actor)
        result = (
            self._user_query(tenant_id, clients_only=actor.role != Role.SUPER_ADMIN)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found.")
        return self._to_user(result.data[0])

    def update_user(
        self,
        tenant_id: str,
        user_id: str,
        payload: UserUpdate,
        actor: UserProfileResponse,
    ) -> UserRead:
        require_permission(actor, Permission.USER_UPDATE)
        tenant_service.require_access(tenant_id, actor)
        self.get_user(tenant_id, user_id, actor)
        changes = payload.model_dump(mode="json", exclude_unset=True, exclude={"password"})
        if payload.password:
            self._set_password(user_id, payload.password)
            changes["must_reset_password"] = False
        result = self.database.table("profiles").update(changes).eq("id", user_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found.")
        return self.get_user(tenant_id, user_id, actor)

    def set_avatar(self, user_id: str, *, content: bytes | None, content_type: str = "") -> UserProfileResponse:
        """Save (or, with no content, remove) a user's profile picture. Callers check who may do this."""
        rows = self.database.table("profiles").select("*").eq("id", user_id).limit(1).execute().data
        if not rows:
            raise HTTPException(status_code=404, detail="User not found.")
        url = images.store_image(self.database, f"users/{user_id}", content, content_type) if content is not None else None
        result = self.database.table("profiles").update({"avatar_url": url}).eq("id", user_id).execute()
        if not result.data:
            images.remove_image(self.database, url)
            raise HTTPException(status_code=404, detail="User not found.")
        images.remove_image(self.database, rows[0].get("avatar_url"))
        return UserProfileResponse.model_validate(result.data[0])

    def set_member_avatar(
        self, tenant_id: str, user_id: str, actor: UserProfileResponse, *, content: bytes | None, content_type: str = ""
    ) -> UserRead:
        """A tenant admin changes a team member's picture (people change their own through /me/avatar)."""
        require_permission(actor, Permission.USER_UPDATE)
        tenant_service.require_access(tenant_id, actor)
        self.get_user(tenant_id, user_id, actor)
        self.set_avatar(user_id, content=content, content_type=content_type)
        return self.get_user(tenant_id, user_id, actor)

    def _set_password(self, user_id: str, password: str) -> None:
        """Replace a user's password."""
        try:
            auth_user = getattr(self.database.auth.admin.get_user_by_id(user_id), "user", None)
            if not auth_user:
                raise HTTPException(status_code=404, detail="User not found.")
            app_metadata = dict(auth_user.app_metadata or {})
            app_metadata.pop("must_reset_password", None)
            self.database.auth.admin.update_user_by_id(user_id, {"password": password, "app_metadata": app_metadata})
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Could not update user password")
            raise HTTPException(status_code=502, detail="The password could not be updated. Please try again.") from exc

    def activate_user(self, tenant_id: str, user_id: str, actor: UserProfileResponse) -> None:
        require_permission(actor, Permission.USER_ACTIVATE)
        self._set_user_active(tenant_id, user_id, actor, is_active=True)

    def deactivate_user(self, tenant_id: str, user_id: str, actor: UserProfileResponse) -> None:
        require_permission(actor, Permission.USER_DEACTIVATE)
        self._set_user_active(tenant_id, user_id, actor, is_active=False)

    def _set_user_active(
        self,
        tenant_id: str,
        user_id: str,
        actor: UserProfileResponse,
        *,
        is_active: bool,
    ) -> None:
        tenant_service.require_access(tenant_id, actor)
        if user_id == actor.id and not is_active:
            raise HTTPException(status_code=409, detail="You can't deactivate your own account.")
        self.get_user(tenant_id, user_id, actor)
        try:
            result = (
                self.database.table("profiles")
                .update({"is_active": is_active})
                .eq("id", user_id)
                .select("id")
                .execute()
            )
        except Exception as exc:
            action = "activate" if is_active else "deactivate"
            logger.exception("Could not %s tenant user", action)
            raise HTTPException(status_code=409, detail=f"User could not be {action}d.") from exc
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found.")

    def resend_invitation(self, tenant_id: str, user_id: str, actor: UserProfileResponse) -> UserInviteRead:
        require_permission(actor, Permission.USER_RESEND_INVITE)
        tenant_service.require_access(tenant_id, actor)
        user = self.get_user(tenant_id, user_id, actor)
        membership = (
            self.database.table("tenant_memberships")
            .select("status")
            .eq("tenant_id", tenant_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not membership.data:
            raise HTTPException(status_code=404, detail="User membership not found.")
        if membership.data[0]["status"] != MembershipStatus.INVITED:
            raise HTTPException(status_code=409, detail="Only pending invitations can be resent.")
        user_email_service.ensure_configured()
        result = (
            self.database.table("tenant_invitations")
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("user_id", user_id)
            .in_("status", ["SENT", "FAILED"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Pending invitation not found.")
        invitation = result.data[0]
        expires_at = datetime.now(timezone.utc) + INVITATION_TTL
        self.database.table("tenant_invitations").update(
            {"status": "PENDING", "expires_at": expires_at.isoformat()}
        ).eq("id", invitation["id"]).execute()
        try:
            temporary_password = self._generate_temporary_password()
            auth_user_response = self.database.auth.admin.get_user_by_id(user_id)
            auth_user = getattr(auth_user_response, "user", None)
            if not auth_user:
                raise RuntimeError("Could not load the invited authentication user.")
            app_metadata = dict(auth_user.app_metadata or {})
            app_metadata.pop("must_reset_password", None)
            self.database.auth.admin.update_user_by_id(
                user_id,
                {"password": temporary_password, "app_metadata": app_metadata},
            )
            self.database.table("profiles").update({"must_reset_password": False}).eq("id", user_id).execute()
            link_result = self.database.auth.admin.generate_link(
                {
                    "type": "recovery",
                    "email": user.email,
                    "options": {
                        "redirect_to": f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?flow=invite"
                    },
                }
            )
            user_email_service.send_temporary_password(
                email=user.email,
                full_name=user.full_name,
                temporary_password=temporary_password,
                reset_url=link_result.properties.action_link,
                idempotency_key=f"tenant-invite-resend/{invitation['id']}/{uuid4().hex}",
            )
            sent_result = (
                self.database.table("tenant_invitations")
                .update({"status": "SENT", "sent_at": datetime.now(timezone.utc).isoformat()})
                .eq("id", invitation["id"])
                .execute()
            )
            sent = sent_result.data[0] if sent_result.data else invitation
        except Exception as exc:
            logger.exception("Could not resend tenant invitation")
            self.database.table("tenant_invitations").update({"status": "FAILED"}).eq(
                "id", invitation["id"]
            ).execute()
            if getattr(exc, "code", None) == "PGRST204":
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Tenant invitation setup is incomplete in Supabase. Apply migration "
                        "20261030100000_temporary_password_reset.sql, then resend this invitation."
                    ),
                ) from exc
            if isinstance(exc, HTTPException):
                raise exc
            raise HTTPException(status_code=409, detail="Invitation could not be resent.") from exc
        return UserInviteRead(
            invitation_id=sent["id"],
            tenant_id=tenant_id,
            email=user.email,
            status=sent["status"],
            expires_at=sent["expires_at"],
        )

    def accept_invitation(self, user_id: str) -> UserRead:
        try:
            result = self.database.rpc("accept_tenant_invitation", {"p_user_id": user_id}).execute()
        except Exception as exc:
            logger.exception("Could not accept tenant invitation")
            raise HTTPException(status_code=409, detail="Invitation cannot be accepted.") from exc
        if result.data is False:
            raise HTTPException(status_code=409, detail="Invitation cannot be accepted.")
        membership = (
            self.database.table("tenant_memberships")
            .select("tenant_id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not membership.data:
            raise HTTPException(status_code=404, detail="Invitation not found.")
        result = self._user_query(membership.data[0]["tenant_id"]).eq("user_id", user_id).limit(1).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Invitation not found.")
        return self._to_user(result.data[0])

    def _user_query(self, tenant_id: str, *, count: str | None = None, clients_only: bool = False) -> Any:
        """Select a tenant's members. Every profile has a home tenant, including platform staff, so
        ``clients_only`` keeps staff out of reach: a client who could see a super admin here could
        also reset their password and take over every tenant."""
        query = (
            self.database.table("tenant_memberships")
            .select(
                "tenant_id,user_id,status,created_at,updated_at,"
                "profiles!inner(id,email,full_name,avatar_url,role,is_active,created_at,updated_at),"
                "tenants!inner(status)",
                count=count,
            )
            .eq("tenant_id", tenant_id)
        )
        return query.eq("profiles.role", UserRole.CLIENT.value) if clients_only else query

    @staticmethod
    def _to_user(row: dict[str, Any]) -> UserRead:
        profile = row["profiles"]
        return UserRead(
            id=profile["id"],
            tenant_id=row["tenant_id"],
            email=profile["email"],
            full_name=profile.get("full_name"),
            avatar_url=profile.get("avatar_url"),
            role=profile["role"],
            is_active=profile["is_active"],
            tenant_status=row["tenants"]["status"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _generate_temporary_password() -> str:
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*_-+="
        characters = [
            secrets.choice(string.ascii_uppercase),
            secrets.choice(string.ascii_lowercase),
            secrets.choice(string.digits),
            secrets.choice("!@#$%^&*_-+="),
            *(secrets.choice(alphabet) for _ in range(20)),
        ]
        secrets.SystemRandom().shuffle(characters)
        return "".join(characters)


user_service = UserService()
