-- Occasions overview: the fields the "Add Occasion" form collects, for both kinds of occasion.
--   events    = a date for one recipient (birthday, anniversary, ...)
--   occasions = a company occasion (festival, annual day, ...), TOFAA-wide or one client's own
alter table public.events
    add column if not exists occasion_type text check (occasion_type is null or length(occasion_type) <= 60),
    add column if not exists relationship text check (relationship is null or length(relationship) <= 60),
    add column if not exists repeat_annually boolean not null default false,
    add column if not exists priority text not null default 'NORMAL' check (priority in ('NORMAL', 'HIGH', 'VIP')),
    add column if not exists notes text check (notes is null or length(notes) <= 2000);

alter table public.occasions
    add column if not exists category text check (category is null or length(category) <= 60),
    add column if not exists repeat_annually boolean not null default false,
    add column if not exists priority text not null default 'NORMAL' check (priority in ('NORMAL', 'HIGH', 'VIP')),
    add column if not exists notes text check (notes is null or length(notes) <= 2000);

-- The overview reads every open request of a client by the occasion or event it came from.
create index if not exists gift_requests_tenant_occasion_idx on public.gift_requests(tenant_id, occasion_id) where occasion_id is not null;
create index if not exists gift_requests_tenant_event_idx on public.gift_requests(tenant_id, event_id) where event_id is not null;

notify pgrst, 'reload schema';
