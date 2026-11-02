"""Tenant credit and staff review endpoints."""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Header, Query, status

from src.core.schema import ApiResponse
from src.modules.auth.dependencies import CurrentUserDep
from src.modules.credits.schemas import (
    CreditAdjustment,
    CreditBalanceRead,
    CreditLedgerPage,
    CreditLedgerRead,
    CreditMutationResult,
    CreditRequestCreate,
    CreditRequestHistory,
    CreditRequestPage,
    CreditRequestRead,
    CreditRejection,
    CreditReview,
    CreditUsageRead,
    CreditUsageSummary,
    PaymentSubmission,
    PaymentVerification,
)
from src.modules.credits.service import credits_service

router = APIRouter(tags=["Credits"])


@router.post(
    "/tenants/{tenant_id}/credit-requests",
    response_model=ApiResponse[CreditRequestRead],
    status_code=status.HTTP_201_CREATED,
)
def create_credit_request(
    tenant_id: UUID,
    payload: Annotated[CreditRequestCreate, Body()],
    actor: CurrentUserDep,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> ApiResponse[CreditRequestRead]:
    return ApiResponse(
        data=credits_service.create_request(str(tenant_id), payload, actor, idempotency_key),
        message="Credit request submitted for review.",
    )


@router.get(
    "/tenants/{tenant_id}/credit-requests",
    response_model=ApiResponse[CreditRequestPage],
)
def list_credit_requests(
    tenant_id: UUID,
    actor: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    request_status: Annotated[
        str | None,
        Query(alias="status", pattern="^(pending_review|awaiting_payment|payment_submitted|credited|rejected)$"),
    ] = None,
) -> ApiResponse[CreditRequestPage]:
    return ApiResponse(
        data=credits_service.list_requests(
            str(tenant_id), actor, page=page, limit=limit, status_filter=request_status
        ),
        message="Credit requests retrieved successfully.",
    )


@router.get(
    "/tenants/{tenant_id}/credit-requests/{request_id}",
    response_model=ApiResponse[CreditRequestRead],
)
def get_credit_request(
    tenant_id: UUID,
    request_id: UUID,
    actor: CurrentUserDep,
) -> ApiResponse[CreditRequestRead]:
    return ApiResponse(
        data=credits_service.get_request(str(tenant_id), str(request_id), actor),
        message="Credit request retrieved successfully.",
    )


@router.get(
    "/tenants/{tenant_id}/credit-requests/{request_id}/history",
    response_model=ApiResponse[CreditRequestHistory],
)
def credit_request_history(
    tenant_id: UUID,
    request_id: UUID,
    actor: CurrentUserDep,
) -> ApiResponse[CreditRequestHistory]:
    return ApiResponse(
        data=credits_service.request_history(str(tenant_id), str(request_id), actor),
        message="Credit request history retrieved successfully.",
    )


@router.post(
    "/tenants/{tenant_id}/credit-requests/{request_id}/payment-submission",
    response_model=ApiResponse[CreditRequestRead],
)
def submit_credit_payment(
    tenant_id: UUID,
    request_id: UUID,
    payload: Annotated[PaymentSubmission, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[CreditRequestRead]:
    return ApiResponse(
        data=credits_service.submit_payment(str(tenant_id), str(request_id), payload, actor),
        message="Payment details submitted for verification.",
    )


@router.get(
    "/admin/credit-requests",
    response_model=ApiResponse[CreditRequestPage],
)
def staff_credit_request_queue(
    actor: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    request_status: Annotated[
        str | None,
        Query(alias="status", pattern="^(pending_review|awaiting_payment|payment_submitted|credited|rejected)$"),
    ] = None,
) -> ApiResponse[CreditRequestPage]:
    return ApiResponse(
        data=credits_service.staff_queue(
            actor, page=page, limit=limit, status_filter=request_status
        ),
        message="Credit request queue retrieved successfully.",
    )


@router.post(
    "/admin/credit-requests/{request_id}/approve",
    response_model=ApiResponse[CreditRequestRead],
)
def approve_credit_request(
    request_id: UUID,
    payload: Annotated[CreditReview, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[CreditRequestRead]:
    return ApiResponse(
        data=credits_service.review_request(
            str(request_id), actor, decision="approve", note=payload.review_note or ""
        ),
        message="Credit request approved.",
    )


@router.post(
    "/admin/credit-requests/{request_id}/reject",
    response_model=ApiResponse[CreditRequestRead],
)
def reject_credit_request(
    request_id: UUID,
    payload: Annotated[CreditRejection, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[CreditRequestRead]:
    return ApiResponse(
        data=credits_service.review_request(
            str(request_id), actor, decision="reject", note=payload.reason
        ),
        message="Credit request rejected.",
    )


@router.post(
    "/admin/credit-requests/{request_id}/reject-payment",
    response_model=ApiResponse[CreditRequestRead],
)
def reject_payment_submission(
    request_id: UUID,
    payload: Annotated[CreditRejection, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[CreditRequestRead]:
    return ApiResponse(
        data=credits_service.reject_payment_submission(str(request_id), actor, payload.reason),
        message="Payment submission rejected; tenant may submit payment details again.",
    )


@router.post(
    "/admin/credit-requests/{request_id}/verify-payment",
    response_model=ApiResponse[CreditMutationResult],
)
def verify_credit_payment(
    request_id: UUID,
    payload: Annotated[PaymentVerification, Body()],
    actor: CurrentUserDep,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> ApiResponse[CreditMutationResult]:
    return ApiResponse(
        data=credits_service.verify_payment(
            str(request_id), actor,
            verification_note=payload.verification_note,
            idempotency_key=idempotency_key,
        ),
        message="Payment verified and credits added.",
    )


@router.get(
    "/tenants/{tenant_id}/credits/balance",
    response_model=ApiResponse[CreditBalanceRead],
)
def credit_balance(tenant_id: UUID, actor: CurrentUserDep) -> ApiResponse[CreditBalanceRead]:
    return ApiResponse(
        data=credits_service.balance(str(tenant_id), actor),
        message="Credit balance retrieved successfully.",
    )


@router.get(
    "/tenants/{tenant_id}/credits/ledger",
    response_model=ApiResponse[CreditLedgerPage],
)
def credit_ledger(
    tenant_id: UUID,
    actor: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    entry_type: Annotated[str | None, Query(alias="entry_type", pattern="^(credit|usage|adjustment)$")] = None,
    from_date: Annotated[date | None, Query(alias="from")] = None,
    to_date: Annotated[date | None, Query(alias="to")] = None,
) -> ApiResponse[CreditLedgerPage]:
    return ApiResponse(
        data=credits_service.ledger(
            str(tenant_id), actor, page=page, limit=limit,
            entry_type=entry_type, from_date=from_date, to_date=to_date,
        ),
        message="Credit ledger retrieved successfully.",
    )


@router.get(
    "/tenants/{tenant_id}/credits/usage",
    response_model=ApiResponse[CreditUsageSummary],
)
def credit_usage_summary(
    tenant_id: UUID,
    actor: CurrentUserDep,
    from_date: Annotated[date, Query(alias="from")],
    to_date: Annotated[date, Query(alias="to")],
) -> ApiResponse[CreditUsageSummary]:
    return ApiResponse(
        data=credits_service.usage_summary(
            str(tenant_id), actor, from_date=from_date, to_date=to_date
        ),
        message="Credit usage retrieved successfully.",
    )


@router.get(
    "/tenants/{tenant_id}/credits/usage/{usage_id}",
    response_model=ApiResponse[CreditUsageRead],
)
def credit_usage_entry(
    tenant_id: UUID,
    usage_id: UUID,
    actor: CurrentUserDep,
) -> ApiResponse[CreditUsageRead]:
    return ApiResponse(
        data=credits_service.usage_entry(str(tenant_id), str(usage_id), actor),
        message="Credit usage retrieved successfully.",
    )


@router.post(
    "/admin/tenants/{tenant_id}/credits/adjustments",
    response_model=ApiResponse[CreditLedgerRead],
    status_code=status.HTTP_201_CREATED,
)
def adjust_credit_balance(
    tenant_id: UUID,
    payload: Annotated[CreditAdjustment, Body()],
    actor: CurrentUserDep,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=128)],
) -> ApiResponse[CreditLedgerRead]:
    return ApiResponse(
        data=credits_service.adjust(str(tenant_id), payload, actor, idempotency_key),
        message="Credit adjustment posted.",
    )
