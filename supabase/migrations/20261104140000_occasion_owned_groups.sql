-- Groups created directly inside an occasion: a name and its people, no budget until it is set later.
alter table public.occasion_budget_groups alter column source_group_id drop not null;

do $$
declare c record;
begin
    for c in select conname from pg_constraint
             where conrelid = 'public.occasion_budget_groups'::regclass and contype = 'c'
               and pg_get_constraintdef(oid) ilike '%budget_credits > 0%' loop
        execute format('alter table public.occasion_budget_groups drop constraint %I', c.conname);
    end loop;
end $$;
alter table public.occasion_budget_groups
    add constraint occasion_budget_groups_budget_nonnegative check (budget_credits >= 0);

create unique index if not exists occasion_budget_groups_name_idx
    on public.occasion_budget_groups (tenant_id, occasion_id, lower(group_name_snapshot));

create or replace function public.create_occasion_group(
    p_tenant_id uuid, p_occasion_id uuid, p_group_name text, p_recipient_ids uuid[], p_actor_id uuid
) returns public.occasion_budget_groups language plpgsql security definer set search_path = '' as $$
declare v_name text := nullif(btrim(p_group_name), ''); v_group public.occasion_budget_groups%rowtype; v_ids uuid[];
begin
    select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_recipient_ids, '{}')) x;
    if v_name is null then raise exception 'invalid_group_name' using errcode='P0001'; end if;
    if cardinality(v_ids) = 0 then raise exception 'group_needs_recipients' using errcode='P0001'; end if;
    perform 1 from public.occasions where id = p_occasion_id and is_active and (tenant_id is null or tenant_id = p_tenant_id);
    if not found then raise exception 'occasion_not_available' using errcode='P0001'; end if;
    if exists (select 1 from public.occasion_budget_groups where tenant_id = p_tenant_id and occasion_id = p_occasion_id and lower(group_name_snapshot) = lower(v_name)) then
        raise exception 'occasion_group_name_taken' using errcode='P0001'; end if;
    if (select count(*) from public.recipients r where r.tenant_id = p_tenant_id and r.id = any(v_ids) and r.deleted_at is null) <> cardinality(v_ids) then
        raise exception 'recipient_not_found' using errcode='P0001'; end if;
    if exists (select 1 from public.occasion_budget_members where tenant_id = p_tenant_id and occasion_id = p_occasion_id and recipient_id = any(v_ids)) then
        raise exception 'occasion_group_membership_conflict' using errcode='P0001'; end if;
    insert into public.occasion_budget_groups(tenant_id, occasion_id, source_group_id, group_name_snapshot, budget_mode, budget_credits, created_by_user_id)
    values (p_tenant_id, p_occasion_id, null, v_name, 'PER_RECIPIENT', 0, p_actor_id) returning * into v_group;
    insert into public.occasion_budget_members(tenant_id, occasion_id, recipient_id, group_allocation_id)
    select p_tenant_id, p_occasion_id, x, v_group.id from unnest(v_ids) x;
    return v_group;
end; $$;

create or replace function public.update_occasion_group(
    p_tenant_id uuid, p_occasion_id uuid, p_group_id uuid, p_group_name text default null,
    p_recipient_ids uuid[] default null, p_budget_mode text default null, p_budget_credits bigint default null
) returns public.occasion_budget_groups language plpgsql security definer set search_path = '' as $$
declare v_account public.credit_accounts%rowtype; v_group public.occasion_budget_groups%rowtype;
        v_name text := nullif(btrim(p_group_name), ''); v_ids uuid[]; v_mode text; v_credits bigint;
