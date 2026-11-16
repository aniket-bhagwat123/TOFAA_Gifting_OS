-- Banners shown on the dashboard (the "TOFAA Insight" strip and the "quick note" card).
-- Managed by super admins through the API; read by every signed-in user. The API uses the service role,
-- so RLS is on with no policies: nobody can read or write this table directly from a browser.
create table if not exists public.dashboard_banners (
    id uuid primary key default gen_random_uuid(),
    placement text not null default 'INSIGHT' check (placement in ('INSIGHT', 'NOTE')),
    audience text not null default 'ALL' check (audience in ('ALL', 'CLIENT', 'STAFF')),
    eyebrow text check (eyebrow is null or length(trim(eyebrow)) between 1 and 60),
    title text not null check (length(trim(title)) between 1 and 160),
    body text check (body is null or length(body) <= 500),
    cta_label text check (cta_label is null or length(trim(cta_label)) between 1 and 40),
    cta_url text check (cta_url is null or cta_url ~ '^(/|https://)'),
    image_url text check (image_url is null or image_url ~ '^https://'),
    sort_order integer not null default 0 check (sort_order between 0 and 9999),
    is_active boolean not null default true,
    starts_on date,
    ends_on date,
    created_by_user_id uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint dashboard_banners_dates_ck check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists dashboard_banners_active_idx
    on public.dashboard_banners(placement, sort_order) where is_active;
drop trigger if exists dashboard_banners_updated_at on public.dashboard_banners;
create trigger dashboard_banners_updated_at before update on public.dashboard_banners
    for each row execute function public.handle_updated_at();
alter table public.dashboard_banners enable row level security;

insert into public.dashboard_banners (placement, eyebrow, title, body, cta_label, cta_url, sort_order) values
 ('INSIGHT', 'TOFAA INSIGHT', 'Could your team use a little more play?',
  'Sports Day isn''t on your calendar yet. A team sports event could be a refreshing way to encourage movement, connection and team spirit.',
  'Explore this idea', '/occasions', 1),
 ('INSIGHT', 'TOFAA INSIGHT', 'Never miss a milestone',
  'Add birthdays and anniversaries once and TOFAA reminds you before every important date.',
  'Add a recipient', '/recipients?new=1', 2),
 ('INSIGHT', 'TOFAA INSIGHT', 'Plan gifting ahead of festive season',
  'Set budgets early for upcoming festivals so every gift arrives on time and on budget.',
  'View occasions', '/occasions', 3),
 ('NOTE', 'A quick note...', 'Small gestures create big connections.', '— Team TOFAA', null, null, 1);
