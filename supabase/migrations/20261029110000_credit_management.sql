-- Credit balances are derived from immutable ledger entries and are changed only
-- by transactional RPCs invoked by the backend service role.
create table public.credit_pricing (
    id smallint primary key check (id = 1),
    currency text not null check (currency ~ '^[A-Z]{3}$'),
    minor_units_per_credit bigint not null check (minor_units_per_credit > 0),
    updated_at timestamptz not null default now()
);

create table public.credit_accounts (
    tenant_id uuid primary key references public.tenants(id) on delete restrict,
    currency text not null check (currency ~ '^[A-Z]{3}$'),
    available_credits bigint not null default 0 check (available_credits >= 0),
    updated_at timestamptz not null default now()
);

create table public.credit_requests (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    requested_credits bigint not null check (requested_credits > 0),
    currency text not null check (currency ~ '^[A-Z]{3}$'),
    unit_price_minor bigint not null check (unit_price_minor > 0),
    amount_due_minor bigint not null check (amount_due_minor > 0),
    status text not null default 'pending_review'
        check (status in ('pending_review', 'awaiting_payment', 'payment_submitted', 'credited', 'rejected')),
    note text,
    created_by_user_id uuid references public.profiles(id) on delete set null,
    reviewed_by_user_id uuid references public.profiles(id) on delete set null,
    review_note text,
    payment_reference text,
    payment_proof_file_id text,
    paid_amount_minor bigint check (paid_amount_minor is null or paid_amount_minor > 0),
    verification_note text,
    verified_by_user_id uuid references public.profiles(id) on delete set null,
    idempotency_key text not null,
    request_fingerprint text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (tenant_id, idempotency_key),
    unique (tenant_id, id)
);
create index credit_requests_tenant_status_created_idx
    on public.credit_requests(tenant_id, status, created_at desc, id desc);
create index credit_requests_created_by_idx on public.credit_requests(created_by_user_id);
create index credit_requests_reviewed_by_idx on public.credit_requests(reviewed_by_user_id);
create index credit_requests_verified_by_idx on public.credit_requests(verified_by_user_id);

create table public.credit_ledger_entries (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    entry_type text not null check (entry_type in ('credit', 'usage', 'adjustment')),
    credits_delta bigint not null check (credits_delta <> 0),
    balance_after bigint not null check (balance_after >= 0),
    source_type text not null,
    source_id text,
    payment_reference text,
    description text not null,
    reason text,
    reference text,
    metadata jsonb not null default '{}'::jsonb,
    created_by_user_id uuid references public.profiles(id) on delete set null,
    idempotency_key text,
    created_at timestamptz not null default now(),
    check ((entry_type = 'credit' and credits_delta > 0)
        or (entry_type = 'usage' and credits_delta < 0)
        or entry_type = 'adjustment')
);
alter table public.credit_requests
    add column ledger_entry_id uuid references public.credit_ledger_entries(id) on delete restrict;
create index credit_requests_ledger_entry_idx on public.credit_requests(ledger_entry_id);
create index credit_ledger_created_by_idx on public.credit_ledger_entries(created_by_user_id);
create unique index credit_ledger_tenant_idempotency_uq
    on public.credit_ledger_entries(tenant_id, idempotency_key)
    where idempotency_key is not null;
create unique index credit_ledger_credit_request_uq
    on public.credit_ledger_entries(source_id)
    where source_type = 'credit_request';
create unique index credit_ledger_payment_reference_uq
    on public.credit_ledger_entries(lower(payment_reference))
    where payment_reference is not null;
create unique index credit_ledger_source_operation_uq
    on public.credit_ledger_entries(tenant_id, source_type, source_id)
    where entry_type = 'usage' and source_id is not null;
create index credit_ledger_tenant_created_idx
    on public.credit_ledger_entries(tenant_id, created_at desc, id desc);
create index credit_ledger_tenant_type_created_idx
    on public.credit_ledger_entries(tenant_id, entry_type, created_at desc);

