-- Recipients directory, second pass: a "primary contact" flag and family relationships (spouse, child, ...).
-- Safe to run whether or not 20261112100000 was applied: every step is idempotent, and every new column is
-- nullable or has a default, so existing recipients and flows keep working.

alter table public.recipients
    add column if not exists relationship text,
    add column if not exists designation text,
    add column if not exists status text not null default 'ACTIVE',
    add column if not exists is_primary boolean not null default false;

alter table public.recipients drop constraint if exists recipients_relationship_check;
alter table public.recipients add constraint recipients_relationship_check
    check (relationship is null or relationship in (
        'CLIENT', 'EMPLOYEE', 'PARTNER', 'ADVISOR', 'VENDOR', 'FAMILY', 'SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'FRIEND', 'OTHER'));

alter table public.recipients drop constraint if exists recipients_designation_check;
alter table public.recipients add constraint recipients_designation_check
    check (designation is null or char_length(designation) <= 120);

alter table public.recipients drop constraint if exists recipients_status_check;
alter table public.recipients add constraint recipients_status_check
    check (status in ('ACTIVE', 'ARCHIVED'));

create index if not exists recipients_tenant_status_idx
    on public.recipients (tenant_id, status)
    where deleted_at is null;

notify pgrst, 'reload schema';
