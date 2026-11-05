-- A default budget saved on a recipient group or a single recipient, with no occasion.
-- It pre-fills the budget when gifts are sent to them; occasion budgets are unchanged.
create table public.spend_default_budgets (
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    target_type text not null check (target_type in ('GROUP', 'RECIPIENT')),
    target_id uuid not null,
    budget_mode text not null check (budget_mode in ('PER_RECIPIENT', 'SHARED_POOL')),
    budget_credits bigint not null check (budget_credits > 0),
    updated_at timestamptz not null default now(),
    primary key (tenant_id, target_type, target_id)
);

alter table public.spend_default_budgets enable row level security;
revoke all on public.spend_default_budgets from anon, authenticated;
grant select, insert, update, delete on public.spend_default_budgets to service_role;
notify pgrst, 'reload schema';