create table public.credit_request_events (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    request_id uuid not null,
    from_status text,
    to_status text not null,
    actor_user_id uuid references public.profiles(id) on delete set null,
    note text,
    created_at timestamptz not null default now(),
    constraint credit_request_events_same_tenant_fk
        foreign key (tenant_id, request_id)
        references public.credit_requests(tenant_id, id) on delete restrict
);
create index credit_request_events_tenant_request_created_idx
    on public.credit_request_events(tenant_id, request_id, created_at, id);
create index credit_request_events_actor_idx on public.credit_request_events(actor_user_id);

create or replace function public.reject_credit_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception 'credit_history_is_immutable' using errcode = 'P0001';
end;
$$;
create trigger credit_ledger_immutable
    before update or delete on public.credit_ledger_entries
    for each row execute function public.reject_credit_history_mutation();
create trigger credit_request_events_immutable
    before update or delete on public.credit_request_events
    for each row execute function public.reject_credit_history_mutation();

create or replace function public.create_credit_request(
    p_tenant_id uuid,
    p_actor_id uuid,
    p_requested_credits bigint,
    p_note text,
    p_idempotency_key text
)
returns public.credit_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_price public.credit_pricing%rowtype;
    v_account public.credit_accounts%rowtype;
    v_request public.credit_requests%rowtype;
    v_fingerprint text;
begin
    if p_requested_credits <= 0 or p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
        raise exception 'invalid_credit_request' using errcode = 'P0001';
    end if;
    v_fingerprint := md5(p_requested_credits::text || E'\n' || coalesce(p_note, ''));
    select * into v_request from public.credit_requests
    where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;
    if found then
        if v_request.created_by_user_id is distinct from p_actor_id
            or v_request.request_fingerprint <> v_fingerprint then
            raise exception 'idempotency_key_conflict' using errcode = 'P0001';
        end if;
        return v_request;
    end if;
    select * into v_price from public.credit_pricing where id = 1 for share;
    if not found then
        raise exception 'credit_pricing_not_configured' using errcode = 'P0001';
    end if;
    if p_requested_credits > 9223372036854775807 / v_price.minor_units_per_credit then
        raise exception 'credit_amount_too_large' using errcode = 'P0001';
    end if;
    insert into public.credit_accounts(tenant_id, currency)
    values (p_tenant_id, v_price.currency)
    on conflict (tenant_id) do nothing;
    select * into v_account from public.credit_accounts
    where tenant_id = p_tenant_id for update;
    if v_account.currency <> v_price.currency then
        raise exception 'tenant_credit_currency_mismatch' using errcode = 'P0001';
    end if;
    insert into public.credit_requests(
        tenant_id, requested_credits, currency, unit_price_minor, amount_due_minor,
        note, created_by_user_id, idempotency_key, request_fingerprint
    ) values (
        p_tenant_id, p_requested_credits, v_price.currency, v_price.minor_units_per_credit,
        p_requested_credits * v_price.minor_units_per_credit, nullif(trim(p_note), ''),
        p_actor_id, p_idempotency_key, v_fingerprint
    ) returning * into v_request;
    insert into public.credit_request_events(
        tenant_id, request_id, from_status, to_status, actor_user_id, note
    ) values (p_tenant_id, v_request.id, null, 'pending_review', p_actor_id, 'Credit request submitted.');
    return v_request;
end;
$$;

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
    else
        if v_request.status <> 'pending_review' then
            raise exception 'invalid_credit_request_status' using errcode = 'P0001';
        end if;
        v_new_status := case when p_decision = 'approve' then 'awaiting_payment' else 'rejected' end;
        update public.credit_requests set status = v_new_status, reviewed_by_user_id = p_actor_id,
            review_note = nullif(trim(p_note), ''), updated_at = now()
        where id = p_request_id returning * into v_request;
    end if;
    insert into public.credit_request_events(tenant_id, request_id, from_status, to_status, actor_user_id, note)
    values (v_request.tenant_id, v_request.id, v_old_status, v_new_status, p_actor_id, nullif(trim(p_note), ''));
    return v_request;
