-- "Used" now also counts debit adjustments (shown as "Adjustments"), so the balance card adds up
-- with the ledger. Credit adjustments (money added) are not usage and stay out.
create or replace function public.get_credit_usage_summary(
    p_tenant_id uuid,
    p_from timestamptz,
    p_to timestamptz
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
    select jsonb_build_object(
        'total_credits_used', coalesce(sum(credits_used), 0),
        'groups', coalesce(jsonb_agg(jsonb_build_object(
            'source_type', source_type,
            'credits_used', credits_used,
            'entry_count', entry_count
        ) order by credits_used desc, source_type), '[]'::jsonb)
    )
    from (
        select case when entry_type = 'adjustment' then 'adjustment' else source_type end as source_type,
               sum(-credits_delta) as credits_used, count(*) as entry_count
        from public.credit_ledger_entries
        where tenant_id = p_tenant_id
            and (entry_type = 'usage' or (entry_type = 'adjustment' and credits_delta < 0))
            and created_at >= p_from and created_at < p_to
        group by 1
    ) grouped;
$$;

revoke all on function public.get_credit_usage_summary(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_credit_usage_summary(uuid, timestamptz, timestamptz) to service_role;
notify pgrst, 'reload schema';
