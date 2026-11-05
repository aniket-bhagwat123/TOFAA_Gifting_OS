"""Credit request lifecycle and immutable tenant credit ledger."""

import logging
import re
from uuid import uuid4
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from postgrest.exceptions import APIError
from supabase import Client

from src.core.concurrency import run_parallel
from src.core.pagination import PaginationMeta, next_page_cursor
from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Permission, Role, require_permission
from src.modules.auth.schemas import UserProfileResponse
from src.modules.credits.schemas import (
    CreditAdjustment,
    CreditBalanceRead,
    CreditLedgerPage,
    CreditLedgerRead,
    CreditMutationResult,
    CreditPricingRead,
    PaymentProofLink,
    PaymentProofRead,
    CreditRequestCreate,
    CreditRequestEventRead,
    CreditRequestHistory,
    CreditRequestPage,
    CreditRequestRead,
    CreditUsageGroup,
    CreditUsageRead,
    CreditUsageSummary,
    PaymentSubmission,
)
from src.modules.tenants.service import tenant_service

logger = logging.getLogger(__name__)

PROOF_BUCKET = "payment-proofs"
PROOF_MAX_BYTES = 5 * 1024 * 1024
PROOF_TYPES = {"image/png": "png", "image/jpeg": "jpg", "application/pdf": "pdf"}
PROOF_URL_SECONDS = 300


