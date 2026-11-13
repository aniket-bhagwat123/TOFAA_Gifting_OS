-- Recipients directory: relationship, job title and archive status.
-- Additive and nullable (status defaults to ACTIVE), so every existing recipient and flow keeps working.

alter table public.recipients
    add column if not exists relationship text
        check (relationship is null or relationship in ('CLIENT', 'EMPLOYEE', 'PARTNER', 'ADVISOR', 'VENDOR', 'FAMILY', 'FRIEND', 'OTHER')),
    add column if not exists designation text
        check (designation is null or char_length(designation) <= 120),
    add column if not exists status text not null default 'ACTIVE'
        check (status in ('ACTIVE', 'ARCHIVED'));

create index if not exists recipients_tenant_status_idx
    on public.recipients (tenant_id, status)
    where deleted_at is null;

notify pgrst, 'reload schema';
