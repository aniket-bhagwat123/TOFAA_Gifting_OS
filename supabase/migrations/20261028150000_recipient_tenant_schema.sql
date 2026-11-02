-- Recipient details are tenant-owned and shared by active users in that tenant.
-- Legacy rows keep nullable address, DOB, and budget values until reviewed.

alter table public.recipients
    add column name text,
    add column mobile_number text,
    add column address jsonb,
    add column date_of_birth date,
    add column budget numeric(12, 2),
    add column remarks text;

update public.recipients
set name = nullif(btrim(concat_ws(' ', first_name, last_name)), ''),
    mobile_number = mobile,
    date_of_birth = birth_date;

-- Old fields remain available temporarily for rollback and data reconciliation.
alter table public.recipients
    alter column first_name drop not null,
    alter column last_name drop not null,
    alter column mobile drop not null;

drop index public.recipients_company_mobile_active_uq;
create unique index recipients_tenant_mobile_number_active_uq
    on public.recipients (tenant_id, mobile_number)
    where deleted_at is null;

alter table public.recipients
    add constraint recipients_budget_nonnegative_check
        check (budget is null or budget >= 0),
    add constraint recipients_address_shape_check
        check (
            address is null
            or coalesce(
                jsonb_typeof(address) = 'object'
                and jsonb_typeof(address->'address_line1') = 'string'
                and length(btrim(address->>'address_line1')) > 0
                and jsonb_typeof(address->'city') = 'string'
                and length(btrim(address->>'city')) > 0
                and (address->>'postal_code') ~ '^[0-9]{6}$'
                and (address->>'country') ~ '^[A-Z]{2}$',
                false
            )
        );

comment on column public.recipients.budget is
    'Per-gifting-occasion budget in INR; nullable for legacy rows pending review.';
comment on column public.recipients.address is
    'Structured recipient delivery address stored as JSONB.';
