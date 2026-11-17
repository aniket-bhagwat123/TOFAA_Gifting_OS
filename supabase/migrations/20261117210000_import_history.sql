-- Import history: each recipient import is stored as a batch, and every recipient it created points back to it,
-- so a whole import can be reverted later from the Activity page.
create table if not exists public.import_batches (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    kind text not null default 'RECIPIENTS' check (kind in ('RECIPIENTS')),
    file_name text check (file_name is null or length(file_name) <= 255),
    total_rows integer not null default 0 check (total_rows >= 0),
    created_count integer not null default 0 check (created_count >= 0),
    failed_count integer not null default 0 check (failed_count >= 0),
    groups_created uuid[] not null default '{}',
    groups_updated integer not null default 0 check (groups_updated >= 0),
    status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVERTED')),
    created_by_user_id uuid references public.profiles(id) on delete set null,
    created_by_name text,
    created_at timestamptz not null default now(),
    reverted_at timestamptz,
    reverted_by_name text
);
create index if not exists import_batches_tenant_idx on public.import_batches(tenant_id, created_at desc);
alter table public.import_batches enable row level security;

alter table public.recipients add column if not exists import_batch_id uuid references public.import_batches(id) on delete set null;
create index if not exists recipients_import_batch_idx on public.recipients(import_batch_id) where import_batch_id is not null;
notify pgrst, 'reload schema';
