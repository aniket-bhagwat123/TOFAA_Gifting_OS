-- "Send": one atomic step that sets the budget for each chosen recipient and sends a gift request
-- to TOFAA for each of them, for an occasion or for one recipient's event.
-- A recipient who already has an open request for the same occasion/event is skipped, so pressing
-- Send twice never creates duplicates.
create or replace function public.send_gifts(
    p_tenant_id uuid,
    p_source_type text,            -- 'occasion' | 'event'
    p_source_id uuid,
    p_recipient_ids uuid[],
    p_budget_credits bigint,       -- budget per recipient, in credits
    p_budget_rupees numeric,       -- the same budget in rupees, shown on the request
    p_title text,                  -- occasion or event name; "<title> gift for <recipient>" becomes the request title
    p_purpose text,
    p_delivery_date date,
    p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_account public.credit_accounts%rowtype;
    v_ids uuid[];
    v_skipped uuid[];
    v_targets uuid[];
    v_created jsonb;
begin
    if p_source_type not in ('occasion', 'event') then raise exception 'invalid_gift_source' using errcode = 'P0001'; end if;
    if p_budget_credits is null or p_budget_credits <= 0 then raise exception 'invalid_spend_budget' using errcode = 'P0001'; end if;

    select * into v_account from public.credit_accounts where tenant_id = p_tenant_id for update;
    if not found then raise exception 'credit_account_not_found' using errcode = 'P0001'; end if;

    select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_recipient_ids, '{}')) x;
    if cardinality(v_ids) = 0 then raise exception 'group_needs_recipients' using errcode = 'P0001'; end if;

    if p_source_type = 'occasion' then
        perform 1 from public.occasions where id = p_source_id and is_active and (tenant_id is null or tenant_id = p_tenant_id);
        if not found then raise exception 'occasion_not_available' using errcode = 'P0001'; end if;
    else
        perform 1 from public.events where id = p_source_id and tenant_id = p_tenant_id and is_active and recipient_id = any(v_ids);
        if not found then raise exception 'event_not_found' using errcode = 'P0001'; end if;
    end if;

    if (select count(*) from public.recipients r where r.tenant_id = p_tenant_id and r.id = any(v_ids) and r.deleted_at is null) <> cardinality(v_ids) then
        raise exception 'recipient_not_found' using errcode = 'P0001';
    end if;

    select coalesce(array_agg(distinct g.recipient_id), '{}') into v_skipped
    from public.gift_requests g
    where g.tenant_id = p_tenant_id and g.recipient_id = any(v_ids) and g.status not in ('CANCELLED', 'REJECTED')
      and ((p_source_type = 'occasion' and g.occasion_id = p_source_id) or (p_source_type = 'event' and g.event_id = p_source_id));
    select coalesce(array_agg(x), '{}') into v_targets from unnest(v_ids) x where x <> all(v_skipped);
    if cardinality(v_targets) = 0 then
        return jsonb_build_object('created', '[]'::jsonb, 'skipped', to_jsonb(v_skipped));
    end if;

    -- Budgets: the same amount for every chosen recipient.
    if p_source_type = 'occasion' then
        insert into public.occasion_budget_members(tenant_id, occasion_id, recipient_id, individual_budget_credits)
        select p_tenant_id, p_source_id, x, p_budget_credits from unnest(v_targets) x
        on conflict (tenant_id, occasion_id, recipient_id)
        do update set individual_budget_credits = excluded.individual_budget_credits, updated_at = now();
        if exists (select 1 from public.occasion_budget_members
                   where tenant_id = p_tenant_id and occasion_id = p_source_id and recipient_id = any(v_targets)
                     and spent_credits > individual_budget_credits) then
            raise exception 'budget_below_spent' using errcode = 'P0001';
        end if;
    else
        insert into public.event_spend_budgets(tenant_id, event_id, recipient_id, budget_credits, created_by_user_id)
        values (p_tenant_id, p_source_id, v_targets[1], p_budget_credits, p_actor_id)
        on conflict (tenant_id, event_id)
        do update set budget_credits = excluded.budget_credits, updated_at = now();
        if exists (select 1 from public.event_spend_budgets
                   where tenant_id = p_tenant_id and event_id = p_source_id and spent_credits > budget_credits) then
            raise exception 'budget_below_spent' using errcode = 'P0001';
        end if;
    end if;
    if public.gift_spend_reserved_credits(p_tenant_id) > v_account.available_credits then
        raise exception 'spend_reservation_exceeds_balance' using errcode = 'P0001';
    end if;

    with inserted as (
        insert into public.gift_requests(
            tenant_id, recipient_id, event_id, occasion_id, created_by_user_id, title, purpose,
            requested_budget, requested_credits, delivery_date, status
        )
        select p_tenant_id, r.id,
               case when p_source_type = 'event' then p_source_id end,
               case when p_source_type = 'occasion' then p_source_id end,
               p_actor_id,
               left(p_title || ' gift for ' || r.name, 180),
               left(coalesce(nullif(trim(p_purpose), ''), p_title || ' gift'), 2000),
               p_budget_rupees, p_budget_credits, p_delivery_date, 'SUBMITTED'
        from public.recipients r
        where r.tenant_id = p_tenant_id and r.id = any(v_targets)
        returning id, recipient_id
    )
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'recipientId', recipient_id)), '[]'::jsonb) into v_created from inserted;

    return jsonb_build_object('created', v_created, 'skipped', to_jsonb(v_skipped));
end; $$;

revoke all on function public.send_gifts(uuid, text, uuid, uuid[], bigint, numeric, text, text, date, uuid) from public, anon, authenticated;
grant execute on function public.send_gifts(uuid, text, uuid, uuid[], bigint, numeric, text, text, date, uuid) to service_role;
notify pgrst, 'reload schema';
