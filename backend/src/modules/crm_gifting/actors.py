"""The Gifting OS identity of a CRM user, so history shows who acted from the CRM.

Gift request history needs a Gifting OS user id. Each CRM user who acts gets one hidden account, made on their
first action: an internal TOFAA profile that is inactive and banned from signing in, with an address that cannot
receive mail. It is only ever created when CRM_KAM_ACTIONS_ENABLED is on.
"""

import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Role
from src.modules.auth.schemas import UserProfileResponse
from src.modules.tenants.service import tenant_service

log = logging.getLogger(__name__)
DOMAIN = "crm.invalid"  # ".invalid" is reserved: no mail can ever be delivered to it
BAN = "876000h"  # 100 years


def email_for(crm_user_id: str) -> str:
    return f"crm-{crm_user_id.lower()}@{DOMAIN}"


class CrmActors:
    @property
    def db(self):
        return get_supabase_admin_client()

    def get(self, crm_user_id: str, name: str) -> UserProfileResponse:
        email = email_for(crm_user_id)
        full_name = f"{name.strip() or 'TOFAA team'} (TOFAA CRM)"[:120]
        rows = self.db.table("profiles").select("id,full_name").eq("email", email).limit(1).execute().data or []
        if rows:
            user_id = str(rows[0]["id"])
            if rows[0].get("full_name") != full_name:
                self.db.table("profiles").update({"full_name": full_name}).eq("id", user_id).execute()
        else:
            user_id = self._create(email, full_name)
        # Not a sign-in profile: it only names the author and passes the staff checks for this one request.
        return UserProfileResponse(id=user_id, email=email, full_name=full_name, role=Role.KAM, is_active=True)

    def _create(self, email: str, full_name: str) -> str:
        db = self.db
        # The database only allows a new user that has a pending invitation.
        invitation = db.table("tenant_invitations").insert({
            "tenant_id": tenant_service.internal_tenant_id(), "normalized_email": email, "full_name": full_name,
            "role": "KAM", "status": "PENDING", "invited_by_user_id": None,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        }).execute().data[0]
        try:
            created = db.auth.admin.create_user({
                "email": email, "password": secrets.token_urlsafe(48), "email_confirm": True,
                "ban_duration": BAN, "user_metadata": {"full_name": full_name},
            })
            user_id = str(created.user.id)
            db.table("profiles").update({"is_active": False}).eq("id", user_id).execute()
        except Exception as exc:
            log.exception("Could not create the Gifting OS identity for a CRM user")
            db.table("tenant_invitations").update({"status": "FAILED"}).eq("id", invitation["id"]).execute()
            raise HTTPException(status_code=502, detail="Gifting OS could not set up your identity. Ask an administrator to check the logs.") from exc
        db.table("tenant_invitations").update({"status": "ACCEPTED", "user_id": user_id}).eq("id", invitation["id"]).execute()
        return user_id


crm_actors = CrmActors()
