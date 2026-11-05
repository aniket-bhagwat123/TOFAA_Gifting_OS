-- People added straight to an occasion can carry a plain group label (e.g. "Leadership"),
-- without using saved recipient groups.
alter table public.occasion_budget_members
    add column if not exists group_name text check (group_name is null or char_length(btrim(group_name)) between 1 and 100);

drop function if exists public.set_occasion_recipient_budget(uuid, uuid, uuid, bigint);

create or replace function public.set_occasion_recipient_budget(
    p_tenant_id uuid, p_occasion_id uuid, p_recipient_id uuid, p_budget_credits bigint, p_group_name text default null
) returns public.occasion_budget_members language plpgsql security definer set search_path = '' as $$
declare v_account public.credit_accounts%rowtype; v_member public.occasion_budget_members%rowtype; v_occasion public.occasions%rowtype;
        v_name text := nullif(btrim(p_group_name), '');
begin
    select * into v_account from public.credit_accounts where tenant_id=p_tenant_id for update;
    if not found then raise exception 'credit_account_not_found' using errcode='P0001'; end if;
    select * into v_occasion from public.occasions where id=p_occasion_id and is_active and (tenant_id is null or tenant_id=p_tenant_id);
    if not found then raise exception 'occasion_not_available' using errcode='P0001'; end if;
    if p_budget_credits <= 0 then raise exception 'invalid_spend_budget' using errcode='P0001'; end if;
    insert into public.occasion_budget_members(tenant_id,occasion_id,recipient_id,individual_budget_credits,group_name)
    values(p_tenant_id,p_occasion_id,p_recipient_id,p_budget_credits,v_name)
    on conflict(tenant_id,occasion_id,recipient_id) do update
        set individual_budget_credits=excluded.individual_budget_credits,
            group_name=coalesce(excluded.group_name, public.occasion_budget_members.group_name),
            updated_at=now()
    returning * into v_member;
    if p_budget_credits < v_member.spent_credits then raise exception 'budget_below_spent' using errcode='P0001'; end if;
    if public.gift_spend_reserved_credits(p_tenant_id)>v_account.available_credits then raise exception 'spend_reservation_exceeds_balance' using errcode='P0001'; end if;
    return v_member;
end; $$;

revoke all on function public.set_occasion_recipient_budget(uuid,uuid,uuid,bigint,text) from public, anon, authenticated;
grant execute on function public.set_occasion_recipient_budget(uuid,uuid,uuid,bigint,text) to service_role;
