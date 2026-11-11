-- Confirming a proposal no longer fails with "A spend budget must be allocated" for requests made from the
-- New gift request form: when no budget exists for the person, one is created from the confirmed amount.
create or replace function public.approve_gift_request_with_spend(
    p_tenant_id uuid,p_request_id uuid,p_actor_id uuid,p_note text default null
) returns public.gift_requests language plpgsql security definer set search_path = '' as $$
declare v_request public.gift_requests%rowtype; v_account public.credit_accounts%rowtype; v_member public.occasion_budget_members%rowtype;
        v_group public.occasion_budget_groups%rowtype; v_event public.event_spend_budgets%rowtype; v_cap bigint; v_spent bigint;
begin
    select * into v_request from public.gift_requests where tenant_id=p_tenant_id and id=p_request_id for update;
    if not found then raise exception 'gift_request_not_found' using errcode='P0001'; end if;
    if v_request.status='CONFIRMED' and exists(select 1 from public.credit_ledger_entries where tenant_id=p_tenant_id and source_type='gift_request' and source_id=p_request_id::text) then return v_request; end if;
    if v_request.status<>'PROPOSAL_READY' then raise exception 'invalid_gift_request_status' using errcode='P0001'; end if;
    if (v_request.event_id is null) = (v_request.occasion_id is null) or v_request.requested_credits is null or v_request.requested_credits<=0 then
        raise exception 'gift_spend_source_or_credits_required' using errcode='P0001'; end if;
    select * into v_account from public.credit_accounts where tenant_id=p_tenant_id for update;
    if not found then raise exception 'credit_account_not_found' using errcode='P0001'; end if;
    if v_account.available_credits<v_request.requested_credits then raise exception 'insufficient_credits' using errcode='P0001'; end if;
    -- A request made from the New gift request form has no spend budget yet: its own confirmed amount becomes
    -- the budget. Budgets the client already set (Occasions page, groups) are left alone and still enforced.
    if v_request.event_id is not null then
        insert into public.event_spend_budgets(tenant_id, event_id, recipient_id, budget_credits, created_by_user_id)
        values (p_tenant_id, v_request.event_id, v_request.recipient_id, v_request.requested_credits, p_actor_id)
        on conflict (tenant_id, event_id) do nothing;
    else
        insert into public.occasion_budget_members(tenant_id, occasion_id, recipient_id, individual_budget_credits)
        values (p_tenant_id, v_request.occasion_id, v_request.recipient_id, v_request.requested_credits)
        on conflict (tenant_id, occasion_id, recipient_id) do nothing;
    end if;
    if v_request.event_id is not null then
        select * into v_event from public.event_spend_budgets where tenant_id=p_tenant_id and event_id=v_request.event_id and recipient_id=v_request.recipient_id for update;
        if not found then raise exception 'gift_spend_budget_missing' using errcode='P0001'; end if;
        if v_event.budget_credits-v_event.spent_credits<v_request.requested_credits then raise exception 'gift_spend_budget_exceeded' using errcode='P0001'; end if;
        update public.event_spend_budgets set spent_credits=spent_credits+v_request.requested_credits,updated_at=now() where tenant_id=p_tenant_id and event_id=v_request.event_id;
    else
        select * into v_member from public.occasion_budget_members where tenant_id=p_tenant_id and occasion_id=v_request.occasion_id and recipient_id=v_request.recipient_id for update;
        if not found then raise exception 'gift_spend_budget_missing' using errcode='P0001'; end if;
        if v_member.group_allocation_id is null then v_cap:=v_member.individual_budget_credits; v_spent:=v_member.spent_credits;
        else
            select * into v_group from public.occasion_budget_groups where tenant_id=p_tenant_id and occasion_id=v_request.occasion_id and id=v_member.group_allocation_id for update;
            if v_member.individual_budget_credits is not null and v_member.individual_budget_credits-v_member.spent_credits<v_request.requested_credits then raise exception 'gift_spend_limit_exceeded' using errcode='P0001'; end if;
            if v_group.budget_mode='SHARED_POOL' then
                select coalesce(sum(spent_credits),0) into v_spent from public.occasion_budget_members where tenant_id=p_tenant_id and occasion_id=v_request.occasion_id and group_allocation_id=v_group.id;
                v_cap:=v_group.budget_credits;
            else v_cap:=coalesce(v_member.individual_budget_credits,v_group.budget_credits); v_spent:=v_member.spent_credits; end if;
        end if;
        if v_cap-v_spent<v_request.requested_credits then raise exception 'gift_spend_budget_exceeded' using errcode='P0001'; end if;
        update public.occasion_budget_members set spent_credits=spent_credits+v_request.requested_credits,updated_at=now()
        where tenant_id=p_tenant_id and occasion_id=v_request.occasion_id and recipient_id=v_request.recipient_id;
    end if;
    perform public.consume_tenant_credits(p_tenant_id,v_request.requested_credits,'gift_request',p_request_id::text,'Approved gift request: '||v_request.title,p_actor_id,'gift-request-approval/'||p_request_id::text);
    update public.gift_requests set status='CONFIRMED',status_note=nullif(trim(p_note),''),updated_at=now() where id=p_request_id returning * into v_request;
    insert into public.gift_request_events(tenant_id,gift_request_id,from_status,to_status,actor_user_id,note)
    values(p_tenant_id,p_request_id,'PROPOSAL_READY','CONFIRMED',p_actor_id,nullif(trim(p_note),''));
    return v_request;
end; $$;

notify pgrst, 'reload schema';
