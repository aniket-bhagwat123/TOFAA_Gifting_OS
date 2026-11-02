-- Migration: create_users_and_profiles
-- Establishes public.profiles linked to auth.users, auto-provisioning triggers, and RLS policies

-- 1. Create custom user roles enum
do $$
begin
    if not exists (select 1 from pg_type where typname = 'app_role') then
        create type public.app_role as enum ('user', 'admin', 'moderator');
    end if;
end$$;

-- 2. Create public.profiles table
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    full_name text,
    avatar_url text,
    role public.app_role not null default 'user',
    is_active boolean not null default true,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now())
);

-- 3. Indexes for query and RLS performance (best practice: index foreign keys & filter columns)
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_is_active on public.profiles(is_active);

-- 4. Enable Row Level Security
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

-- 5. Row Level Security Policies
-- Note: wrapping auth.uid() in (select auth.uid()) caches the function call once per query plan for high performance
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
    on public.profiles
    for select
    to authenticated
    using ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
    on public.profiles
    for update
    to authenticated
    using ((select auth.uid()) = id)
    with check ((select auth.uid()) = id);

-- 6. Trigger function to auto-provision public.profiles on new auth.users signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, email, full_name, avatar_url, role)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', ''),
        coalesce(new.raw_user_meta_data->>'avatar_url', ''),
        'user'
    )
    on conflict (id) do update set
        email = excluded.email,
        full_name = case when excluded.full_name <> '' then excluded.full_name else public.profiles.full_name end,
        avatar_url = case when excluded.avatar_url <> '' then excluded.avatar_url else public.profiles.avatar_url end;
    return new;
end;
$$;

-- 7. Register trigger on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- 8. Updated_at auto-updating trigger function
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc'::text, now());
    return new;
end;
$$;

drop trigger if exists on_profiles_updated on public.profiles;
create trigger on_profiles_updated
    before update on public.profiles
    for each row execute function public.handle_updated_at();
