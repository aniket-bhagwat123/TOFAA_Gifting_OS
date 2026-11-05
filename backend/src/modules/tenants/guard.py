"""Tenant validation applied to every API route, so a new route cannot forget it."""

import logging
from uuid import UUID

from fastapi import HTTPException, Request

from src.modules.auth.dependencies import CurrentUserDep
from src.modules.tenants.service import tenant_service

logger = logging.getLogger("tofaa.tenant_access")

READ_ONLY_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


def enforce_tenant_scope(request: Request, actor: CurrentUserDep) -> None:
    """Reject the request unless the caller may use the tenant named in its path.

    Routes without a ``tenant_id`` path parameter pass through; services that derive the tenant
    from a record ID call ``tenant_service.require_context`` themselves.
    """
    raw_tenant_id = request.path_params.get("tenant_id")
    if raw_tenant_id is None:
        return
    try:
        tenant_id = str(UUID(raw_tenant_id))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Tenant ID is invalid.") from exc

    # The route template, not the raw URL, so request input never reaches the log line.
    route = getattr(request.scope.get("route"), "path", "unknown")
    try:
        tenant_service.require_context(
            tenant_id, actor, write=request.method not in READ_ONLY_METHODS
        )
    except HTTPException as exc:
        logger.warning(
            "tenant_access_denied actor=%s role=%s tenant=%s method=%s route=%s status=%s",
            actor.id, actor.role, tenant_id, request.method, route, exc.status_code,
        )
        raise
    logger.info(
        "tenant_access actor=%s role=%s tenant=%s method=%s route=%s",
        actor.id, actor.role, tenant_id, request.method, route,
    )
