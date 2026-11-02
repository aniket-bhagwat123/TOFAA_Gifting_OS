-- Tenant gift request drafts, proposal workflow, and append-only status history.
create unique index if not exists events_tenant_id_id_uq
    on public.events(tenant_id, id);

create table public.gift_requests (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    recipient_id uuid not null,
    event_id uuid,
    created_by_user_id uuid not null references public.profiles(id) on delete restrict,
    title text not null check (length(trim(title)) between 1 and 180),
    purpose text not null check (length(trim(purpose)) between 1 and 2000),
    gift_preferences text check (gift_preferences is null or length(gift_preferences) <= 2000),
    requested_budget numeric(12, 2) check (requested_budget is null or requested_budget >= 0),
    delivery_date date,
    message text check (message is null or length(message) <= 1000),
    special_instructions text check (special_instructions is null or length(special_instructions) <= 2000),
    status text not null default 'DRAFT'
        check (status in ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'NEEDS_INFO', 'PROPOSAL_READY',
            'APPROVED', 'REJECTED', 'CANCELLED')),
    proposal jsonb check (proposal is null or jsonb_typeof(proposal) = 'object'),
    status_note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (tenant_id, id),
    constraint gift_requests_recipient_same_tenant_fk
        foreign key (tenant_id, recipient_id)
        references public.recipients(tenant_id, id) on delete restrict,
    constraint gift_requests_event_same_tenant_fk
        foreign key (tenant_id, event_id)
        references public.events(tenant_id, id) on delete restrict
);

create index gift_requests_tenant_created_idx
    on public.gift_requests(tenant_id, created_at desc, id desc);
create index gift_requests_tenant_status_created_idx
    on public.gift_requests(tenant_id, status, created_at desc, id desc);

create table public.gift_request_events (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    gift_request_id uuid not null,
    from_status text,
    to_status text not null,
    actor_user_id uuid references public.profiles(id) on delete set null,
    note text,
    created_at timestamptz not null default now(),
    constraint gift_request_events_status_check check (
        (from_status is null or from_status in ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'NEEDS_INFO',
            'PROPOSAL_READY', 'APPROVED', 'REJECTED', 'CANCELLED'))
        and to_status in ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'NEEDS_INFO', 'PROPOSAL_READY',
            'APPROVED', 'REJECTED', 'CANCELLED')
    ),
    constraint gift_request_events_same_tenant_fk
        foreign key (tenant_id, gift_request_id)
        references public.gift_requests(tenant_id, id) on delete restrict
);
create index gift_request_events_tenant_request_created_idx
    on public.gift_request_events(tenant_id, gift_request_id, created_at, id);

drop trigger if exists gift_requests_updated_at on public.gift_requests;
create trigger gift_requests_updated_at before update on public.gift_requests
    for each row execute function public.handle_updated_at();

create or replace function public.record_gift_request_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.gift_request_events(tenant_id, gift_request_id, to_status, actor_user_id)
    values (new.tenant_id, new.id, new.status, new.created_by_user_id);
    return new;
end;
$$;
drop trigger if exists gift_requests_created_event on public.gift_requests;
create trigger gift_requests_created_event after insert on public.gift_requests
    for each row execute function public.record_gift_request_created();

create or replace function public.reject_gift_request_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception 'gift_request_history_is_immutable' using errcode = 'P0001';
end;
$$;
create trigger gift_request_events_immutable
    before update or delete on public.gift_request_events
    for each row execute function public.reject_gift_request_event_mutation();

create or replace function public.transition_gift_request(
    p_tenant_id uuid,
    p_request_id uuid,
    p_actor_id uuid,
    p_action text,
    p_note text default null,
    p_proposal jsonb default null
)
returns public.gift_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_request public.gift_requests%rowtype;
    v_old_status text;
    v_new_status text;
    v_note text := nullif(trim(p_note), '');
begin
    select * into v_request from public.gift_requests
    where tenant_id = p_tenant_id and id = p_request_id for update;
    if not found then
        raise exception 'gift_request_not_found' using errcode = 'P0001';
    end if;
    v_old_status := v_request.status;

    if p_action = 'submit' and v_old_status in ('DRAFT', 'NEEDS_INFO') then
        v_new_status := 'SUBMITTED';
    elsif p_action = 'start_review' and v_old_status = 'SUBMITTED' then
        v_new_status := 'IN_REVIEW';
    elsif p_action = 'request_info' and v_old_status in ('SUBMITTED', 'IN_REVIEW', 'PROPOSAL_READY') then
        v_new_status := 'NEEDS_INFO';
    elsif p_action = 'publish_proposal' and v_old_status = 'IN_REVIEW' then
        if p_proposal is null or jsonb_typeof(p_proposal->'options') is distinct from 'array' then
            raise exception 'invalid_gift_proposal' using errcode = 'P0001';
        end if;
        if jsonb_array_length(p_proposal->'options') = 0 then
            raise exception 'invalid_gift_proposal' using errcode = 'P0001';
        end if;
        v_new_status := 'PROPOSAL_READY';
    elsif p_action = 'approve' and v_old_status = 'PROPOSAL_READY' then
        v_new_status := 'APPROVED';
    elsif p_action = 'request_changes' and v_old_status = 'PROPOSAL_READY' then
        v_new_status := 'NEEDS_INFO';
    elsif p_action = 'reject' and v_old_status in ('IN_REVIEW', 'NEEDS_INFO') then
        v_new_status := 'REJECTED';
    elsif p_action = 'cancel' and v_old_status in ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'NEEDS_INFO', 'PROPOSAL_READY') then
        v_new_status := 'CANCELLED';
    else
        raise exception 'invalid_gift_request_status' using errcode = 'P0001';
    end if;

    if p_action in ('request_info', 'request_changes', 'reject') and v_note is null then
        raise exception 'gift_request_note_required' using errcode = 'P0001';
    end if;
    update public.gift_requests
    set status = v_new_status,
        status_note = v_note,
        proposal = case when p_action = 'publish_proposal' then p_proposal else proposal end
    where tenant_id = p_tenant_id and id = p_request_id
    returning * into v_request;
    insert into public.gift_request_events(
        tenant_id, gift_request_id, from_status, to_status, actor_user_id, note
    ) values (p_tenant_id, p_request_id, v_old_status, v_new_status, p_actor_id, v_note);
    return v_request;
end;
$$;

alter table public.gift_requests enable row level security;
alter table public.gift_request_events enable row level security;
revoke all on public.gift_requests, public.gift_request_events from public, anon, authenticated;
grant all on public.gift_requests, public.gift_request_events to service_role;

revoke all on function public.record_gift_request_created() from public, anon, authenticated, service_role;
revoke all on function public.reject_gift_request_event_mutation() from public, anon, authenticated, service_role;
revoke all on function public.transition_gift_request(uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.transition_gift_request(uuid, uuid, uuid, text, text, jsonb) to service_role;

notify pgrst, 'reload schema';
