-- Tenant-scoped reusable groups, occasion/event budgets, credit reservations,
-- approval debit, and in-app reminders.
alter table public.gift_requests
    add column occasion_id uuid references public.occasions(id) on delete restrict,
    add column requested_credits bigint,
    add constraint gift_requests_single_spend_source check (not (occasion_id is not null and event_id is not null)),
    add constraint gift_requests_requested_credits_positive check (requested_credits is null or requested_credits > 0);
create index gift_requests_tenant_occasion_created_idx
    on public.gift_requests(tenant_id, occasion_id, created_at desc) where occasion_id is not null;

alter table public.gifts
    add column occasion_id uuid references public.occasions(id) on delete restrict,
    alter column event_id drop not null,
    add constraint gifts_single_spend_source check ((occasion_id is null) <> (event_id is null));

create table public.spend_recipient_groups (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    name text not null check (length(trim(name)) between 1 and 120),
    created_by_user_id uuid not null references public.profiles(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (tenant_id, id)
);
create unique index spend_recipient_groups_tenant_name_uq
    on public.spend_recipient_groups(tenant_id, lower(name));

create table public.spend_recipient_group_members (
    tenant_id uuid not null,
    group_id uuid not null,
    recipient_id uuid not null,
    created_at timestamptz not null default now(),
    primary key (tenant_id, group_id, recipient_id),
    foreign key (tenant_id, group_id) references public.spend_recipient_groups(tenant_id, id) on delete cascade,
    foreign key (tenant_id, recipient_id) references public.recipients(tenant_id, id) on delete restrict
);

create table public.occasion_budget_groups (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    occasion_id uuid not null references public.occasions(id) on delete restrict,
    source_group_id uuid not null,
    group_name_snapshot text not null,
    budget_mode text not null check (budget_mode in ('PER_RECIPIENT', 'SHARED_POOL')),
    budget_credits bigint not null check (budget_credits > 0),
    created_by_user_id uuid not null references public.profiles(id) on delete restrict,
    created_at timestamptz not null default now(),
    unique (tenant_id, occasion_id, id),
    unique (tenant_id, occasion_id, source_group_id),
    foreign key (tenant_id, source_group_id) references public.spend_recipient_groups(tenant_id, id) on delete restrict
);

create table public.occasion_budget_members (
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    occasion_id uuid not null references public.occasions(id) on delete restrict,
    recipient_id uuid not null,
    group_allocation_id uuid,
    individual_budget_credits bigint,
    spent_credits bigint not null default 0 check (spent_credits >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (tenant_id, occasion_id, recipient_id),
    check (individual_budget_credits is null or individual_budget_credits > 0),
    check (group_allocation_id is not null or individual_budget_credits is not null),
    foreign key (tenant_id, recipient_id) references public.recipients(tenant_id, id) on delete restrict,
    foreign key (tenant_id, occasion_id, group_allocation_id)
        references public.occasion_budget_groups(tenant_id, occasion_id, id) on delete cascade
);
create index occasion_budget_members_allocation_idx
    on public.occasion_budget_members(tenant_id, occasion_id, group_allocation_id);

create table public.event_spend_budgets (
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    event_id uuid not null,
    recipient_id uuid not null,
    budget_credits bigint not null check (budget_credits > 0),
    spent_credits bigint not null default 0 check (spent_credits >= 0),
    created_by_user_id uuid not null references public.profiles(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (tenant_id, event_id),
    check (budget_credits >= spent_credits),
    foreign key (tenant_id, event_id, recipient_id)
        references public.events(tenant_id, id, recipient_id) on delete restrict
);

create table public.gift_spend_settings (
    tenant_id uuid primary key references public.tenants(id) on delete cascade,
    reminder_days smallint[] not null default array[30, 7, 1]::smallint[],
    updated_by_user_id uuid not null references public.profiles(id) on delete restrict,
    updated_at timestamptz not null default now(),
    check (cardinality(reminder_days) <= 20 and 0 <= all(reminder_days) and 365 >= all(reminder_days))
);

create table public.gift_spend_notifications (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    source_type text not null check (source_type in ('OCCASION', 'EVENT')),
    source_id uuid not null,
    notification_type text not null default 'UPCOMING_EVENT',
    title text not null,
    body text not null,
    lead_days smallint not null check (lead_days >= 0),
    event_date date not null,
    created_at timestamptz not null default now(),
    read_at timestamptz,
    unique (tenant_id, user_id, source_type, source_id, lead_days)
);
create index gift_spend_notifications_inbox_idx
    on public.gift_spend_notifications(tenant_id, user_id, created_at desc);

-- A reservation is the unspent portion of all configured limits.
create or replace function public.gift_spend_reserved_credits(p_tenant_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
    select (coalesce((
        select sum(case when g.budget_mode = 'SHARED_POOL'
            then greatest(g.budget_credits - coalesce(m.spent, 0), 0)
            else greatest(m.limits - coalesce(m.spent, 0), 0) end)
        from public.occasion_budget_groups g
        cross join lateral (
            select coalesce(sum(bm.spent_credits), 0) spent,
                   coalesce(sum(coalesce(bm.individual_budget_credits, g.budget_credits)), 0) limits
            from public.occasion_budget_members bm
            where bm.tenant_id = g.tenant_id and bm.occasion_id = g.occasion_id
              and bm.group_allocation_id = g.id
        ) m
        where g.tenant_id = p_tenant_id
    ), 0)
    + coalesce((select sum(greatest(bm.individual_budget_credits - bm.spent_credits, 0))
        from public.occasion_budget_members bm where bm.tenant_id = p_tenant_id and bm.group_allocation_id is null), 0)
    + coalesce((select sum(greatest(eb.budget_credits - eb.spent_credits, 0))
        from public.event_spend_budgets eb where eb.tenant_id = p_tenant_id), 0))::bigint;
$$;

create or replace function public.save_spend_recipient_group(
    p_tenant_id uuid, p_group_id uuid, p_name text, p_recipient_ids uuid[], p_actor_id uuid
) returns public.spend_recipient_groups language plpgsql security definer set search_path = '' as $$
declare v_group public.spend_recipient_groups%rowtype; v_count integer;
begin
    if nullif(trim(p_name), '') is null or coalesce(cardinality(p_recipient_ids), 0) = 0 then
        raise exception 'invalid_spend_group' using errcode = 'P0001'; end if;
    select count(distinct x) into v_count from unnest(p_recipient_ids) x;
    if v_count <> cardinality(p_recipient_ids) then raise exception 'duplicate_group_recipient' using errcode = 'P0001'; end if;
    if exists (select 1 from unnest(p_recipient_ids) x left join public.recipients r
        on r.tenant_id = p_tenant_id and r.id = x and r.deleted_at is null where r.id is null) then
        raise exception 'recipient_not_in_tenant' using errcode = 'P0001'; end if;
    if p_group_id is null then
        insert into public.spend_recipient_groups(tenant_id, name, created_by_user_id)
        values (p_tenant_id, trim(p_name), p_actor_id) returning * into v_group;
    else
        update public.spend_recipient_groups set name = trim(p_name), updated_at = now()
        where tenant_id = p_tenant_id and id = p_group_id returning * into v_group;
        if not found then raise exception 'spend_group_not_found' using errcode = 'P0001'; end if;
        delete from public.spend_recipient_group_members where tenant_id = p_tenant_id and group_id = p_group_id;
    end if;
    insert into public.spend_recipient_group_members(tenant_id, group_id, recipient_id)
    select p_tenant_id, v_group.id, x from unnest(p_recipient_ids) x;
    return v_group;
end; $$;

create or replace function public.import_spend_group_for_occasion(
    p_tenant_id uuid, p_occasion_id uuid, p_group_id uuid, p_budget_mode text, p_budget_credits bigint, p_actor_id uuid
) returns public.occasion_budget_groups language plpgsql security definer set search_path = '' as $$
declare v_account public.credit_accounts%rowtype; v_occasion public.occasions%rowtype; v_group public.spend_recipient_groups%rowtype; v_result public.occasion_budget_groups%rowtype;
begin
    select * into v_account from public.credit_accounts where tenant_id = p_tenant_id for update;
    if not found then raise exception 'credit_account_not_found' using errcode = 'P0001'; end if;
    select * into v_occasion from public.occasions where id = p_occasion_id and is_active
      and (tenant_id is null or tenant_id = p_tenant_id);
    if not found then raise exception 'occasion_not_available' using errcode = 'P0001'; end if;
    select * into v_group from public.spend_recipient_groups where tenant_id = p_tenant_id and id = p_group_id;
    if not found then raise exception 'spend_group_not_found' using errcode = 'P0001'; end if;
    if p_budget_mode not in ('PER_RECIPIENT', 'SHARED_POOL') or p_budget_credits <= 0 then raise exception 'invalid_spend_budget' using errcode = 'P0001'; end if;
    insert into public.occasion_budget_groups(tenant_id, occasion_id, source_group_id, group_name_snapshot, budget_mode, budget_credits, created_by_user_id)
    values (p_tenant_id, p_occasion_id, p_group_id, v_group.name, p_budget_mode, p_budget_credits, p_actor_id) returning * into v_result;
    if exists (select 1 from public.spend_recipient_group_members gm
        left join public.recipients r on r.tenant_id=gm.tenant_id and r.id=gm.recipient_id and r.deleted_at is null
        left join public.occasion_budget_members bm on bm.tenant_id=gm.tenant_id and bm.occasion_id=p_occasion_id and bm.recipient_id=gm.recipient_id
        where gm.tenant_id=p_tenant_id and gm.group_id=p_group_id and (r.id is null or bm.recipient_id is not null)) then
        raise exception 'occasion_group_membership_conflict' using errcode = 'P0001'; end if;
    insert into public.occasion_budget_members(tenant_id, occasion_id, recipient_id, group_allocation_id)
    select p_tenant_id, p_occasion_id, recipient_id, v_result.id from public.spend_recipient_group_members
    where tenant_id=p_tenant_id and group_id=p_group_id;
    if public.gift_spend_reserved_credits(p_tenant_id) > v_account.available_credits then
        raise exception 'spend_reservation_exceeds_balance' using errcode = 'P0001'; end if;
    return v_result;
end; $$;

create or replace function public.update_occasion_group_budget(
    p_tenant_id uuid, p_occasion_id uuid, p_allocation_id uuid, p_budget_mode text, p_budget_credits bigint
) returns public.occasion_budget_groups language plpgsql security definer set search_path = '' as $$
declare v_account public.credit_accounts%rowtype; v_group public.occasion_budget_groups%rowtype;
begin
    select * into v_account from public.credit_accounts where tenant_id=p_tenant_id for update;
    if not found then raise exception 'credit_account_not_found' using errcode='P0001'; end if;
    select * into v_group from public.occasion_budget_groups where tenant_id=p_tenant_id and occasion_id=p_occasion_id and id=p_allocation_id for update;
    if not found then raise exception 'occasion_group_not_found' using errcode='P0001'; end if;
    if p_budget_mode not in ('PER_RECIPIENT','SHARED_POOL') or p_budget_credits <= 0 then raise exception 'invalid_spend_budget' using errcode='P0001'; end if;
    if (p_budget_mode='SHARED_POOL' and p_budget_credits < (select coalesce(sum(spent_credits),0) from public.occasion_budget_members where tenant_id=p_tenant_id and occasion_id=p_occasion_id and group_allocation_id=p_allocation_id))
       or (p_budget_mode='PER_RECIPIENT' and exists(select 1 from public.occasion_budget_members bm where bm.tenant_id=p_tenant_id and bm.occasion_id=p_occasion_id and bm.group_allocation_id=p_allocation_id and coalesce(bm.individual_budget_credits,p_budget_credits)<bm.spent_credits)) then
        raise exception 'budget_below_spent' using errcode='P0001'; end if;
    update public.occasion_budget_groups set budget_mode=p_budget_mode,budget_credits=p_budget_credits where id=p_allocation_id returning * into v_group;
    if public.gift_spend_reserved_credits(p_tenant_id)>v_account.available_credits then raise exception 'spend_reservation_exceeds_balance' using errcode='P0001'; end if;
    return v_group;
end; $$;

create or replace function public.set_occasion_recipient_budget(
    p_tenant_id uuid,p_occasion_id uuid,p_recipient_id uuid,p_budget_credits bigint
) returns public.occasion_budget_members language plpgsql security definer set search_path = '' as $$
declare v_account public.credit_accounts%rowtype; v_member public.occasion_budget_members%rowtype; v_occasion public.occasions%rowtype;
begin
    select * into v_account from public.credit_accounts where tenant_id=p_tenant_id for update;
    if not found then raise exception 'credit_account_not_found' using errcode='P0001'; end if;
    select * into v_occasion from public.occasions where id=p_occasion_id and is_active and (tenant_id is null or tenant_id=p_tenant_id);
    if not found then raise exception 'occasion_not_available' using errcode='P0001'; end if;
    if p_budget_credits <= 0 then raise exception 'invalid_spend_budget' using errcode='P0001'; end if;
    insert into public.occasion_budget_members(tenant_id,occasion_id,recipient_id,individual_budget_credits)
    values(p_tenant_id,p_occasion_id,p_recipient_id,p_budget_credits)
    on conflict(tenant_id,occasion_id,recipient_id) do update set individual_budget_credits=excluded.individual_budget_credits,updated_at=now()
    returning * into v_member;
    if p_budget_credits < v_member.spent_credits then raise exception 'budget_below_spent' using errcode='P0001'; end if;
    if public.gift_spend_reserved_credits(p_tenant_id)>v_account.available_credits then raise exception 'spend_reservation_exceeds_balance' using errcode='P0001'; end if;
    return v_member;
end; $$;

create or replace function public.set_event_spend_budget(
    p_tenant_id uuid,p_event_id uuid,p_recipient_id uuid,p_budget_credits bigint,p_actor_id uuid
) returns public.event_spend_budgets language plpgsql security definer set search_path = '' as $$
declare v_account public.credit_accounts%rowtype; v_budget public.event_spend_budgets%rowtype;
begin
    select * into v_account from public.credit_accounts where tenant_id=p_tenant_id for update;
    if not found then raise exception 'credit_account_not_found' using errcode='P0001'; end if;
    if p_budget_credits <= 0 then raise exception 'invalid_spend_budget' using errcode='P0001'; end if;
    insert into public.event_spend_budgets(tenant_id,event_id,recipient_id,budget_credits,created_by_user_id)
    select p_tenant_id,e.id,e.recipient_id,p_budget_credits,p_actor_id from public.events e
    where e.tenant_id=p_tenant_id and e.id=p_event_id and e.is_active and e.recipient_id=p_recipient_id
    on conflict(tenant_id,event_id) do update set budget_credits=excluded.budget_credits,updated_at=now()
    returning * into v_budget;
    if not found then raise exception 'event_recipient_mismatch' using errcode='P0001'; end if;
    if v_budget.budget_credits<v_budget.spent_credits then raise exception 'budget_below_spent' using errcode='P0001'; end if;
    if public.gift_spend_reserved_credits(p_tenant_id)>v_account.available_credits then raise exception 'spend_reservation_exceeds_balance' using errcode='P0001'; end if;
    return v_budget;
end; $$;

-- Other credit-consuming features must preserve outstanding spend reservations.
create or replace function public.consume_tenant_credits(
    p_tenant_id uuid,p_credits bigint,p_source_type text,p_source_id text,p_description text,p_actor_id uuid,p_idempotency_key text
) returns public.credit_ledger_entries language plpgsql security definer set search_path = '' as $$
declare v_account public.credit_accounts%rowtype; v_entry public.credit_ledger_entries%rowtype;
begin
    if p_credits<=0 or nullif(trim(p_source_type),'') is null or nullif(trim(p_source_id),'') is null
       or p_idempotency_key is null or length(trim(p_idempotency_key))<8 then raise exception 'invalid_credit_usage' using errcode='P0001'; end if;
    select * into v_entry from public.credit_ledger_entries where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key;
    if found then
        if v_entry.entry_type<>'usage' or v_entry.source_type<>p_source_type or v_entry.source_id<>p_source_id or v_entry.credits_delta<>-p_credits then
            raise exception 'idempotency_key_conflict' using errcode='P0001'; end if;
        return v_entry;
    end if;
    select * into v_account from public.credit_accounts where tenant_id=p_tenant_id for update;
    if not found then raise exception 'credit_account_not_found' using errcode='P0001'; end if;
    if v_account.available_credits-p_credits<public.gift_spend_reserved_credits(p_tenant_id) then raise exception 'credits_reserved_for_gift_spend' using errcode='P0001'; end if;
    update public.credit_accounts set available_credits=available_credits-p_credits,updated_at=now() where tenant_id=p_tenant_id returning * into v_account;
    insert into public.credit_ledger_entries(tenant_id,entry_type,credits_delta,balance_after,source_type,source_id,description,created_by_user_id,idempotency_key)
    values(p_tenant_id,'usage',-p_credits,v_account.available_credits,trim(p_source_type),trim(p_source_id),coalesce(nullif(trim(p_description),''),'Credits used.'),p_actor_id,p_idempotency_key)
    returning * into v_entry;
    return v_entry;
end; $$;

-- The request status, spent counter, and immutable ledger entry commit or roll back together.
create or replace function public.approve_gift_request_with_spend(
    p_tenant_id uuid,p_request_id uuid,p_actor_id uuid,p_note text default null
) returns public.gift_requests language plpgsql security definer set search_path = '' as $$
declare v_request public.gift_requests%rowtype; v_account public.credit_accounts%rowtype; v_member public.occasion_budget_members%rowtype;
        v_group public.occasion_budget_groups%rowtype; v_event public.event_spend_budgets%rowtype; v_cap bigint; v_spent bigint;
begin
    select * into v_request from public.gift_requests where tenant_id=p_tenant_id and id=p_request_id for update;
    if not found then raise exception 'gift_request_not_found' using errcode='P0001'; end if;
    if v_request.status='APPROVED' and exists(select 1 from public.credit_ledger_entries where tenant_id=p_tenant_id and source_type='gift_request' and source_id=p_request_id::text) then return v_request; end if;
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
    update public.gift_requests set status='APPROVED',status_note=nullif(trim(p_note),''),updated_at=now() where id=p_request_id returning * into v_request;
    insert into public.gift_request_events(tenant_id,gift_request_id,from_status,to_status,actor_user_id,note)
    values(p_tenant_id,p_request_id,'PROPOSAL_READY','APPROVED',p_actor_id,nullif(trim(p_note),''));
    return v_request;
end; $$;

create or replace function public.generate_gift_spend_notifications()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
    insert into public.gift_spend_notifications(tenant_id,user_id,source_type,source_id,title,body,lead_days,event_date)
    select scope.tenant_id, targets.user_id, 'OCCASION', o.id, o.occasion_name,
        'Upcoming occasion in '||s.lead_days||' day(s). Review gift budgets and requests.',s.lead_days,o.occasion_date
    from public.occasions o
    join (
        select id as occasion_id, tenant_id from public.occasions where tenant_id is not null
        union
        select o.id, b.tenant_id from public.occasions o
        join public.occasion_budget_groups b on b.occasion_id=o.id where o.tenant_id is null
        union
        select o.id, b.tenant_id from public.occasions o
        join public.occasion_budget_members b on b.occasion_id=o.id where o.tenant_id is null
    ) scope on scope.occasion_id=o.id
    join public.tenants t on t.id=scope.tenant_id and t.status='ACTIVE'
    join lateral (select unnest(coalesce(gs.reminder_days,array[30,7,1]::smallint[])) lead_days from (select 1) x
        left join public.gift_spend_settings gs on gs.tenant_id=scope.tenant_id) s on o.occasion_date=current_date+s.lead_days
    join lateral (select tm.user_id from public.tenant_memberships tm join public.profiles p on p.id=tm.user_id
        where tm.tenant_id=scope.tenant_id and tm.status='ACTIVE' and tm.membership_type='CLIENT' and p.role='CLIENT'
        union select a.user_id from public.team_client_assignments a join public.profiles p on p.id=a.user_id
        where a.tenant_id=scope.tenant_id and a.active and p.role='KAM') targets on true
    where o.is_active and o.occasion_date is not null
    on conflict(tenant_id,user_id,source_type,source_id,lead_days) do nothing;
    insert into public.gift_spend_notifications(tenant_id,user_id,source_type,source_id,title,body,lead_days,event_date)
    select e.tenant_id, targets.user_id, 'EVENT', e.id, e.event_name,
        'Upcoming recipient event in '||s.lead_days||' day(s). Review the gift budget and request.',s.lead_days,e.event_date
    from public.events e join public.tenants t on t.id=e.tenant_id and t.status='ACTIVE'
    join lateral (select unnest(coalesce(gs.reminder_days,array[30,7,1]::smallint[])) lead_days from (select 1) x
        left join public.gift_spend_settings gs on gs.tenant_id=e.tenant_id) s on e.event_date=current_date+s.lead_days
    join lateral (select tm.user_id from public.tenant_memberships tm join public.profiles p on p.id=tm.user_id
        where tm.tenant_id=e.tenant_id and tm.status='ACTIVE' and tm.membership_type='CLIENT' and p.role='CLIENT'
        union select a.user_id from public.team_client_assignments a join public.profiles p on p.id=a.user_id
        where a.tenant_id=e.tenant_id and a.active and p.role='KAM') targets on true
    where e.is_active on conflict(tenant_id,user_id,source_type,source_id,lead_days) do nothing;
    get diagnostics v_count = row_count;
    return v_count;
end; $$;

-- Keep reservations safe when an administrator debits or removes tenant credits.
create or replace function public.post_credit_adjustment(
    p_tenant_id uuid,p_actor_id uuid,p_direction text,p_credits bigint,p_reason text,p_reference text,p_idempotency_key text
) returns public.credit_ledger_entries language plpgsql security definer set search_path = '' as $$
declare v_price public.credit_pricing%rowtype; v_account public.credit_accounts%rowtype; v_entry public.credit_ledger_entries%rowtype; v_delta bigint;
begin
    if p_direction not in ('credit','debit') or p_credits<=0 or nullif(trim(p_reason),'') is null or p_idempotency_key is null or length(trim(p_idempotency_key))<8 then raise exception 'invalid_credit_adjustment' using errcode='P0001'; end if;
    select * into v_entry from public.credit_ledger_entries where tenant_id=p_tenant_id and idempotency_key=p_idempotency_key;
    if found then
        if v_entry.entry_type<>'adjustment'
           or v_entry.credits_delta<>(case when p_direction='credit' then p_credits else -p_credits end)
           or v_entry.reason<>trim(p_reason)
           or v_entry.reference is distinct from nullif(trim(p_reference),'') then
            raise exception 'idempotency_key_conflict' using errcode='P0001'; end if;
        return v_entry;
    end if;
    select * into v_account from public.credit_accounts where tenant_id=p_tenant_id for update;
    if not found then select * into v_price from public.credit_pricing where id=1; if not found then raise exception 'credit_pricing_not_configured' using errcode='P0001'; end if;
        insert into public.credit_accounts(tenant_id,currency) values(p_tenant_id,v_price.currency) on conflict(tenant_id) do nothing;
        select * into v_account from public.credit_accounts where tenant_id=p_tenant_id for update; end if;
    v_delta:=case when p_direction='credit' then p_credits else -p_credits end;
    if v_account.available_credits+v_delta<public.gift_spend_reserved_credits(p_tenant_id) then raise exception 'spend_reservation_exceeds_balance' using errcode='P0001'; end if;
    update public.credit_accounts set available_credits=available_credits+v_delta,updated_at=now() where tenant_id=p_tenant_id returning * into v_account;
    insert into public.credit_ledger_entries(tenant_id,entry_type,credits_delta,balance_after,source_type,description,reason,reference,created_by_user_id,idempotency_key)
    values(p_tenant_id,'adjustment',v_delta,v_account.available_credits,'admin_adjustment','Super admin credit adjustment.',trim(p_reason),nullif(trim(p_reference),''),p_actor_id,p_idempotency_key) returning * into v_entry;
    return v_entry;
end; $$;

alter table public.spend_recipient_groups enable row level security;
alter table public.spend_recipient_group_members enable row level security;
alter table public.occasion_budget_groups enable row level security;
alter table public.occasion_budget_members enable row level security;
alter table public.event_spend_budgets enable row level security;
alter table public.gift_spend_settings enable row level security;
alter table public.gift_spend_notifications enable row level security;
revoke all on public.spend_recipient_groups,public.spend_recipient_group_members,public.occasion_budget_groups,
    public.occasion_budget_members,public.event_spend_budgets,public.gift_spend_settings,public.gift_spend_notifications
    from public,anon,authenticated;
grant all on public.spend_recipient_groups,public.spend_recipient_group_members,public.occasion_budget_groups,
    public.occasion_budget_members,public.event_spend_budgets,public.gift_spend_settings,public.gift_spend_notifications to service_role;
revoke all on function public.gift_spend_reserved_credits(uuid),
    public.save_spend_recipient_group(uuid,uuid,text,uuid[],uuid),
    public.import_spend_group_for_occasion(uuid,uuid,uuid,text,bigint,uuid),
    public.update_occasion_group_budget(uuid,uuid,uuid,text,bigint),
    public.set_occasion_recipient_budget(uuid,uuid,uuid,bigint),
    public.set_event_spend_budget(uuid,uuid,uuid,bigint,uuid),
    public.approve_gift_request_with_spend(uuid,uuid,uuid,text),
    public.generate_gift_spend_notifications() from public,anon,authenticated;
grant execute on function public.gift_spend_reserved_credits(uuid),
    public.save_spend_recipient_group(uuid,uuid,text,uuid[],uuid),
    public.import_spend_group_for_occasion(uuid,uuid,uuid,text,bigint,uuid),
    public.update_occasion_group_budget(uuid,uuid,uuid,text,bigint),
    public.set_occasion_recipient_budget(uuid,uuid,uuid,bigint),
    public.set_event_spend_budget(uuid,uuid,uuid,bigint,uuid),
    public.approve_gift_request_with_spend(uuid,uuid,uuid,text),
    public.generate_gift_spend_notifications() to service_role;

create extension if not exists pg_cron;
do $$ begin
    if exists(select 1 from pg_extension where extname='pg_cron') then
        perform cron.schedule('gift-spend-daily-reminders','0 0 * * *','select public.generate_gift_spend_notifications();');
    end if;
end $$;

notify pgrst, 'reload schema';
