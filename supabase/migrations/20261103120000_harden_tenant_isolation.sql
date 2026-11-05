-- Database-level tenant isolation: these rules hold even if application code has a bug.
--
-- Constraints below apply to new writes, so this migration cannot fail on existing rows.
-- To find rows written before it, run these read-only checks; each should return nothing:
--
--   select 'gift_requests' src, r.id from public.gift_requests r join public.occasions o on o.id = r.occasion_id
--    where o.tenant_id is not null and o.tenant_id <> r.tenant_id
--   union all select 'gifts', g.id from public.gifts g join public.occasions o on o.id = g.occasion_id
--    where o.tenant_id is not null and o.tenant_id <> g.tenant_id
--   union all select 'occasion_budget_groups', b.id from public.occasion_budget_groups b join public.occasions o on o.id = b.occasion_id
--    where o.tenant_id is not null and o.tenant_id <> b.tenant_id
--   union all select 'contract_tier_budgets', b.id from public.contract_tier_budgets b join public.contracts c on c.id = b.contract_id
--    where c.tenant_id <> b.tenant_id;
--
--   select tenant_id, occasion_id, recipient_id from public.occasion_budget_members m join public.occasions o on o.id = m.occasion_id
--    where o.tenant_id is not null and o.tenant_id <> m.tenant_id;
--
-- Once they are clean: alter table public.contract_tier_budgets validate constraint contract_tier_budgets_tenant_contract_fk;

-- 1. RLS access now matches the API rules. Previously a deactivated user whose membership was
--    still ACTIVE kept read access, and so did staff through their home-tenant membership.
create or replace function private.has_tenant_access(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.is_active
          and not p.must_reset_password
          and (
              p.role = 'SUPER_ADMIN'
              or (p.role = 'KAM' and exists (
                  select 1 from public.team_client_assignments a
                  where a.user_id = p.id and a.tenant_id = target_tenant_id and a.active
              ))
              or (p.role = 'CLIENT' and exists (
                  select 1 from public.tenant_memberships m
                  join public.tenants t on t.id = m.tenant_id
                  where m.user_id = p.id and m.tenant_id = target_tenant_id
                    and m.status = 'ACTIVE' and m.membership_type = 'CLIENT' and t.status = 'ACTIVE'
              ))
          )
    );
$$;

-- 2. Occasions are global or tenant-owned, so a plain foreign key cannot stop one tenant's record
--    from pointing at another tenant's occasion.
create or replace function private.enforce_occasion_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if new.occasion_id is not null and not exists (
        select 1 from public.occasions o
        where o.id = new.occasion_id and (o.tenant_id is null or o.tenant_id = new.tenant_id)
    ) then
        raise exception 'occasion_not_in_tenant' using errcode = '23514';
    end if;
    return new;
end;
$$;
revoke all on function private.enforce_occasion_tenant() from public, anon, authenticated;

do $$
declare
    target text;
begin
    foreach target in array array['gift_requests', 'gifts', 'occasion_budget_groups', 'occasion_budget_members'] loop
        execute format('drop trigger if exists enforce_occasion_tenant on public.%I', target);
        execute format(
            'create trigger enforce_occasion_tenant before insert or update of occasion_id, tenant_id '
            'on public.%I for each row execute function private.enforce_occasion_tenant()',
            target
        );
    end loop;
end;
$$;

-- 3. A contract tier budget must belong to its contract's tenant.
alter table public.contract_tier_budgets
    add constraint contract_tier_budgets_tenant_contract_fk
    foreign key (tenant_id, contract_id) references public.contracts(tenant_id, id)
    on delete restrict not valid;

-- 4. A record can never move to another tenant. Applied to every table with a tenant_id, including
--    tables added before this migration that a later audit might otherwise miss.
create or replace function private.prevent_tenant_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.tenant_id is distinct from old.tenant_id then
        raise exception 'tenant_id_is_immutable' using errcode = '23514';
    end if;
    return new;
end;
$$;
revoke all on function private.prevent_tenant_reassignment() from public, anon, authenticated;

do $$
declare
    target text;
begin
    for target in
        select c.table_name
        from information_schema.columns c
        join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
        where c.table_schema = 'public' and c.column_name = 'tenant_id' and t.table_type = 'BASE TABLE'
    loop
        execute format('drop trigger if exists prevent_tenant_reassignment on public.%I', target);
        execute format(
            'create trigger prevent_tenant_reassignment before update of tenant_id '
            'on public.%I for each row execute function private.prevent_tenant_reassignment()',
            target
        );
    end loop;
end;
$$;

notify pgrst, 'reload schema';
