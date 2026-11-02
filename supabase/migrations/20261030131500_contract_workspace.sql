-- Contract workspace gift plan lines and retained mutation history.
create unique index if not exists contracts_tenant_id_id_uq
    on public.contracts(tenant_id, id);
create unique index if not exists events_tenant_id_id_recipient_uq
    on public.events(tenant_id, id, recipient_id);

create table public.gifts (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    contract_id uuid not null,
    recipient_id uuid not null,
    event_id uuid not null,
    request_id uuid,
    gift_name text not null check (length(trim(gift_name)) between 1 and 180),
    customisation text check (customisation is null or length(customisation) <= 2000),
    unit_price numeric(12, 2) not null check (unit_price >= 0),
    quantity integer not null default 1 check (quantity between 1 and 10000),
    delivery_date date,
    vendor_name text check (vendor_name is null or length(vendor_name) <= 180),
    status text not null default 'PLANNED'
        check (status in ('PLANNED', 'IN_PREPARATION', 'DISPATCHED', 'IN_TRANSIT',
            'DELIVERED', 'ISSUE_REPORTED', 'CANCELLED')),
    cancellation_reason text check (cancellation_reason is null or length(cancellation_reason) <= 1000),
    price_change_reason text check (price_change_reason is null or length(price_change_reason) <= 1000),
    created_by_user_id uuid not null references public.profiles(id) on delete restrict,
    updated_by_user_id uuid not null references public.profiles(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (tenant_id, id),
    constraint gifts_contract_same_tenant_fk
        foreign key (tenant_id, contract_id)
        references public.contracts(tenant_id, id) on delete restrict,
    constraint gifts_recipient_same_tenant_fk
        foreign key (tenant_id, recipient_id)
        references public.recipients(tenant_id, id) on delete restrict,
    constraint gifts_event_same_tenant_recipient_fk
        foreign key (tenant_id, event_id, recipient_id)
        references public.events(tenant_id, id, recipient_id) on delete restrict,
    constraint gifts_request_same_tenant_fk
        foreign key (tenant_id, request_id)
        references public.gift_requests(tenant_id, id) on delete restrict,
    constraint gifts_cancelled_reason_required
        check (status <> 'CANCELLED' or (cancellation_reason is not null
            and length(trim(cancellation_reason)) between 1 and 1000))
);

create index gifts_tenant_contract_status_created_idx
    on public.gifts(tenant_id, contract_id, status, created_at desc, id desc);
create index gifts_tenant_created_idx
    on public.gifts(tenant_id, created_at desc, id desc);

create table public.gift_events (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    gift_id uuid not null,
    event_type text not null check (event_type in ('CREATED', 'UPDATED', 'PRICE_CHANGED', 'CANCELLED')),
    actor_user_id uuid not null references public.profiles(id) on delete restrict,
    reason text,
    changes jsonb not null default '{}'::jsonb check (jsonb_typeof(changes) = 'object'),
    created_at timestamptz not null default now(),
    constraint gift_events_gift_same_tenant_fk
        foreign key (tenant_id, gift_id)
        references public.gifts(tenant_id, id) on delete restrict
);
create index gift_events_tenant_gift_created_idx
    on public.gift_events(tenant_id, gift_id, created_at desc, id desc);

create or replace function public.record_contract_gift_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_type text;
    v_reason text;
    v_changes jsonb := '{}'::jsonb;
begin
    if tg_op = 'INSERT' then
        v_type := 'CREATED';
        v_changes := to_jsonb(new) - 'created_at' - 'updated_at';
        insert into public.gift_events(tenant_id, gift_id, event_type, actor_user_id, changes)
        values (new.tenant_id, new.id, v_type, new.created_by_user_id, v_changes);
        return new;
    end if;

    if old.status is distinct from new.status and new.status = 'CANCELLED' then
        v_type := 'CANCELLED';
        v_reason := new.cancellation_reason;
    elsif old.unit_price is distinct from new.unit_price then
        v_type := 'PRICE_CHANGED';
        v_reason := new.price_change_reason;
    else
        v_type := 'UPDATED';
        v_reason := new.price_change_reason;
    end if;

    select coalesce(jsonb_object_agg(n.key, n.value), '{}'::jsonb)
    into v_changes
    from jsonb_each(to_jsonb(new)) as n(key, value)
    where n.key not in ('updated_at')
      and (to_jsonb(new) -> n.key) is distinct from (to_jsonb(old) -> n.key);

    insert into public.gift_events(tenant_id, gift_id, event_type, actor_user_id, reason, changes)
    values (new.tenant_id, new.id, v_type, new.updated_by_user_id, v_reason, v_changes);
    return new;
end;
$$;

create or replace function public.reject_gift_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    raise exception 'gift_event_history_is_immutable' using errcode = 'P0001';
end;
$$;

create or replace function public.validate_contract_gift_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    if new.status = 'CANCELLED' and nullif(trim(new.cancellation_reason), '') is null then
        raise exception 'gift_cancellation_reason_required' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and old.status <> 'PLANNED'
       and old.unit_price is distinct from new.unit_price
       and nullif(trim(new.price_change_reason), '') is null then
        raise exception 'gift_price_change_reason_required' using errcode = 'P0001';
    end if;
    return new;
end;
$$;

create trigger gifts_updated_at
    before update on public.gifts
    for each row execute function public.handle_updated_at();
create trigger gifts_validate_mutation
    before insert or update on public.gifts
    for each row execute function public.validate_contract_gift_mutation();
create trigger gifts_audit_event
    after insert or update on public.gifts
    for each row execute function public.record_contract_gift_event();
create trigger gift_events_immutable
    before update or delete on public.gift_events
    for each row execute function public.reject_gift_event_mutation();

create or replace function public.bulk_update_contract_gifts(
    p_gift_ids uuid[],
    p_actor_id uuid,
    p_set_status boolean,
    p_status text,
    p_set_vendor boolean,
    p_vendor_name text,
    p_set_delivery_date boolean,
    p_delivery_date date
)
returns setof public.gifts
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_count integer;
begin
    if p_gift_ids is null or cardinality(p_gift_ids) < 1 or cardinality(p_gift_ids) > 100
       or p_actor_id is null
       or not (p_set_status or p_set_vendor or p_set_delivery_date)
       or (p_set_status and p_status not in ('PLANNED', 'IN_PREPARATION', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'ISSUE_REPORTED')) then
        raise exception 'invalid_gift_bulk_update' using errcode = 'P0001';
    end if;

    perform id from public.gifts where id = any(p_gift_ids) for update;
    get diagnostics v_count = row_count;
    if v_count <> cardinality(p_gift_ids) then
        raise exception 'gift_not_found' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.gifts where id = any(p_gift_ids) and status = 'CANCELLED') then
        raise exception 'gift_already_cancelled' using errcode = 'P0001';
    end if;

    return query
    update public.gifts
    set status = case when p_set_status then p_status else status end,
        vendor_name = case when p_set_vendor then p_vendor_name else vendor_name end,
        delivery_date = case when p_set_delivery_date then p_delivery_date else delivery_date end,
        updated_by_user_id = p_actor_id
    where id = any(p_gift_ids)
    returning *;
end;
$$;

alter table public.gifts enable row level security;
alter table public.gift_events enable row level security;
revoke all on public.gifts, public.gift_events from public, anon, authenticated;
grant all on public.gifts, public.gift_events to service_role;
revoke all on function public.record_contract_gift_event() from public, anon, authenticated, service_role;
revoke all on function public.reject_gift_event_mutation() from public, anon, authenticated, service_role;
revoke all on function public.validate_contract_gift_mutation() from public, anon, authenticated, service_role;
revoke all on function public.bulk_update_contract_gifts(uuid[], uuid, boolean, text, boolean, text, boolean, date)
    from public, anon, authenticated;
grant execute on function public.bulk_update_contract_gifts(uuid[], uuid, boolean, text, boolean, text, boolean, date)
    to service_role;

notify pgrst, 'reload schema';
