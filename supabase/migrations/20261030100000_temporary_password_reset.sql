alter table public.profiles
    add column if not exists must_reset_password boolean not null default false;

create or replace function public.prevent_temporary_password_flag_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.role() = 'authenticated'
        and old.must_reset_password is distinct from new.must_reset_password then
        raise exception 'must_reset_password is managed by the authentication service'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists profiles_protect_temporary_password_flag on public.profiles;
create trigger profiles_protect_temporary_password_flag
    before update of must_reset_password on public.profiles
    for each row execute function public.prevent_temporary_password_flag_change();

revoke all on function public.prevent_temporary_password_flag_change()
    from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