end;
$$;

create or replace function public.submit_credit_payment(
    p_request_id uuid,
    p_actor_id uuid,
    p_payment_reference text,
    p_paid_amount_minor bigint,
    p_payment_proof_file_id text
)
returns public.credit_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_request public.credit_requests%rowtype;
begin
    select * into v_request from public.credit_requests where id = p_request_id for update;
    if not found then raise exception 'credit_request_not_found' using errcode = 'P0001'; end if;
    if v_request.created_by_user_id is distinct from p_actor_id then
        raise exception 'credit_request_forbidden' using errcode = 'P0001';
    end if;
    if v_request.status = 'payment_submitted'
        and v_request.payment_reference = nullif(trim(p_payment_reference), '')
        and v_request.paid_amount_minor = p_paid_amount_minor
        and v_request.payment_proof_file_id is not distinct from p_payment_proof_file_id then
        return v_request;
    end if;
    if v_request.status <> 'awaiting_payment' then
        raise exception 'invalid_credit_request_status' using errcode = 'P0001';
    end if;
    if nullif(trim(p_payment_reference), '') is null or p_paid_amount_minor <= 0 then
        raise exception 'invalid_payment_submission' using errcode = 'P0001';
    end if;
    if p_paid_amount_minor <> v_request.amount_due_minor then
        raise exception 'payment_amount_mismatch' using errcode = 'P0001';
    end if;
    update public.credit_requests set status = 'payment_submitted',
        payment_reference = trim(p_payment_reference), paid_amount_minor = p_paid_amount_minor,
        payment_proof_file_id = nullif(trim(p_payment_proof_file_id), ''), updated_at = now()
    where id = p_request_id returning * into v_request;
    insert into public.credit_request_events(tenant_id, request_id, from_status, to_status, actor_user_id, note)
    values (v_request.tenant_id, v_request.id, 'awaiting_payment', 'payment_submitted', p_actor_id,
        'Payment details submitted by tenant.');
    return v_request;
end;
$$;

