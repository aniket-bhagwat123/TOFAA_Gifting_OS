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
from src.modules.tenants.models import TenantStatus, TenantType
from src.modules.tenants.schemas import TenantCreate, TenantUpdate
from src.modules.tenants.service import tenant_service
from src.modules.users.schemas import UserInviteCreate, UserUpdate
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
        rows = (self.db.table("tenants").select("id,name,status,legal_name,gstin,email_domain,logo_url").eq("id", tenant_id)
                .neq("tenant_type", TenantType.INTERNAL.value).limit(1).execute().data or [])
        if not rows:
            raise HTTPException(status_code=404, detail="Client not found in Gifting OS.")
        members = self.db.table("tenant_memberships").select("user_id,status").eq("tenant_id", tenant_id).limit(200).execute().data or []
        ids = [m["user_id"] for m in members]
        found = self.db.table("profiles").select("id,email,full_name,role").in_("id", ids).execute().data or [] if ids else []
        profiles = {p["id"]: p for p in found}
        users = [{"userId": str(m["user_id"]), "email": p.get("email"), "fullName": p.get("full_name"), "status": m["status"], "clientRole": self._client_role(m["user_id"])}
                 for m in members if (p := profiles.get(m["user_id"])) and p.get("role") == Role.CLIENT.value]
        row = rows[0]
        return {"name": row["name"], "status": row["status"], "legalName": row.get("legal_name"), "gstin": row.get("gstin"),
                "emailDomain": row.get("email_domain"), "logoUrl": row.get("logo_url"), "users": users,
                "actionsEnabled": settings.CRM_KAM_ACTIONS_ENABLED}

    def _as_admin(self, tenant_id: str, crm_user_id: str, crm_user_name: str):
        """The CRM person, acting with the rights the CRM has already checked."""
        self._check_enabled()
        self.status(tenant_id)  # a real client, else "not found"
        actor = self.actors.get(crm_user_id, crm_user_name).model_copy(update={"role": Role.SUPER_ADMIN})
        audit.note(actor, tenant_id)
        return actor

    def change_details(self, tenant_id: str, changes: dict[str, Any], *, crm_user_id: str, crm_user_name: str) -> dict[str, Any]:
        """Legal name, GSTIN and email domain, with the same checks as the Gifting OS screen. None clears a value."""
        actor = self._as_admin(tenant_id, crm_user_id, crm_user_name)
        self.tenants.update(tenant_id, TenantUpdate(**changes), actor)
        return self.status(tenant_id)

    def change_logo(self, tenant_id: str, content: bytes | None, content_type: str, *, crm_user_id: str, crm_user_name: str) -> dict[str, Any]:
        actor = self._as_admin(tenant_id, crm_user_id, crm_user_name)
        self.tenants.set_logo(tenant_id, actor, content=content, content_type=content_type)
        return self.status(tenant_id)

    def change_user(self, tenant_id: str, user_id: str, changes: dict[str, Any], *, crm_user_id: str, crm_user_name: str) -> dict[str, Any]:
        """A client login's name, role, or whether it can sign in. Only logins of this client."""
        actor = self._as_admin(tenant_id, crm_user_id, crm_user_name)
        if user_id not in {u["userId"] for u in self.status(tenant_id)["users"]}:
            raise HTTPException(status_code=404, detail="That login is not one of this client's.")
        self.users.update_user(tenant_id, user_id, UserUpdate(**changes), actor)
        return self.status(tenant_id)

    def _client_role(self, user_id: str) -> str | None:
        """OWNER, EA or HR, kept with the sign-in account. Left out when it cannot be read."""
        try:
            return (self.db.auth.admin.get_user_by_id(user_id).user.user_metadata or {}).get("client_role")
        except Exception:  # noqa: BLE001 - the role is only a label
            return None

    def list_all(self) -> dict[str, Any]:
        """Every client, for the CRM to keep its client accounts in step."""
        rows = (self.db.table("tenants").select("id,name,status,logo_url").neq("tenant_type", TenantType.INTERNAL.value)
                .order("created_at").limit(1000).execute().data or [])
        return {"items": rows}

    def change(self, tenant_id: str, *, name: str | None, active: bool | None, crm_user_id: str, crm_user_name: str) -> dict[str, Any]:
        """A rename or on/off switch made in the CRM. Nothing is deleted."""
        self._check_enabled()
        current = self.status(tenant_id)
        actor = self.actors.get(crm_user_id, crm_user_name).model_copy(update={"role": Role.SUPER_ADMIN})
        audit.note(actor, tenant_id)
        if name and name.strip() != current["name"]:
            taken = (self.db.table("tenants").select("id").ilike("name", literal_pattern(name.strip())).neq("id", tenant_id)
                     .neq("tenant_type", TenantType.INTERNAL.value).limit(1).execute().data)
            if taken:
                raise HTTPException(status_code=409, detail="Another client in Gifting OS already has this name.")
            # Straight to the row: a switched-off client can be renamed too.
            self.db.table("tenants").update({"name": name.strip()}).eq("id", tenant_id).neq("tenant_type", TenantType.INTERNAL.value).execute()
        if active is not None and active == (current["status"] == TenantStatus.DEACTIVATED.value):
            self.tenants.set_status(tenant_id, TenantStatus.ACTIVE if active else TenantStatus.DEACTIVATED, actor)
        return {"tenantId": tenant_id}

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