class CreditsService:
    def __init__(self, database: Client | None = None) -> None:
        self.database = database or get_supabase_admin_client()

    def create_request(
        self,
        tenant_id: str,
        payload: CreditRequestCreate,
        actor: UserProfileResponse,
        idempotency_key: str,
    ) -> CreditRequestRead:
        if actor.role not in (Role.CLIENT, Role.KAM):
            raise HTTPException(status_code=403, detail="Only tenant users and account managers can request credits.")
        idempotency_key = self._validate_idempotency_key(idempotency_key)
        self._authorize_tenant(tenant_id, actor, Permission.CREDIT_CREATE)
        row = self._rpc(
            "create_credit_request",
            {
                "p_tenant_id": tenant_id,
                "p_actor_id": actor.id,
                "p_requested_credits": payload.requested_credits,
                "p_note": payload.note,
                "p_idempotency_key": idempotency_key,
            },
        )
        return CreditRequestRead.model_validate(row)

    def list_requests(
        self,
        tenant_id: str,
        actor: UserProfileResponse,
        *,
        page: int,
        limit: int,
        status_filter: str | None,
    ) -> CreditRequestPage:
        self._authorize_tenant(tenant_id, actor, Permission.CREDIT_READ)
        query = self.database.table("credit_requests").select("*", count="exact").eq("tenant_id", tenant_id)
        if actor.role == Role.CLIENT:
            query = query.eq("created_by_user_id", actor.id)
        if status_filter:
            query = query.eq("status", status_filter)
        result = (
            query.order("created_at", desc=True)
            .order("id", desc=True)
            .range((page - 1) * limit, page * limit - 1)
            .execute()
        )
        total = result.count or 0
        return CreditRequestPage(
            items=[CreditRequestRead.model_validate(row) for row in result.data or []],
            pagination=PaginationMeta(page=page, limit=limit, total_records=total),
            next_cursor=next_page_cursor(page, limit, total),
        )

    def get_request(
        self,
        tenant_id: str,
        request_id: str,
        actor: UserProfileResponse,
    ) -> CreditRequestRead:
        self._authorize_tenant(tenant_id, actor, Permission.CREDIT_READ)
        query = (
            self.database.table("credit_requests")
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("id", request_id)
        )
        if actor.role == Role.CLIENT:
            query = query.eq("created_by_user_id", actor.id)
        result = query.limit(1).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Credit request not found.")
        return CreditRequestRead.model_validate(result.data[0])

    def request_history(
        self,
        tenant_id: str,
        request_id: str,
        actor: UserProfileResponse,
    ) -> CreditRequestHistory:
        self.get_request(tenant_id, request_id, actor)
        result = (
            self.database.table("credit_request_events")
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("request_id", request_id)
            .order("created_at")
            .order("id")
            .execute()
        )
        return CreditRequestHistory(
            items=[CreditRequestEventRead.model_validate(row) for row in result.data or []]
        )

    def submit_payment(
        self,
        tenant_id: str,
        request_id: str,
        payload: PaymentSubmission,
        actor: UserProfileResponse,
    ) -> CreditRequestRead:
        if actor.role not in (Role.CLIENT, Role.KAM):
            raise HTTPException(status_code=403, detail="Only tenant users and account managers can submit payment details.")
        self.get_request(tenant_id, request_id, actor)
        proof = payload.payment_proof_file_id
        if proof and not proof.startswith(f"{tenant_id}/{request_id}/"):
            raise HTTPException(status_code=422, detail="Payment proof does not belong to this request.")
        row = self._rpc(
            "submit_credit_payment",
            {
                "p_request_id": request_id,
                "p_actor_id": actor.id,
                "p_payment_reference": payload.payment_reference,
                "p_paid_amount_minor": payload.paid_amount_minor,
                "p_payment_proof_file_id": payload.payment_proof_file_id,
            },
        )
        return CreditRequestRead.model_validate(row)

    def staff_queue(
        self,
        actor: UserProfileResponse,
        *,
        page: int,
        limit: int,
        status_filter: str | None,
    ) -> CreditRequestPage:
        self._require_staff(actor)
        query = self.database.table("credit_requests").select("*", count="exact")
        tenant_ids = tenant_service.visible_tenant_ids(actor)
        if tenant_ids is not None:
            if not tenant_ids:
                return CreditRequestPage(
                    items=[],
                    pagination=PaginationMeta(page=page, limit=limit, total_records=0),
                    next_cursor=None,
                )
            query = query.in_("tenant_id", tenant_ids)
        if status_filter:
            query = query.eq("status", status_filter)
        result = (
            query.order("created_at", desc=True)
            .order("id", desc=True)
            .range((page - 1) * limit, page * limit - 1)
            .execute()
        )
        total = result.count or 0
        return CreditRequestPage(
            items=[CreditRequestRead.model_validate(row) for row in result.data or []],
            pagination=PaginationMeta(page=page, limit=limit, total_records=total),
            next_cursor=next_page_cursor(page, limit, total),
        )

    def review_request(
        self,
        request_id: str,
        actor: UserProfileResponse,
        *,
        decision: str,
        note: str,
    ) -> CreditRequestRead:
        self._require_staff(actor)
        tenant_id = self._reviewable_tenant_id(request_id, actor)
        tenant_service.require_context(tenant_id, actor, write=True)
        row = self._rpc(
            "review_credit_request",
            {
                "p_request_id": request_id,
                "p_actor_id": actor.id,
                "p_decision": decision,
                "p_note": note,
            },
        )
        return CreditRequestRead.model_validate(row)

    def verify_payment(
        self,
        request_id: str,
        actor: UserProfileResponse,
        *,
        verification_note: str | None,
        idempotency_key: str,
    ) -> CreditMutationResult:
        self._require_staff(actor)
        idempotency_key = self._validate_idempotency_key(idempotency_key)
        tenant_id = self._reviewable_tenant_id(request_id, actor)
        tenant_service.require_context(tenant_id, actor, write=True)
        result = self._rpc(
            "verify_credit_request_payment",
            {
                "p_request_id": request_id,
                "p_actor_id": actor.id,
                "p_verification_note": verification_note,
                "p_idempotency_key": idempotency_key,
            },
        )
        return CreditMutationResult.model_validate(result)

    def reject_payment_submission(
        self,
        request_id: str,
        actor: UserProfileResponse,
        reason: str,
    ) -> CreditRequestRead:
        return self.review_request(
            request_id, actor, decision="reject_payment", note=reason
        )

    def pricing(self, tenant_id: str, actor: UserProfileResponse) -> CreditPricingRead:
        self._authorize_tenant(tenant_id, actor, Permission.CREDIT_READ)
        result = (
            self.database.table("credit_pricing")
            .select("currency,minor_units_per_credit")
            .eq("id", 1)
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=503, detail="Credit pricing is not configured.")
        row = result.data[0]
        return CreditPricingRead(currency=row["currency"], unit_price_minor=row["minor_units_per_credit"])

    def upload_payment_proof(
        self,
        tenant_id: str,
        request_id: str,
        actor: UserProfileResponse,
        *,
        content: bytes,
        content_type: str,
        file_name: str,
    ) -> PaymentProofRead:
        if actor.role not in (Role.CLIENT, Role.KAM):
            raise HTTPException(status_code=403, detail="Only tenant users and account managers can attach payment proof.")
        request = self.get_request(tenant_id, request_id, actor)
        if request.status != "awaiting_payment":
            raise HTTPException(status_code=409, detail="Payment proof can only be attached while payment is due.")
        content_type = (content_type or "").split(";")[0].strip().lower()
        if content_type not in PROOF_TYPES:
            raise HTTPException(status_code=415, detail="Attach a PNG, JPG or PDF file.")
        if not content:
            raise HTTPException(status_code=422, detail="The file is empty.")
        if len(content) > PROOF_MAX_BYTES:
            raise HTTPException(status_code=413, detail="The file is too large. Attach one under 5 MB.")
        safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", file_name or "proof")[:80] or "proof"
        path = f"{tenant_id}/{request_id}/{uuid4().hex}.{PROOF_TYPES[content_type]}"
        try:
            self.database.storage.from_(PROOF_BUCKET).upload(path, content, {"content-type": content_type})
        except Exception as exc:  # storage client raises its own error types
            logger.exception("Could not store payment proof")
            raise HTTPException(status_code=503, detail="The file could not be saved. Please try again.") from exc
        return PaymentProofRead(file_id=path, file_name=safe_name, content_type=content_type, size_bytes=len(content))

    def payment_proof_link(self, request_id: str, actor: UserProfileResponse) -> PaymentProofLink:
        """Short-lived link so staff can open the proof while verifying a payment."""
        tenant_id = self._reviewable_tenant_id(request_id, actor)
        row = (
            self.database.table("credit_requests")
            .select("payment_proof_file_id")
            .eq("tenant_id", tenant_id)
            .eq("id", request_id)
            .limit(1)
            .execute()
            .data
        )
        proof = row[0].get("payment_proof_file_id") if row else None
        if not proof:
            raise HTTPException(status_code=404, detail="No payment proof was attached.")
        try:
            signed = self.database.storage.from_(PROOF_BUCKET).create_signed_url(proof, PROOF_URL_SECONDS)
        except Exception as exc:
            logger.exception("Could not sign payment proof link")
            raise HTTPException(status_code=503, detail="The proof could not be opened right now.") from exc
        url = signed.get("signedURL") or signed.get("signedUrl")
        if not url:
            raise HTTPException(status_code=503, detail="The proof could not be opened right now.")
        return PaymentProofLink(url=url, expires_in_seconds=PROOF_URL_SECONDS)

    def balance(self, tenant_id: str, actor: UserProfileResponse) -> CreditBalanceRead:
        self._authorize_tenant(tenant_id, actor, Permission.CREDIT_READ)
        account, reserved = run_parallel(
            lambda: (
                self.database.table("credit_accounts")
                .select("tenant_id,currency,available_credits,updated_at")
                .eq("tenant_id", tenant_id)
                .limit(1)
                .execute()
            ),
            lambda: self._reserved_for_budgets(tenant_id),
        )
        if account.data:
            row = account.data[0]
            return CreditBalanceRead(
                tenant_id=tenant_id,
                available_credits=max(row["available_credits"] - reserved, 0),
                total_credits=row["available_credits"],
                reserved_credits=reserved,
                currency=row["currency"],
                as_of=row["updated_at"],
            )
        pricing = self.database.table("credit_pricing").select("currency").eq("id", 1).limit(1).execute()
        if not pricing.data:
            raise HTTPException(status_code=503, detail="Credit pricing is not configured.")
        return CreditBalanceRead(
            tenant_id=tenant_id,
            available_credits=0,
            total_credits=0,
            reserved_credits=0,
            currency=pricing.data[0]["currency"],
            as_of=datetime.now(timezone.utc),
        )

    def _reserved_for_budgets(self, tenant_id: str) -> int:
        """Credits already set aside in Occasion / Event budgets and not yet spent."""
        try:
            result = self.database.rpc("gift_spend_reserved_credits", {"p_tenant_id": tenant_id}).execute()
        except APIError:
            logger.exception("Could not read reserved credits")
            return 0
        value = result.data
        if isinstance(value, list):
            value = value[0] if value else 0
        return int(value or 0)

    def ledger(
        self,
        tenant_id: str,
        actor: UserProfileResponse,
        *,
        page: int,
        limit: int,
        entry_type: str | None,
        from_date: date | None,
        to_date: date | None,
    ) -> CreditLedgerPage:
        self._authorize_tenant(tenant_id, actor, Permission.CREDIT_READ)
        if from_date and to_date and from_date > to_date:
            raise HTTPException(status_code=422, detail="from must be on or before to.")
        query = (
            self.database.table("credit_ledger_entries")
            .select("*", count="exact")
            .eq("tenant_id", tenant_id)
        )
        if entry_type:
            query = query.eq("entry_type", entry_type)
        if from_date:
            query = query.gte("created_at", self._utc_midnight(from_date).isoformat())
        if to_date:
            query = query.lt("created_at", self._utc_midnight(to_date + timedelta(days=1)).isoformat())
        result = (
            query.order("created_at", desc=True)
            .order("id", desc=True)
            .range((page - 1) * limit, page * limit - 1)
            .execute()
        )
        total = result.count or 0
        return CreditLedgerPage(
            items=[CreditLedgerRead.model_validate(row) for row in result.data or []],
            pagination=PaginationMeta(page=page, limit=limit, total_records=total),
            next_cursor=next_page_cursor(page, limit, total),
        )

    def usage_summary(
        self,
        tenant_id: str,
        actor: UserProfileResponse,
        *,
        from_date: date,
        to_date: date,
    ) -> CreditUsageSummary:
        self._authorize_tenant(tenant_id, actor, Permission.CREDIT_READ)
        if from_date > to_date:
            raise HTTPException(status_code=422, detail="from must be on or before to.")
        summary = self._rpc(
            "get_credit_usage_summary",
            {
                "p_tenant_id": tenant_id,
                "p_from": self._utc_midnight(from_date).isoformat(),
                "p_to": self._utc_midnight(to_date + timedelta(days=1)).isoformat(),
            },
        )
        return CreditUsageSummary(
            tenant_id=tenant_id,
            from_date=from_date,
            to_date=to_date,
            total_credits_used=summary["total_credits_used"],
            groups=[CreditUsageGroup.model_validate(group) for group in summary["groups"]],
        )

    def usage_entry(
        self,
        tenant_id: str,
        usage_id: str,
        actor: UserProfileResponse,
    ) -> CreditUsageRead:
        self._authorize_tenant(tenant_id, actor, Permission.CREDIT_READ)
        result = (
            self.database.table("credit_ledger_entries")
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("id", usage_id)
            .eq("entry_type", "usage")
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Credit usage entry not found.")
        row = result.data[0]
        return CreditUsageRead(
            id=row["id"],
            tenant_id=row["tenant_id"],
            credits_used=-row["credits_delta"],
            balance_after=row["balance_after"],
            source_type=row["source_type"],
            source_id=row["source_id"],
            description=row["description"],
            created_at=row["created_at"],
        )

    def adjust(
        self,
        tenant_id: str,
        payload: CreditAdjustment,
        actor: UserProfileResponse,
        idempotency_key: str,
    ) -> CreditLedgerRead:
        if actor.role != Role.SUPER_ADMIN:
            raise HTTPException(status_code=403, detail="Only super admins can adjust credits.")
        idempotency_key = self._validate_idempotency_key(idempotency_key)
        self._authorize_tenant(tenant_id, actor, Permission.CREDIT_REVIEW)
        row = self._rpc(
            "post_credit_adjustment",
            {
                "p_tenant_id": tenant_id,
                "p_actor_id": actor.id,
                "p_direction": payload.direction,
                "p_credits": payload.credits,
                "p_reason": payload.reason,
                "p_reference": payload.reference,
                "p_idempotency_key": idempotency_key,
            },
        )
        return CreditLedgerRead.model_validate(row)

    def consume_credits(
        self,
        tenant_id: str,
        *,
        credits: int,
        source_type: str,
        source_id: str,
        description: str,
        actor_user_id: str | None,
        idempotency_key: str,
    ) -> CreditLedgerRead:
        """Internal-only hook for business services; intentionally not an HTTP route."""
        row = self._rpc(
            "consume_tenant_credits",
            {
                "p_tenant_id": tenant_id,
                "p_credits": credits,
                "p_source_type": source_type,
                "p_source_id": source_id,
                "p_description": description,
                "p_actor_id": actor_user_id,
                "p_idempotency_key": idempotency_key,
            },
        )
        return CreditLedgerRead.model_validate(row)

    def _reviewable_tenant_id(self, request_id: str, actor: UserProfileResponse) -> str:
        """The request's tenant. Account managers may also raise requests, so nobody reviews their own."""
        result = (
            self.database.table("credit_requests")
            .select("tenant_id,created_by_user_id")
            .eq("id", request_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Credit request not found.")
        row = result.data[0]
        if str(row.get("created_by_user_id")) == str(actor.id):
            raise HTTPException(status_code=403, detail="You can't review a credit request you created.")
        return row["tenant_id"]

    def _authorize_tenant(
        self,
        tenant_id: str,
        actor: UserProfileResponse,
        permission: Permission,
    ) -> None:
        require_permission(actor, permission)
        tenant_service.require_access(tenant_id, actor)
        if actor.role == Role.CLIENT:
            return  # access already proved this is the client's own, existing tenant
        if tenant_service.tenant_state(tenant_id) is None:
            raise HTTPException(status_code=404, detail="Tenant not found.")

    @staticmethod
    def _require_staff(actor: UserProfileResponse) -> None:
        if actor.role not in (Role.KAM, Role.SUPER_ADMIN):
            raise HTTPException(status_code=403, detail="Only assigned KAMs and super admins can review credit requests.")
        require_permission(actor, Permission.CREDIT_REVIEW)

    def _rpc(self, function: str, params: dict[str, Any]) -> Any:
        try:
            result = self.database.rpc(function, params).execute()
            data = result.data
            return data[0] if isinstance(data, list) and len(data) == 1 else data
        except APIError as exc:
            logger.exception("Credit database operation failed: %s", function)
            message = (exc.message or "").lower()
            if "credit_pricing_not_configured" in message:
                raise HTTPException(status_code=503, detail="Credit pricing is not configured.") from exc
            if "credit_request_not_found" in message or "credit_request_forbidden" in message:
                raise HTTPException(status_code=404, detail="Credit request not found.") from exc
            if "invalid_credit_request_status" in message:
                raise HTTPException(status_code=409, detail="Credit request is not in a valid state for this action.") from exc
            if "payment_amount_mismatch" in message:
                raise HTTPException(status_code=409, detail="Submitted payment amount does not match the amount due.") from exc
            if "insufficient_credits" in message:
                raise HTTPException(status_code=409, detail="Tenant does not have enough credits.") from exc
            if "idempotency_key_conflict" in message or "duplicate key" in message or exc.code == "23505":
                raise HTTPException(status_code=409, detail="This operation conflicts with an existing credit record.") from exc
            if "credit_account_not_found" in message:
                raise HTTPException(status_code=404, detail="Credit account not found.") from exc
            if "currency_mismatch" in message:
                raise HTTPException(status_code=409, detail="Tenant credit currency does not match configured pricing.") from exc
            if "rejection_reason_required" in message:
                raise HTTPException(status_code=422, detail="A rejection reason is required.") from exc
            if "invalid_credit" in message or "invalid_payment" in message:
                raise HTTPException(status_code=422, detail="Credit request data is invalid.") from exc
            if exc.code == "PGRST205":
                raise HTTPException(status_code=503, detail="Credit database migration is missing or the schema cache needs reloading.") from exc
            raise HTTPException(status_code=503, detail="Credit operation could not be completed.") from exc
        except Exception as exc:
            logger.exception("Unexpected credit database operation failure: %s", function)
            raise HTTPException(status_code=503, detail="Credit operation could not be completed.") from exc

    @staticmethod
    def _utc_midnight(day: date) -> datetime:
        return datetime.combine(day, time.min, tzinfo=timezone.utc)

    @staticmethod
    def _validate_idempotency_key(value: str) -> str:
        value = value.strip()
        if not 8 <= len(value) <= 128:
            raise HTTPException(status_code=422, detail="Idempotency-Key must contain 8 to 128 non-space characters.")
        return value


credits_service = CreditsService()
