-- A person's budget now belongs to one group, so it no longer follows them into every other group.
-- Group budgets keep the all-zero group_id. Personal budgets saved before this change have no group
-- and are ignored (they were the ones that carried over between groups).
alter table public.spend_default_budgets
    add column group_id uuid not null default '00000000-0000-0000-0000-000000000000';

alter table public.spend_default_budgets drop constraint spend_default_budgets_pkey;
alter table public.spend_default_budgets add primary key (tenant_id, target_type, target_id, group_id);
notify pgrst, 'reload schema';
