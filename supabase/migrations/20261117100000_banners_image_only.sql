-- Dashboard banners become picture-only (1000 x 90 px, enforced by the API).
-- Old text banners have no picture, so they are removed.
delete from public.dashboard_banners where image_url is null;

drop index if exists public.dashboard_banners_active_idx;
alter table public.dashboard_banners
    drop column if exists placement,
    drop column if exists eyebrow,
    drop column if exists title,
    drop column if exists body,
    drop column if exists cta_label,
    drop column if exists cta_url;
alter table public.dashboard_banners alter column image_url set not null;
create index if not exists dashboard_banners_active_idx
    on public.dashboard_banners(sort_order) where is_active;
