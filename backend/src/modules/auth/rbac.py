"""Role and permission catalog for application authorization."""

from enum import StrEnum

from fastapi import HTTPException, status


class Role(StrEnum):
    SUPER_ADMIN = "SUPER_ADMIN"
    KAM = "KAM"
    CLIENT = "CLIENT"


class Permission(StrEnum):
    TENANT_CREATE = "tenant:create"
    TENANT_READ = "tenant:read"
    TENANT_UPDATE = "tenant:update"
    TENANT_MANAGE_STATUS = "tenant:manage_status"
    CLIENT_PROVISION = "client:provision"
    CLIENT_READ = "client:read"
    CLIENT_ONBOARDING_READ = "client:onboarding:read"
    CLIENT_ONBOARDING_UPDATE = "client:onboarding:update"
    CLIENT_ADDRESS_CREATE = "client:address:create"
    USER_INVITE = "user:invite"
    USER_INVITE_PLATFORM = "user:invite_platform"
    USER_READ = "user:read"
    USER_UPDATE = "user:update"
    USER_DEACTIVATE = "user:deactivate"
    USER_ACTIVATE = "user:activate"
    USER_RESEND_INVITE = "user:resend_invite"
    RECIPIENT_READ = "recipient:read"
    RECIPIENT_CREATE = "recipient:create"
    RECIPIENT_UPDATE = "recipient:update"
    RECIPIENT_DELETE = "recipient:delete"
    RECIPIENT_RESTORE = "recipient:restore"
    EVENT_READ = "event:read"
    EVENT_CREATE = "event:create"
    EVENT_UPDATE = "event:update"
    EVENT_DELETE = "event:delete"
    OCCASION_READ = "occasion:read"
    OCCASION_CREATE = "occasion:create"
    OCCASION_UPDATE = "occasion:update"
    OCCASION_DELETE = "occasion:delete"
    GIFT_SPEND_READ = "gift_spend:read"
    GIFT_SPEND_MANAGE = "gift_spend:manage"
    CREDIT_CREATE = "credit:create"
    CREDIT_READ = "credit:read"
    CREDIT_REVIEW = "credit:review"
    GIFT_REQUEST_READ = "gift_request:read"
    GIFT_REQUEST_CREATE = "gift_request:create"
    GIFT_REQUEST_UPDATE = "gift_request:update"
    GIFT_REQUEST_REVIEW = "gift_request:review"
    CONTRACT_WORKSPACE_READ = "contract_workspace:read"
    GIFT_MANAGE = "gift:manage"


ROLE_PERMISSIONS: dict[Role, frozenset[Permission] | None] = {
    Role.SUPER_ADMIN: None,
    Role.KAM: frozenset({
        Permission.TENANT_READ,
        Permission.CLIENT_READ,
        Permission.CLIENT_ONBOARDING_READ,
        Permission.TENANT_UPDATE,
        Permission.CLIENT_ONBOARDING_UPDATE,
        Permission.CLIENT_ADDRESS_CREATE,
        Permission.USER_INVITE,
        Permission.USER_READ,
        Permission.USER_UPDATE,
        Permission.USER_DEACTIVATE,
        Permission.USER_ACTIVATE,
        Permission.USER_RESEND_INVITE,
        Permission.RECIPIENT_READ,
        Permission.RECIPIENT_CREATE,
        Permission.RECIPIENT_UPDATE,
        Permission.RECIPIENT_DELETE,
        Permission.RECIPIENT_RESTORE,
        Permission.EVENT_READ,
        Permission.EVENT_CREATE,
        Permission.EVENT_UPDATE,
        Permission.EVENT_DELETE,
        Permission.OCCASION_READ,
        Permission.OCCASION_CREATE,
        Permission.OCCASION_UPDATE,
        Permission.OCCASION_DELETE,
        Permission.GIFT_SPEND_READ,
        Permission.GIFT_SPEND_MANAGE,
        Permission.CREDIT_CREATE,
        Permission.CREDIT_READ,
        Permission.CREDIT_REVIEW,
        Permission.GIFT_REQUEST_READ,
        Permission.GIFT_REQUEST_CREATE,
        Permission.GIFT_REQUEST_UPDATE,
        Permission.GIFT_REQUEST_REVIEW,
        Permission.CONTRACT_WORKSPACE_READ,
        Permission.GIFT_MANAGE,
    }),
    Role.CLIENT: frozenset({
        Permission.TENANT_READ,
        Permission.CLIENT_READ,
        Permission.RECIPIENT_READ,
        Permission.RECIPIENT_CREATE,
        Permission.RECIPIENT_UPDATE,
        Permission.RECIPIENT_DELETE,
        Permission.RECIPIENT_RESTORE,
        Permission.EVENT_READ,
        Permission.EVENT_CREATE,
        Permission.EVENT_UPDATE,
        Permission.EVENT_DELETE,
        Permission.OCCASION_READ,
        Permission.OCCASION_CREATE,
        Permission.OCCASION_UPDATE,
        Permission.OCCASION_DELETE,
        Permission.GIFT_SPEND_READ,
        Permission.GIFT_SPEND_MANAGE,
        Permission.CREDIT_CREATE,
        Permission.CREDIT_READ,
        Permission.GIFT_REQUEST_READ,
        Permission.GIFT_REQUEST_CREATE,
        Permission.GIFT_REQUEST_UPDATE,
        Permission.CONTRACT_WORKSPACE_READ,
    }),
}


def has_permission(role: Role | str, permission: Permission) -> bool:
    try:
        resolved_role = Role(role)
    except ValueError:
        return False
    permissions = ROLE_PERMISSIONS.get(resolved_role, frozenset())
    return permissions is None or permission in permissions


def require_permission(actor: object, permission: Permission) -> None:
    if not has_permission(getattr(actor, "role", ""), permission):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions.")
