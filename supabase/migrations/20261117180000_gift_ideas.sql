-- Gift ideas: a catalogue of things TOFAA suggests to clients. Super admins manage it through the API;
-- every signed-in user reads the active ones. The API uses the service role, so RLS is on with no policies.
create table if not exists public.gift_ideas (
    id uuid primary key default gen_random_uuid(),
    title text not null check (length(trim(title)) between 1 and 120),
    description text check (description is null or length(description) <= 1000),
    category text check (category is null or length(trim(category)) between 1 and 60),
    price numeric(12, 2) check (price is null or price >= 0),
    image_url text check (image_url is null or image_url ~ '^https://'),
    is_active boolean not null default true,
    created_by_user_id uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists gift_ideas_active_idx on public.gift_ideas(created_at desc) where is_active;
drop trigger if exists gift_ideas_updated_at on public.gift_ideas;
create trigger gift_ideas_updated_at before update on public.gift_ideas
    for each row execute function public.handle_updated_at();
alter table public.gift_ideas enable row level security;
notify pgrst, 'reload schema';
