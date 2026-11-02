-- Keep the API schema in sync for environments that already ran the initial module migration.
alter table public.occasions
    add column if not exists occasion_date date;

drop index if exists public.events_occasion_id_idx;
alter table public.events
    drop column if exists occasion_id;

-- Existing occasion rows cannot be assigned an invented calendar date.
-- New occasions require a date in the API; legacy rows remain readable until edited.
notify pgrst, 'reload schema';
