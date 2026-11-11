-- Every user can keep a mobile number on their own profile.
alter table public.profiles
    add column if not exists mobile_number text check (mobile_number is null or mobile_number ~ '^\+?[1-9][0-9]{7,14}$');

notify pgrst, 'reload schema';
