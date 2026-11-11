-- Pictures: a person's photo (recipients), a client's logo (tenants) and each user's avatar (profiles.avatar_url
-- already exists). Proposal option pictures are stored in the same bucket. Everything is written by the backend
-- only; the bucket is public so the pictures can be shown with a plain image link.
alter table public.recipients add column if not exists avatar_url text check (avatar_url is null or length(avatar_url) <= 1000);
alter table public.tenants add column if not exists logo_url text check (logo_url is null or length(logo_url) <= 1000);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
    set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
