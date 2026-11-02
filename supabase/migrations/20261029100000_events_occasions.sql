-- Tenant events may optionally target a recipient. Occasions have independent dates.
create unique index if not exists recipients_tenant_id_id_uq
    on public.recipients(tenant_id, id);

create table if not exists public.occasions (
    id uuid primary key default gen_random_uuid(),
    occasion_name text not null check (length(trim(occasion_name)) between 1 and 150),
    occasion_date date not null,
    description text,
    is_active boolean not null default true,
    created_by_user_id uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create unique index if not exists occasions_name_lower_uq
    on public.occasions(lower(occasion_name));

create table if not exists public.events (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    recipient_id uuid,
    event_name text not null check (length(trim(event_name)) between 1 and 150),
    event_date date not null,
    description text,
    is_active boolean not null default true,
    created_by_user_id uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint events_recipient_same_tenant_fk
        foreign key (tenant_id, recipient_id)
        references public.recipients(tenant_id, id) on delete restrict
);
create index if not exists events_tenant_date_idx
    on public.events(tenant_id, event_date, id);
create index if not exists events_tenant_recipient_date_idx
    on public.events(tenant_id, recipient_id, event_date, id)
    where recipient_id is not null;
drop trigger if exists occasions_updated_at on public.occasions;
create trigger occasions_updated_at before update on public.occasions
    for each row execute function public.handle_updated_at();
drop trigger if exists events_updated_at on public.events;
create trigger events_updated_at before update on public.events
    for each row execute function public.handle_updated_at();

alter table public.occasions enable row level security;
alter table public.events enable row level security;

-- Application services use the service role and enforce role/tenant scope.
revoke all on public.occasions, public.events from public, anon, authenticated;
grant all on public.occasions, public.events to service_role;

notify pgrst, 'reload schema';
