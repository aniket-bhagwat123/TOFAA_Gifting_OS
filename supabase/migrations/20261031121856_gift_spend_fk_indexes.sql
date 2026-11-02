-- Index foreign-key columns introduced by credit, contract, and spend schemas.
-- Credit indexes are created by 20261029110000_credit_management.sql.
create index if not exists event_spend_budgets_created_by_user_idx on public.event_spend_budgets(created_by_user_id);
create index if not exists event_spend_budgets_event_recipient_fk_idx on public.event_spend_budgets(tenant_id,event_id,recipient_id);
create index if not exists gift_events_actor_user_idx on public.gift_events(actor_user_id);
create index if not exists gift_requests_created_by_user_idx on public.gift_requests(created_by_user_id);
create index if not exists gift_requests_event_fk_idx on public.gift_requests(tenant_id,event_id);
create index if not exists gift_requests_occasion_fk_idx on public.gift_requests(occasion_id);
create index if not exists gift_requests_recipient_fk_idx on public.gift_requests(tenant_id,recipient_id);
create index if not exists gift_spend_notifications_user_idx on public.gift_spend_notifications(user_id);
create index if not exists gift_spend_settings_updated_by_user_idx on public.gift_spend_settings(updated_by_user_id);
create index if not exists gifts_created_by_user_idx on public.gifts(created_by_user_id);
create index if not exists gifts_event_recipient_fk_idx on public.gifts(tenant_id,event_id,recipient_id);
create index if not exists gifts_occasion_fk_idx on public.gifts(occasion_id);
create index if not exists gifts_recipient_fk_idx on public.gifts(tenant_id,recipient_id);
create index if not exists gifts_request_fk_idx on public.gifts(tenant_id,request_id);
create index if not exists gifts_updated_by_user_idx on public.gifts(updated_by_user_id);
create index if not exists occasion_budget_groups_created_by_user_idx on public.occasion_budget_groups(created_by_user_id);
create index if not exists occasion_budget_groups_occasion_fk_idx on public.occasion_budget_groups(occasion_id);
create index if not exists occasion_budget_groups_source_group_fk_idx on public.occasion_budget_groups(tenant_id,source_group_id);
create index if not exists occasion_budget_members_occasion_fk_idx on public.occasion_budget_members(occasion_id);
create index if not exists occasion_budget_members_recipient_fk_idx on public.occasion_budget_members(tenant_id,recipient_id);
create index if not exists spend_recipient_group_members_recipient_fk_idx on public.spend_recipient_group_members(tenant_id,recipient_id);
create index if not exists spend_recipient_groups_created_by_user_idx on public.spend_recipient_groups(created_by_user_id);
