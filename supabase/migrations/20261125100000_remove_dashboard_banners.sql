-- GIFTING OS DATABASE ONLY. Never run this in the TOFAA CRM project: the CRM keeps its banners in a table with the
-- same name, and running this there deletes them.
--
-- Dashboard banners now come from TOFAA CRM (GET /api/v1/integrations/banners, server to server with an API key).
-- Gifting OS no longer stores banners, so its table goes. This deletes every row in it.
-- The old banner pictures in the "images" bucket (folder "banners/") were already removed.

-- Safety check: stop unless this is the Gifting OS database (it has "tenants" and no "leads"; the CRM is the opposite).
do $$
begin
  if to_regclass('public.leads') is not null or to_regclass('public.tenants') is null then
    raise exception 'This is not the Gifting OS database (it looks like TOFAA CRM). Nothing was changed. Run this in the Gifting OS Supabase project.';
  end if;
end $$;

drop table if exists public.dashboard_banners;

notify pgrst, 'reload schema';
