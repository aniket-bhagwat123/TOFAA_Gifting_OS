-- Every user belongs to exactly one tenant. Staff belong to one internal TOFAA tenant; their access
-- to client data comes from their role, never from that membership.
--
-- Safe to run on existing data: staff memberships are moved, pending invitations are kept, and the
-- new rules are checked only on later writes. Apply 20261103120000_harden_tenant_isolation.sql first.

-- 1. The internal tenant: one row, never a client.
do $$
declare
    existing record;
begin
    for existing in
        select conname from pg_constraint
        where conrelid = 'public.tenants'::regclass and contype = 'c'
          and pg_get_constraintdef(oid) like '%tenant_type%'
    loop
        execute format('alter table public.tenants drop constraint %I', existing.conname);
    end loop;
end;
$$;
alter table public.tenants add constraint tenants_tenant_type_check
    check (tenant_type in ('ORGANIZATION', 'INDIVIDUAL', 'INTERNAL'));
create unique index if not exists tenants_single_internal_uq
    on public.tenants ((true)) where tenant_type = 'INTERNAL';

insert into public.tenants (tenant_type, name, status)
select 'INTERNAL', 'TOFAA Internal', 'ACTIVE'
where not exists (select 1 from public.tenants where tenant_type = 'INTERNAL');

-- 2. Move staff into it. Delete and insert in one statement, because a membership cannot change
--    tenant; a pending invitation keeps its status so the person can still accept it.
do $$
declare
    internal_id uuid;
begin
    select id into internal_id from public.tenants where tenant_type = 'INTERNAL';

    with moved as (
        delete from public.tenant_memberships m
        using public.profiles p
        where p.id = m.user_id and p.role in ('KAM', 'SUPER_ADMIN') and m.tenant_id <> internal_id
        returning m.user_id, m.status
    )
    insert into public.tenant_memberships (tenant_id, user_id, membership_type, status)
    select internal_id, user_id, 'PLATFORM', status from moved;

    -- Account managers need a tenant to sign in. A super admin does not, so none is created for them.
    insert into public.tenant_memberships (tenant_id, user_id, membership_type, status)
    select internal_id, p.id, 'PLATFORM', case when p.is_active then 'ACTIVE' else 'DEACTIVATED' end
    from public.profiles p
    where p.role = 'KAM'
      and not exists (select 1 from public.tenant_memberships m where m.user_id = p.id);

    update public.tenant_invitations set tenant_id = internal_id where role in ('KAM', 'SUPER_ADMIN');
end;
$$;

-- 3. The database refuses what the API already refuses, so a bug in either cannot break it.
create or replace function private.enforce_membership_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    tenant_kind text;
    user_role text;
begin
    select tenant_type into tenant_kind from public.tenants where id = new.tenant_id;
    select role into user_role from public.profiles where id = new.user_id;

    if tenant_kind = 'INTERNAL' then
        if new.membership_type <> 'PLATFORM' or coalesce(user_role, '') not in ('KAM', 'SUPER_ADMIN') then
            raise exception 'only_team_members_join_the_internal_tenant' using errcode = '23514';
        end if;
    elsif new.membership_type <> 'CLIENT' or coalesce(user_role, '') <> 'CLIENT' then
        raise exception 'only_client_users_join_a_client_tenant' using errcode = '23514';
    end if;

    return new;
end;
$$;
revoke all on function private.enforce_membership_rules() from public, anon, authenticated;

drop trigger if exists enforce_membership_rules on public.tenant_memberships;
create trigger enforce_membership_rules
    before insert or update of tenant_id, user_id, membership_type, status
    on public.tenant_memberships
    for each row execute function private.enforce_membership_rules();

-- 4. Invitations last 7 days, and a first sign-in activates one even if its email failed.
update public.tenant_invitations i
set expires_at = now() + interval '7 days'
where i.status in ('PENDING', 'SENT', 'FAILED')
  and i.expires_at < now() + interval '7 days'
  and (
      i.user_id is null
      or exists (select 1 from public.tenant_memberships m where m.user_id = i.user_id and m.status = 'INVITED')
  );

create or replace function public.accept_tenant_invitation(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    invitation public.tenant_invitations;
begin
    select * into invitation
    from public.tenant_invitations
    where user_id = p_user_id and status in ('SENT', 'FAILED') and expires_at > now()
    for update;
    if not found then
        raise exception 'Invitation is invalid, expired, or already used' using errcode = '23514';
    end if;
    if not exists (
        select 1 from public.tenants
        where id = invitation.tenant_id and status <> 'DEACTIVATED'
    ) then
        raise exception 'Tenant is inactive' using errcode = '23514';
    end if;
    update public.tenant_memberships
    set status = 'ACTIVE'
    where user_id = p_user_id and tenant_id = invitation.tenant_id and status = 'INVITED';
    if not found then
        raise exception 'Invitation membership is not pending' using errcode = '23514';
    end if;
    update public.profiles set is_active = true where id = p_user_id;
    update public.tenant_invitations
    set status = 'ACCEPTED', accepted_at = now()
    where id = invitation.id;
    return true;
end;
$$;
revoke all on function public.accept_tenant_invitation(uuid) from public, anon, authenticated;
grant execute on function public.accept_tenant_invitation(uuid) to service_role;

-- 5. Who changed what, for which tenant. Append-only: rows can never be edited or removed.
--    actor_user_id has no foreign key on purpose, so removing a user cannot erase history.
create table if not exists public.audit_log (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    actor_user_id uuid not null,
    actor_role text not null,
    on_behalf boolean not null,
    method text not null,
    route text not null,
    resource text not null,
    status_code smallint not null
);
create index if not exists audit_log_tenant_created_idx on public.audit_log (tenant_id, created_at desc);
create index if not exists audit_log_staff_changes_idx
    on public.audit_log (tenant_id, created_at desc) where on_behalf;

create or replace function private.reject_audit_log_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception 'audit_log_is_append_only' using errcode = '23514';
end;
$$;
revoke all on function private.reject_audit_log_change() from public, anon, authenticated;

drop trigger if exists audit_log_append_only on public.audit_log;
create trigger audit_log_append_only
    before update or delete on public.audit_log
    for each row execute function private.reject_audit_log_change();

alter table public.audit_log enable row level security;
revoke all on public.audit_log from public, anon, authenticated;
grant select, insert on public.audit_log to service_role;

notify pgrst, 'reload schema';
