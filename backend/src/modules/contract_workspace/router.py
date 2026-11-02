"""Contract workspace read and gift line management endpoints."""

import re
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Query
from fastapi.responses import Response

from src.core.schema import ApiResponse
from src.modules.auth.dependencies import CurrentUserDep
from src.modules.contract_workspace.export import gift_plan_xlsx
from src.modules.contract_workspace.schemas import (
    ContractWorkspaceRead,
    GiftBulkUpdate,
    GiftBulkUpdateResult,
    GiftLineCancel,
    GiftLineCreate,
    GiftLinePage,
    GiftLineRead,
    GiftLineUpdate,
)
from src.modules.contract_workspace.service import contract_workspace_service

router = APIRouter(tags=["Contract Workspace"])


@router.get(
    "/tenants/{tenant_id}/contract-workspace",
    response_model=ApiResponse[ContractWorkspaceRead],
)
def get_contract_workspace(
    tenant_id: UUID,
    actor: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ApiResponse[ContractWorkspaceRead]:
    return ApiResponse(
        data=contract_workspace_service.workspace(
            str(tenant_id), actor, page=page, limit=limit
        ),
        message="Contract workspace retrieved successfully.",
    )


@router.get(
    "/tenants/{tenant_id}/gifts",
    response_model=ApiResponse[GiftLinePage],
)
def list_contract_gifts(
    tenant_id: UUID,
    actor: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ApiResponse[GiftLinePage]:
    return ApiResponse(
        data=contract_workspace_service.list_gifts(
            str(tenant_id), actor, page=page, limit=limit
        ),
        message="Contract gifts retrieved successfully.",
    )


@router.post(
    "/tenants/{tenant_id}/gifts",
    response_model=ApiResponse[GiftLineRead],
    status_code=201,
)
def create_contract_gift(
    tenant_id: UUID,
    payload: Annotated[GiftLineCreate, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[GiftLineRead]:
    return ApiResponse(
        data=contract_workspace_service.create_gift(str(tenant_id), payload, actor),
        message="Gift added to the contract plan.",
    )


@router.patch("/gifts/{gift_id}", response_model=ApiResponse[GiftLineRead])
def update_contract_gift(
    gift_id: UUID,
    payload: Annotated[GiftLineUpdate, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[GiftLineRead]:
    return ApiResponse(
        data=contract_workspace_service.update_gift(str(gift_id), payload, actor),
        message="Contract gift updated.",
    )


@router.post("/gifts/{gift_id}/cancel", response_model=ApiResponse[GiftLineRead])
def cancel_contract_gift(
    gift_id: UUID,
    payload: Annotated[GiftLineCancel, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[GiftLineRead]:
    return ApiResponse(
        data=contract_workspace_service.cancel_gift(str(gift_id), payload, actor),
        message="Contract gift cancelled.",
    )


@router.post("/gifts/bulk-update", response_model=ApiResponse[GiftBulkUpdateResult])
def bulk_update_contract_gifts(
    payload: Annotated[GiftBulkUpdate, Body()], actor: CurrentUserDep
) -> ApiResponse[GiftBulkUpdateResult]:
    return ApiResponse(
        data=contract_workspace_service.bulk_update(payload, actor),
        message="Contract gifts updated.",
    )


@router.get("/tenants/{tenant_id}/contract-workspace/export", response_class=Response)
def export_contract_workspace(
    tenant_id: UUID, actor: CurrentUserDep
) -> Response:
    contract, gifts = contract_workspace_service.export_rows(str(tenant_id), actor)
    safe_number = re.sub(r"[^A-Za-z0-9_-]", "_", contract["contract_number"])
    file_name = f"contract-workspace-{safe_number}.xlsx"
    content = gift_plan_xlsx(contract["contract_number"], gifts)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
    )
