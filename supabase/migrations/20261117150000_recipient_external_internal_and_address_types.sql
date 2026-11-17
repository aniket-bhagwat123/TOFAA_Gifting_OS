-- Recipient form changes:
--  1. Recipient type is External / Internal (was Business / Individual).
--  2. Delivery addresses are Permanent / Current (were Residential / Other; Office stays valid).
-- The old values stay allowed so a backend that has not been redeployed yet keeps working; run this before deploying the new app.

-- 1. Recipient type ---------------------------------------------------------------------------------------------
do $$
declare c text;
begin
    for c in
        select conname from pg_constraint
        where conrelid = 'public.recipients'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%recipient_type%'
    loop
        execute format('alter table public.recipients drop constraint %I', c);
    end loop;
end $$;

alter table public.recipients add constraint recipients_recipient_type_check
    check (recipient_type in ('EXTERNAL', 'INTERNAL', 'INDIVIDUAL', 'BUSINESS'));

update public.recipients set recipient_type = 'EXTERNAL' where recipient_type = 'BUSINESS';
update public.recipients set recipient_type = 'INTERNAL' where recipient_type = 'INDIVIDUAL';
alter table public.recipients alter column recipient_type set default 'INTERNAL';

-- 2. Delivery address types --------------------------------------------------------------------------------------
do $$
declare c text;
begin
    for c in
        select conname from pg_constraint
        where conrelid = 'public.recipient_addresses'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%label%'
    loop
        execute format('alter table public.recipient_addresses drop constraint %I', c);
    end loop;
end $$;

alter table public.recipient_addresses add constraint recipient_addresses_label_check
    check (label in ('PERMANENT', 'CURRENT', 'OFFICE', 'RESIDENTIAL', 'OTHER'));

update public.recipient_addresses set label = 'PERMANENT' where label = 'RESIDENTIAL';
update public.recipient_addresses set label = 'CURRENT' where label = 'OTHER';
