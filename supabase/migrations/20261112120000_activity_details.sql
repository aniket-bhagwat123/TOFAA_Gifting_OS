-- Activity feed: keep the few facts a change was about (recipient name, occasion, amounts, ...) so the feed can
-- say exactly what happened without opening the record. Additive and nullable; older rows get a general sentence.

alter table public.audit_log
    add column if not exists entity_id uuid,
    add column if not exists details jsonb;

notify pgrst, 'reload schema';