create or replace function public.verify_credit_request_payment(
    p_request_id uuid,
    p_actor_id uuid,
    p_verification_note text,
    p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_request public.credit_requests%rowtype;
    v_account public.credit_accounts%rowtype;
    v_entry public.credit_ledger_entries%rowtype;
begin
    select * into v_request from public.credit_requests where id = p_request_id for update;
    if not found then raise exception 'credit_request_not_found' using errcode = 'P0001'; end if;
    if v_request.status = 'credited' then
        select * into v_entry from public.credit_ledger_entries
        where source_type = 'credit_request' and source_id = v_request.id::text;
        return jsonb_build_object('request', to_jsonb(v_request), 'ledger_entry', to_jsonb(v_entry));
    end if;
    if v_request.status <> 'payment_submitted' then
        raise exception 'invalid_credit_request_status' using errcode = 'P0001';
    end if;
    if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
        raise exception 'invalid_idempotency_key' using errcode = 'P0001';
    end if;
    if v_request.paid_amount_minor is distinct from v_request.amount_due_minor then
        raise exception 'payment_amount_mismatch' using errcode = 'P0001';
    end if;
    select * into v_account from public.credit_accounts where tenant_id = v_request.tenant_id for update;
    if not found then raise exception 'credit_account_not_found' using errcode = 'P0001'; end if;
    update public.credit_accounts set available_credits = available_credits + v_request.requested_credits,
        updated_at = now()
    where tenant_id = v_request.tenant_id returning * into v_account;
    insert into public.credit_ledger_entries(
        tenant_id, entry_type, credits_delta, balance_after, source_type, source_id,
        payment_reference, description, created_by_user_id, idempotency_key
    ) values (
        v_request.tenant_id, 'credit', v_request.requested_credits, v_account.available_credits,
        'credit_request', v_request.id::text, v_request.payment_reference,
        'Credits added after payment verification.', p_actor_id, p_idempotency_key
    ) returning * into v_entry;
    update public.credit_requests set status = 'credited', ledger_entry_id = v_entry.id,
        verification_note = nullif(trim(p_verification_note), ''),
        verified_by_user_id = p_actor_id, updated_at = now()
    where id = p_request_id returning * into v_request;
    insert into public.credit_request_events(tenant_id, request_id, from_status, to_status, actor_user_id, note)
    values (v_request.tenant_id, v_request.id, 'payment_submitted', 'credited', p_actor_id,
        nullif(trim(p_verification_note), ''));
    return jsonb_build_object('request', to_jsonb(v_request), 'ledger_entry', to_jsonb(v_entry));
end;
$$;

create or replace function public.post_credit_adjustment(
    p_tenant_id uuid,
    p_actor_id uuid,
    p_direction text,
    p_credits bigint,
    p_reason text,
    p_reference text,
    p_idempotency_key text
)
returns public.credit_ledger_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_price public.credit_pricing%rowtype;
    v_account public.credit_accounts%rowtype;
    v_entry public.credit_ledger_entries%rowtype;
    v_delta bigint;
begin
    if p_direction not in ('credit', 'debit') or p_credits <= 0
        or nullif(trim(p_reason), '') is null or p_idempotency_key is null
        or length(trim(p_idempotency_key)) < 8 then
        raise exception 'invalid_credit_adjustment' using errcode = 'P0001';
    end if;
    select * into v_entry from public.credit_ledger_entries
    where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;
    if found then
        if v_entry.entry_type <> 'adjustment'
            or v_entry.credits_delta <> (case when p_direction = 'credit' then p_credits else -p_credits end)
            or v_entry.reason <> trim(p_reason)
            or v_entry.reference is distinct from nullif(trim(p_reference), '') then
            raise exception 'idempotency_key_conflict' using errcode = 'P0001';
        end if;
        return v_entry;
    end if;
    select * into v_account from public.credit_accounts where tenant_id = p_tenant_id for update;
    if not found then
        select * into v_price from public.credit_pricing where id = 1;
        if not found then raise exception 'credit_pricing_not_configured' using errcode = 'P0001'; end if;
        insert into public.credit_accounts(tenant_id, currency)
        values (p_tenant_id, v_price.currency) on conflict (tenant_id) do nothing;
        select * into v_account from public.credit_accounts where tenant_id = p_tenant_id for update;
    end if;
    v_delta := case when p_direction = 'credit' then p_credits else -p_credits end;
    if v_account.available_credits + v_delta < 0 then
        raise exception 'insufficient_credits' using errcode = 'P0001';
    end if;
    update public.credit_accounts set available_credits = available_credits + v_delta, updated_at = now()
    where tenant_id = p_tenant_id returning * into v_account;
    insert into public.credit_ledger_entries(
        tenant_id, entry_type, credits_delta, balance_after, source_type, description,
        reason, reference, created_by_user_id, idempotency_key
    ) values (
        p_tenant_id, 'adjustment', v_delta, v_account.available_credits, 'admin_adjustment',
        'Super admin credit adjustment.', trim(p_reason), nullif(trim(p_reference), ''),
        p_actor_id, p_idempotency_key
    ) returning * into v_entry;
    return v_entry;
end;
$$;

-- Called only by trusted backend business operations when they spend credits.
create or replace function public.consume_tenant_credits(
    p_tenant_id uuid,
    p_credits bigint,
    p_source_type text,
    p_source_id text,
    p_description text,
    p_actor_id uuid,
    p_idempotency_key text
)
returns public.credit_ledger_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_account public.credit_accounts%rowtype;
    v_entry public.credit_ledger_entries%rowtype;
begin
    if p_credits <= 0 or nullif(trim(p_source_type), '') is null
        or nullif(trim(p_source_id), '') is null or p_idempotency_key is null
        or length(trim(p_idempotency_key)) < 8 then
        raise exception 'invalid_credit_usage' using errcode = 'P0001';
    end if;
    select * into v_entry from public.credit_ledger_entries
    where tenant_id = p_tenant_id and idempotency_key = p_idempotency_key;
    if found then
        if v_entry.entry_type <> 'usage' or v_entry.source_type <> p_source_type
            or v_entry.source_id <> p_source_id or v_entry.credits_delta <> -p_credits then
            raise exception 'idempotency_key_conflict' using errcode = 'P0001';
        end if;
        return v_entry;
    end if;
    select * into v_account from public.credit_accounts where tenant_id = p_tenant_id for update;
    if not found then raise exception 'credit_account_not_found' using errcode = 'P0001'; end if;
    if v_account.available_credits < p_credits then
        raise exception 'insufficient_credits' using errcode = 'P0001';
    end if;
    update public.credit_accounts set available_credits = available_credits - p_credits, updated_at = now()
    where tenant_id = p_tenant_id returning * into v_account;
    insert into public.credit_ledger_entries(
        tenant_id, entry_type, credits_delta, balance_after, source_type, source_id,
        description, created_by_user_id, idempotency_key
    ) values (
        p_tenant_id, 'usage', -p_credits, v_account.available_credits, trim(p_source_type),
        trim(p_source_id), coalesce(nullif(trim(p_description), ''), 'Credits used.'),
        p_actor_id, p_idempotency_key
    ) returning * into v_entry;
    return v_entry;
end;
$$;

create or replace function public.get_credit_usage_summary(
    p_tenant_id uuid,
    p_from timestamptz,
    p_to timestamptz
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'total_credits_used', coalesce(sum(credits_used), 0),
        'groups', coalesce(jsonb_agg(jsonb_build_object(
            'source_type', source_type,
            'credits_used', credits_used,
            'entry_count', entry_count
        ) order by source_type), '[]'::jsonb)
    )
    from (
        select source_type, sum(-credits_delta) as credits_used, count(*) as entry_count
        from public.credit_ledger_entries
        where tenant_id = p_tenant_id and entry_type = 'usage'
            and created_at >= p_from and created_at < p_to
        group by source_type
    ) grouped;
$$;

alter table public.credit_pricing enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.credit_requests enable row level security;
alter table public.credit_ledger_entries enable row level security;
alter table public.credit_request_events enable row level security;
revoke all on public.credit_pricing, public.credit_accounts, public.credit_requests,
    public.credit_ledger_entries, public.credit_request_events from public, anon, authenticated;
grant select on public.credit_pricing, public.credit_accounts, public.credit_requests,
    public.credit_ledger_entries, public.credit_request_events to service_role;

revoke all on function public.reject_credit_history_mutation() from public, anon, authenticated, service_role;
revoke all on function public.create_credit_request(uuid, uuid, bigint, text, text) from public, anon, authenticated;
revoke all on function public.review_credit_request(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.submit_credit_payment(uuid, uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.verify_credit_request_payment(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.post_credit_adjustment(uuid, uuid, text, bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.consume_tenant_credits(uuid, bigint, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.get_credit_usage_summary(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.create_credit_request(uuid, uuid, bigint, text, text) to service_role;
grant execute on function public.review_credit_request(uuid, uuid, text, text) to service_role;
grant execute on function public.submit_credit_payment(uuid, uuid, text, bigint, text) to service_role;
grant execute on function public.verify_credit_request_payment(uuid, uuid, text, text) to service_role;
grant execute on function public.post_credit_adjustment(uuid, uuid, text, bigint, text, text, text) to service_role;
grant execute on function public.consume_tenant_credits(uuid, bigint, text, text, text, uuid, text) to service_role;
grant execute on function public.get_credit_usage_summary(uuid, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
