-- Keep only the agreed recipient profile fields in the public data contract.
-- Audit, tenant ownership, soft-delete, and timestamp columns remain internal.

alter table public.recipients
    rename column remarks to remark;

alter table public.recipients
    drop column designation,
    drop column email,
    drop column tier,
    drop column address_id,
    drop column recipient_group,
    drop column preferences,
    drop column first_name,
    drop column last_name,
    drop column mobile,
    drop column birth_date;
