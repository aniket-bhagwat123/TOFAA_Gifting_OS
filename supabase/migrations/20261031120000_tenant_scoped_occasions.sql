-- New occasions belong to one tenant. Existing catalog rows remain unassigned
-- and are excluded from tenant-scoped API queries until explicitly migrated.
alter table public.occasions
    add column tenant_id uuid references public.tenants(id) on delete restrict;

drop index if exists public.occasions_name_lower_uq;
create unique index occasions_tenant_name_lower_uq
    on public.occasions(tenant_id, lower(occasion_name))
    where tenant_id is not null;
create unique index occasions_global_name_lower_uq
    on public.occasions(lower(occasion_name))
    where tenant_id is null;
create index occasions_tenant_date_idx
    on public.occasions(tenant_id, occasion_date, id)
    where tenant_id is not null;

notify pgrst, 'reload schema';
