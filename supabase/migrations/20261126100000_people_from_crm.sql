-- GIFTING OS DATABASE ONLY. People now live in TOFAA CRM (the master copy). Gifting OS saves people through the CRM API
-- and keeps the recipients tables below as a mirror, so gift requests, occasions, events and budgets keep their links.
-- Safe to run twice.

do $$
begin
  if to_regclass('public.leads') is not null or to_regclass('public.tenants') is null then
    raise exception 'This is not the Gifting OS database (it looks like TOFAA CRM). Nothing was changed. Run this in the Gifting OS Supabase project.';
  end if;
end $$;

-- Which CRM photo the mirror's avatar_url was copied from (the CRM keeps photos private; Gifting OS shows a public copy).
alter table public.recipients add column if not exists crm_photo_path text;

-- How far the mirror has caught up with the CRM ("changed after" mark of the last sync).
create table if not exists public.crm_people_sync (
  id smallint primary key default 1 check (id = 1),
  synced_until timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.crm_people_sync (id) values (1) on conflict (id) do nothing;
alter table public.crm_people_sync enable row level security;

notify pgrst, 'reload schema';