begin
    select * into v_account from public.credit_accounts where tenant_id = p_tenant_id for update;
    if not found then raise exception 'credit_account_not_found' using errcode='P0001'; end if;
    select * into v_group from public.occasion_budget_groups where tenant_id = p_tenant_id and occasion_id = p_occasion_id and id = p_group_id for update;
    if not found then raise exception 'occasion_group_not_found' using errcode='P0001'; end if;

    if p_group_name is not null then
        if v_name is null then raise exception 'invalid_group_name' using errcode='P0001'; end if;
        if exists (select 1 from public.occasion_budget_groups where tenant_id = p_tenant_id and occasion_id = p_occasion_id and id <> p_group_id and lower(group_name_snapshot) = lower(v_name)) then
            raise exception 'occasion_group_name_taken' using errcode='P0001'; end if;
        update public.occasion_budget_groups set group_name_snapshot = v_name where id = p_group_id returning * into v_group;
    end if;

    if p_recipient_ids is not null then
        select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_recipient_ids) x;
        if cardinality(v_ids) = 0 then raise exception 'group_needs_recipients' using errcode='P0001'; end if;
        if (select count(*) from public.recipients r where r.tenant_id = p_tenant_id and r.id = any(v_ids) and r.deleted_at is null) <> cardinality(v_ids) then
            raise exception 'recipient_not_found' using errcode='P0001'; end if;
        if exists (select 1 from public.occasion_budget_members where tenant_id = p_tenant_id and occasion_id = p_occasion_id
                   and recipient_id = any(v_ids) and group_allocation_id is distinct from p_group_id) then
            raise exception 'occasion_group_membership_conflict' using errcode='P0001'; end if;
        if exists (select 1 from public.occasion_budget_members where tenant_id = p_tenant_id and occasion_id = p_occasion_id
                   and group_allocation_id = p_group_id and recipient_id <> all(v_ids) and spent_credits > 0) then
            raise exception 'member_has_spend' using errcode='P0001'; end if;
        delete from public.occasion_budget_members where tenant_id = p_tenant_id and occasion_id = p_occasion_id
            and group_allocation_id = p_group_id and recipient_id <> all(v_ids);
        insert into public.occasion_budget_members(tenant_id, occasion_id, recipient_id, group_allocation_id)
        select p_tenant_id, p_occasion_id, x, p_group_id from unnest(v_ids) x
        on conflict (tenant_id, occasion_id, recipient_id) do nothing;
    end if;

    if p_budget_mode is not null or p_budget_credits is not null then
        v_mode := coalesce(p_budget_mode, v_group.budget_mode); v_credits := coalesce(p_budget_credits, v_group.budget_credits);
        if v_mode not in ('PER_RECIPIENT', 'SHARED_POOL') or v_credits < 0 then raise exception 'invalid_spend_budget' using errcode='P0001'; end if;
        if (v_mode = 'SHARED_POOL' and v_credits < (select coalesce(sum(spent_credits), 0) from public.occasion_budget_members where tenant_id = p_tenant_id and occasion_id = p_occasion_id and group_allocation_id = p_group_id))
           or (v_mode = 'PER_RECIPIENT' and exists (select 1 from public.occasion_budget_members bm where bm.tenant_id = p_tenant_id and bm.occasion_id = p_occasion_id and bm.group_allocation_id = p_group_id and coalesce(bm.individual_budget_credits, v_credits) < bm.spent_credits)) then
            raise exception 'budget_below_spent' using errcode='P0001'; end if;
        update public.occasion_budget_groups set budget_mode = v_mode, budget_credits = v_credits where id = p_group_id returning * into v_group;
    end if;

    if public.gift_spend_reserved_credits(p_tenant_id) > v_account.available_credits then raise exception 'spend_reservation_exceeds_balance' using errcode='P0001'; end if;
    return v_group;
end; $$;

create or replace function public.delete_occasion_group(p_tenant_id uuid, p_occasion_id uuid, p_group_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
    perform 1 from public.occasion_budget_groups where tenant_id = p_tenant_id and occasion_id = p_occasion_id and id = p_group_id for update;
    if not found then raise exception 'occasion_group_not_found' using errcode='P0001'; end if;
    if exists (select 1 from public.occasion_budget_members where tenant_id = p_tenant_id and group_allocation_id = p_group_id and spent_credits > 0) then
        raise exception 'group_has_spend' using errcode='P0001'; end if;
    delete from public.occasion_budget_groups where tenant_id = p_tenant_id and id = p_group_id;
end; $$;

revoke all on function public.create_occasion_group(uuid,uuid,text,uuid[],uuid),
    public.update_occasion_group(uuid,uuid,uuid,text,uuid[],text,bigint),
    public.delete_occasion_group(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.create_occasion_group(uuid,uuid,text,uuid[],uuid),
    public.update_occasion_group(uuid,uuid,uuid,text,uuid[],text,bigint),
    public.delete_occasion_group(uuid,uuid,uuid) to service_role;
notify pgrst, 'reload schema';
