"""Import history endpoints (tenant scoped)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Query, status

from src.core.schema import ApiResponse
from src.modules.auth.dependencies import CurrentUserDep
from src.modules.imports.schemas import ImportBatchFinish, ImportBatchList, ImportBatchRead, ImportBatchStart, RevertResult
from src.modules.imports.service import import_service

router = APIRouter(prefix="/tenants/{tenant_id}/import-batches", tags=["Import history"])


@router.post("", response_model=ApiResponse[ImportBatchRead], status_code=status.HTTP_201_CREATED)
def start_import(tenant_id: UUID, payload: Annotated[ImportBatchStart, Body()], actor: CurrentUserDep) -> ApiResponse[ImportBatchRead]:
    """Open a batch before importing. Send its id as `X-Import-Batch` on every recipient created by the import."""
    return ApiResponse(data=import_service.start(str(tenant_id), payload, actor), message="Import started.")


@router.get("", response_model=ImportBatchList)
def list_imports(
    tenant_id: UUID, actor: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ImportBatchList:
    return import_service.list(str(tenant_id), actor, page=page, limit=limit)


@router.patch("/{batch_id}", response_model=ApiResponse[ImportBatchRead])
def finish_import(tenant_id: UUID, batch_id: UUID, payload: Annotated[ImportBatchFinish, Body()], actor: CurrentUserDep) -> ApiResponse[ImportBatchRead]:
    """Store the result: how many people were created, how many failed and which groups the import made."""
    return ApiResponse(data=import_service.finish(str(tenant_id), str(batch_id), payload, actor), message="Import saved.")


@router.post("/{batch_id}/revert", response_model=ApiResponse[RevertResult])
def revert_import(tenant_id: UUID, batch_id: UUID, actor: CurrentUserDep) -> ApiResponse[RevertResult]:
    """Undo an import: delete the people it created and the groups it made."""
    result = import_service.revert(str(tenant_id), str(batch_id), actor)
    return ApiResponse(data=result, message=f"Import reverted: {result.recipients_removed} recipient{'s' if result.recipients_removed != 1 else ''} removed.")
