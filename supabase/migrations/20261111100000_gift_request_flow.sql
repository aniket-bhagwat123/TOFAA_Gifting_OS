-- Gift request flow: Confirmed/In progress/Dispatched/Delivered statuses, a readable request ID (TG-0001),
-- the multi-step form fields, and a private bucket for the optional reference file.

-- 1. Statuses. Approved becomes Confirmed; Rejected is folded into Cancelled.
alter table public.gift_requests drop constraint if exists gift_requests_status_check;
alter table public.gift_request_events drop constraint if exists gift_request_events_status_check;
alter table public.gift_request_events disable trigger gift_request_events_immutable;
update public.gift_requests set status = 'CONFIRMED' where status = 'APPROVED';
update public.gift_requests set status = 'CANCELLED' where status = 'REJECTED';
update public.gift_request_events set from_status = 'CONFIRMED' where from_status = 'APPROVED';
update public.gift_request_events set to_status = 'CONFIRMED' where to_status = 'APPROVED';
update public.gift_request_events set from_status = 'CANCELLED' where from_status = 'REJECTED';
update public.gift_request_events set to_status = 'CANCELLED' where to_status = 'REJECTED';
alter table public.gift_request_events enable trigger gift_request_events_immutable;
alter table public.gift_requests add constraint gift_requests_status_check check (status in (
    'DRAFT', 'SUBMITTED', 'IN_REVIEW', 'NEEDS_INFO', 'PROPOSAL_READY', 'CONFIRMED',
    'IN_PROGRESS', 'DISPATCHED', 'DELIVERED', 'CANCELLED'));
alter table public.gift_request_events add constraint gift_request_events_status_check check (
    (from_status is null or from_status in ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'NEEDS_INFO', 'PROPOSAL_READY',
        'CONFIRMED', 'IN_PROGRESS', 'DISPATCHED', 'DELIVERED', 'CANCELLED'))
    and to_status in ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'NEEDS_INFO', 'PROPOSAL_READY', 'CONFIRMED',
        'IN_PROGRESS', 'DISPATCHED', 'DELIVERED', 'CANCELLED'));

-- 2. Request ID: a sequence-backed number, shown as TG-0001. Existing rows are numbered oldest first.
create sequence if not exists public.gift_request_number_seq;
alter table public.gift_requests add column if not exists request_number bigint;
update public.gift_requests g set request_number = n.rn
from (select id, row_number() over (order by created_at, id) as rn from public.gift_requests) n
where g.id = n.id and g.request_number is null;
select setval('public.gift_request_number_seq', coalesce((select max(request_number) from public.gift_requests), 0) + 1, false);
alter table public.gift_requests alter column request_number set default nextval('public.gift_request_number_seq');
alter table public.gift_requests alter column request_number set not null;
alter sequence public.gift_request_number_seq owned by public.gift_requests.request_number;
alter table public.gift_requests add column if not exists request_code text
    generated always as ('TG-' || lpad(request_number::text, 4, '0')) stored;
create unique index if not exists gift_requests_request_number_uq on public.gift_requests(request_number);
create index if not exists gift_requests_tenant_recipient_idx on public.gift_requests(tenant_id, recipient_id);

-- 3. Form fields (all optional in the database; the API checks the required ones on submit).
alter table public.gift_requests
    add column if not exists budget_mode text not null default 'SPECIFIC'
        check (budget_mode in ('SPECIFIC', 'TOFAA_RECOMMEND')),
    add column if not exists budget_min numeric(12, 2) check (budget_min is null or budget_min >= 0),
    add column if not exists budget_max numeric(12, 2) check (budget_max is null or budget_max >= 0),
    add column if not exists initiated_via text check (initiated_via is null or length(initiated_via) <= 40),
    add column if not exists relationship text check (relationship is null or length(relationship) <= 60),
    add column if not exists relationship_context text check (relationship_context is null or length(relationship_context) <= 200),
    add column if not exists interests text[] not null default '{}',
    add column if not exists gift_style text check (gift_style is null or gift_style in ('PREMIUM', 'THOUGHTFUL', 'PERSONALISED')),
    add column if not exists delivery_address text check (delivery_address is null or length(delivery_address) <= 600),
    add column if not exists gift_purpose text check (gift_purpose is null or length(gift_purpose) <= 60),
    add column if not exists reference_file jsonb check (reference_file is null or jsonb_typeof(reference_file) = 'object');

-- 4. Private bucket for the reference image / PDF (5 MB). Read and written by the backend only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gift-request-references', 'gift-request-references', false, 5242880, array['image/png', 'image/jpeg', 'application/pdf'])
on conflict (id) do update
    set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 5. Workflow: Confirmed -> In progress -> Dispatched -> Delivered; staff "reject" now cancels.
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
    elsif p_action = 'request_changes' and v_old_status = 'PROPOSAL_READY' then
        v_new_status := 'NEEDS_INFO';
    elsif p_action = 'start_fulfilment' and v_old_status = 'CONFIRMED' then
        v_new_status := 'IN_PROGRESS';
    elsif p_action = 'dispatch' and v_old_status = 'IN_PROGRESS' then
        v_new_status := 'DISPATCHED';
    elsif p_action = 'deliver' and v_old_status = 'DISPATCHED' then
        v_new_status := 'DELIVERED';
    elsif p_action = 'reject' and v_old_status in ('IN_REVIEW', 'NEEDS_INFO') then
        v_new_status := 'CANCELLED';
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

