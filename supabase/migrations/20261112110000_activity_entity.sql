-- Activity feed: remember which item (recipient, gift request, ...) a change touched, so the feed can name it.
-- Nullable and additive; older rows simply get a general description.

alter table public.audit_log
    add column if not exists entity_id uuid;

notify pgrst, 'reload schema';
