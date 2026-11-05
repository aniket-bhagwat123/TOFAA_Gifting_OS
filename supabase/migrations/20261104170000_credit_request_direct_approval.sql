-- Simplified credit flow: no online payment step. A super admin / KAM approves a pending request and the
-- credits are added to the tenant balance in the same step (status goes pending_review -> credited).
-- Rejecting still works as before. The older payment RPCs are left in place but are no longer used.
create or replace function public.review_credit_request(
    p_request_id uuid,
    p_actor_id uuid,
    p_decision text,
    p_note text
)
returns public.credit_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_request public.credit_requests%rowtype;
    v_account public.credit_accounts%rowtype;
    v_entry public.credit_ledger_entries%rowtype;
    v_old_status text;
    v_new_status text;
begin
    select * into v_request from public.credit_requests where id = p_request_id for update;
    if not found then raise exception 'credit_request_not_found' using errcode = 'P0001'; end if;
    if p_decision not in ('approve', 'reject', 'reject_payment') then
        raise exception 'invalid_credit_review_decision' using errcode = 'P0001';
    end if;
    if p_decision in ('reject', 'reject_payment') and nullif(trim(p_note), '') is null then
        raise exception 'rejection_reason_required' using errcode = 'P0001';
    end if;
    v_old_status := v_request.status;

    if p_decision = 'reject_payment' then
        if v_request.status <> 'payment_submitted' then
            raise exception 'invalid_credit_request_status' using errcode = 'P0001';
        end if;
        v_new_status := 'awaiting_payment';
        update public.credit_requests set status = v_new_status, reviewed_by_user_id = p_actor_id,
            review_note = nullif(trim(p_note), ''), payment_reference = null,
            payment_proof_file_id = null, paid_amount_minor = null, updated_at = now()
        where id = p_request_id returning * into v_request;

    elsif p_decision = 'reject' then
        if v_request.status <> 'pending_review' then
            raise exception 'invalid_credit_request_status' using errcode = 'P0001';
        end if;
        v_new_status := 'rejected';
        update public.credit_requests set status = v_new_status, reviewed_by_user_id = p_actor_id,
            review_note = nullif(trim(p_note), ''), updated_at = now()
        where id = p_request_id returning * into v_request;

    else
        -- approve: add the credits right now. Requests already waiting on the old payment step are
        -- approved the same way, so nothing is left stuck.
        if v_request.status = 'credited' then
            return v_request;
        end if;
        if v_request.status not in ('pending_review', 'awaiting_payment', 'payment_submitted') then
            raise exception 'invalid_credit_request_status' using errcode = 'P0001';
        end if;
        select * into v_account from public.credit_accounts where tenant_id = v_request.tenant_id for update;
        if not found then raise exception 'credit_account_not_found' using errcode = 'P0001'; end if;
        update public.credit_accounts set available_credits = available_credits + v_request.requested_credits,
            updated_at = now()
        where tenant_id = v_request.tenant_id returning * into v_account;
        insert into public.credit_ledger_entries(
            tenant_id, entry_type, credits_delta, balance_after, source_type, source_id,
            description, created_by_user_id, idempotency_key
        ) values (
            v_request.tenant_id, 'credit', v_request.requested_credits, v_account.available_credits,
            'credit_request', v_request.id::text,
            'Credits added · request approved', p_actor_id, 'credit-request-approval/' || v_request.id::text
        ) returning * into v_entry;
        v_new_status := 'credited';
        update public.credit_requests set status = v_new_status, ledger_entry_id = v_entry.id,
            reviewed_by_user_id = p_actor_id, review_note = nullif(trim(p_note), ''),
            verified_by_user_id = p_actor_id, updated_at = now()
        where id = p_request_id returning * into v_request;
    end if;

    insert into public.credit_request_events(tenant_id, request_id, from_status, to_status, actor_user_id, note)
    values (v_request.tenant_id, v_request.id, v_old_status, v_new_status, p_actor_id, nullif(trim(p_note), ''));
    return v_request;
end;
$$;

revoke all on function public.review_credit_request(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_credit_request(uuid, uuid, text, text) to service_role;
notify pgrst, 'reload schema';
