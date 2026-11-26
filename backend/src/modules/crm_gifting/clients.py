"""Client organisations set up from TOFAA CRM: create one, see its users, invite one.

Creating and inviting need CRM_KAM_ACTIONS_ENABLED. The CRM decides who may ask (creating is for CRM admins).
Inviting sends that person an email with a temporary password, as it does from the Gifting OS screens.
"""

from typing import Any

from fastapi import HTTPException

from src.core import audit
from src.core.config import settings
from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Role
from src.modules.crm_gifting.actors import crm_actors
from src.modules.tenants.models import TenantType
from src.modules.tenants.schemas import TenantCreate
from src.modules.tenants.service import tenant_service
from src.modules.users.schemas import UserInviteCreate
from src.modules.users.service import user_service

SWITCHED_OFF = "Acting from the CRM is switched off in Gifting OS."


def literal_pattern(text: str) -> str:
    """For ILIKE: match this text itself, so a name containing % or _ is not read as a wildcard."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class CrmClientsService:
    def __init__(self, database=None, actors=None, tenants=None, users=None) -> None:
        self._database = database
        self.actors = actors or crm_actors
        self.tenants = tenants or tenant_service
        self.users = users or user_service

    @property
    def db(self):
        return self._database or get_supabase_admin_client()

    def _check_enabled(self) -> None:
        if not settings.CRM_KAM_ACTIONS_ENABLED:
            raise HTTPException(status_code=403, detail=SWITCHED_OFF)

    def status(self, tenant_id: str) -> dict[str, Any]:
        rows = (self.db.table("tenants").select("id,name,status").eq("id", tenant_id)
                .neq("tenant_type", TenantType.INTERNAL.value).limit(1).execute().data or [])
        if not rows:
            raise HTTPException(status_code=404, detail="Client not found in Gifting OS.")
        members = self.db.table("tenant_memberships").select("user_id,status").eq("tenant_id", tenant_id).limit(200).execute().data or []
        ids = [m["user_id"] for m in members]
        found = self.db.table("profiles").select("id,email,full_name,role").in_("id", ids).execute().data or [] if ids else []
        profiles = {p["id"]: p for p in found}
        users = [{"email": p.get("email"), "fullName": p.get("full_name"), "status": m["status"]}
                 for m in members if (p := profiles.get(m["user_id"])) and p.get("role") == Role.CLIENT.value]
        return {"name": rows[0]["name"], "status": rows[0]["status"], "users": users, "actionsEnabled": settings.CRM_KAM_ACTIONS_ENABLED}

    def create(self, name: str, *, crm_user_id: str, crm_user_name: str) -> dict[str, Any]:
        """A new client organisation. One with exactly this name is returned instead, so a retry never makes two."""
        self._check_enabled()
        name = name.strip()
        found = (self.db.table("tenants").select("id").ilike("name", literal_pattern(name))
                 .neq("tenant_type", TenantType.INTERNAL.value).limit(2).execute().data or [])
        if len(found) > 1:
            raise HTTPException(status_code=409, detail="Gifting OS has more than one client with this name. Ask an administrator to sort them out first.")
        if found:
            return {"tenantId": str(found[0]["id"]), "created": False}
        # Only a super admin may create clients; the CRM allows this for its admins only.
        actor = self.actors.get(crm_user_id, crm_user_name).model_copy(update={"role": Role.SUPER_ADMIN})
        made = self.tenants.create(TenantCreate(tenant_type=TenantType.ORGANIZATION, name=name), actor)
        audit.note(actor, made.id)
        return {"tenantId": made.id, "created": True}

    def invite(
        self, tenant_id: str, email: str, full_name: str | None, client_role: str,
        *, crm_user_id: str, crm_user_name: str,
    ) -> dict[str, Any]:
        self._check_enabled()
        payload = UserInviteCreate(email=email, full_name=full_name, client_role=client_role)
        actor = self.actors.get(crm_user_id, crm_user_name)
        audit.note(actor, tenant_id)
        self.users.create_invitation(tenant_id, payload, actor)
        return {"email": payload.email.strip().lower()}


crm_clients_service = CrmClientsService()
