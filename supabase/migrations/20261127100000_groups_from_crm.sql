-- Recipient groups come from TOFAA CRM. A group carrying crm_group_id is managed there and only copied here.
-- Groups without it are Gifting OS's own and are left alone. TOFAA GIFTING OS DATABASE ONLY. Safe to run twice.

alter table public.spend_recipient_groups add column if not exists crm_group_id uuid;
create unique index if not exists spend_recipient_groups_crm_uq
  on public.spend_recipient_groups (crm_group_id) where crm_group_id is not null;

-- A group copied from the CRM has no Gifting OS author.
alter table public.spend_recipient_groups alter column created_by_user_id drop not null;

notify pgrst, 'reload schema';