-- 6. Approving a proposal now confirms the request (same spend rules as before).
create or replace function public.approve_gift_request_with_spend(
    p_tenant_id uuid,p_request_id uuid,p_actor_id uuid,p_note text default null
) returns public.gift_requests language plpgsql security definer set search_path = '' as $$
declare v_request public.gift_requests%rowtype; v_account public.credit_accounts%rowtype; v_member public.occasion_budget_members%rowtype;
        v_group public.occasion_budget_groups%rowtype; v_event public.event_spend_budgets%rowtype; v_cap bigint; v_spent bigint;
begin
    select * into v_request from public.gift_requests where tenant_id=p_tenant_id and id=p_request_id for update;
    if not found then raise exception 'gift_request_not_found' using errcode='P0001'; end if;
    if v_request.status='CONFIRMED' and exists(select 1 from public.credit_ledger_entries where tenant_id=p_tenant_id and source_type='gift_request' and source_id=p_request_id::text) then return v_request; end if;
    if v_request.status<>'PROPOSAL_READY' then raise exception 'invalid_gift_request_status' using errcode='P0001'; end if;
    if (v_request.event_id is null) = (v_request.occasion_id is null) or v_request.requested_credits is null or v_request.requested_credits<=0 then
        raise exception 'gift_spend_source_or_credits_required' using errcode='P0001'; end if;
    select * into v_account from public.credit_accounts where tenant_id=p_tenant_id for update;
    if not found then raise exception 'credit_account_not_found' using errcode='P0001'; end if;
    if v_account.available_credits<v_request.requested_credits then raise exception 'insufficient_credits' using errcode='P0001'; end if;
    if v_request.event_id is not null then
        select * into v_event from public.event_spend_budgets where tenant_id=p_tenant_id and event_id=v_request.event_id and recipient_id=v_request.recipient_id for update;
        if not found then raise exception 'gift_spend_budget_missing' using errcode='P0001'; end if;
        if v_event.budget_credits-v_event.spent_credits<v_request.requested_credits then raise exception 'gift_spend_budget_exceeded' using errcode='P0001'; end if;
        update public.event_spend_budgets set spent_credits=spent_credits+v_request.requested_credits,updated_at=now() where tenant_id=p_tenant_id and event_id=v_request.event_id;
    else
        select * into v_member from public.occasion_budget_members where tenant_id=p_tenant_id and occasion_id=v_request.occasion_id and recipient_id=v_request.recipient_id for update;
        if not found then raise exception 'gift_spend_budget_missing' using errcode='P0001'; end if;
        if v_member.group_allocation_id is null then v_cap:=v_member.individual_budget_credits; v_spent:=v_member.spent_credits;
        else
            select * into v_group from public.occasion_budget_groups where tenant_id=p_tenant_id and occasion_id=v_request.occasion_id and id=v_member.group_allocation_id for update;
            if v_member.individual_budget_credits is not null and v_member.individual_budget_credits-v_member.spent_credits<v_request.requested_credits then raise exception 'gift_spend_limit_exceeded' using errcode='P0001'; end if;
            if v_group.budget_mode='SHARED_POOL' then
                select coalesce(sum(spent_credits),0) into v_spent from public.occasion_budget_members where tenant_id=p_tenant_id and occasion_id=v_request.occasion_id and group_allocation_id=v_group.id;
                v_cap:=v_group.budget_credits;
            else v_cap:=coalesce(v_member.individual_budget_credits,v_group.budget_credits); v_spent:=v_member.spent_credits; end if;
        end if;
        if v_cap-v_spent<v_request.requested_credits then raise exception 'gift_spend_budget_exceeded' using errcode='P0001'; end if;
        update public.occasion_budget_members set spent_credits=spent_credits+v_request.requested_credits,updated_at=now()
        where tenant_id=p_tenant_id and occasion_id=v_request.occasion_id and recipient_id=v_request.recipient_id;
    end if;
    perform public.consume_tenant_credits(p_tenant_id,v_request.requested_credits,'gift_request',p_request_id::text,'Approved gift request: '||v_request.title,p_actor_id,'gift-request-approval/'||p_request_id::text);
    update public.gift_requests set status='CONFIRMED',status_note=nullif(trim(p_note),''),updated_at=now() where id=p_request_id returning * into v_request;
    insert into public.gift_request_events(tenant_id,gift_request_id,from_status,to_status,actor_user_id,note)
    values(p_tenant_id,p_request_id,'PROPOSAL_READY','CONFIRMED',p_actor_id,nullif(trim(p_note),''));
    return v_request;
end; $$;

notify pgrst, 'reload schema';
