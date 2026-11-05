-- One grouped count for the status tabs, instead of one query per status.
create or replace function public.gift_request_status_counts(p_tenant_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
    select coalesce(jsonb_object_agg(status, total), '{}'::jsonb)
    from (select status, count(*) as total from public.gift_requests where tenant_id = p_tenant_id group by status) counted;
$$;

revoke all on function public.gift_request_status_counts(uuid) from public, anon, authenticated;
grant execute on function public.gift_request_status_counts(uuid) to service_role;
notify pgrst, 'reload schema';
