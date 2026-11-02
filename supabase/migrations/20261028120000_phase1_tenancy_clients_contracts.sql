-- Phase 1 tenant and client foundation. Business records are retained on deactivation.

-- Adopt the legacy companies/company_id schema in place without copying or dropping data.
do $$
begin
    if to_regclass('public.tenants') is null and to_regclass('public.companies') is not null then
        alter table public.companies rename to tenants;
    end if;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'tenants' and column_name = 'company_name'
    ) and not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'tenants' and column_name = 'name'
    ) then
        alter table public.tenants rename column company_name to name;
    end if;
end;
$$;

do $$
declare
    current_table text;
begin
    foreach current_table in array array[
        'tenant_memberships', 'team_client_assignments', 'contracts',
        'contract_tier_budgets', 'client_addresses', 'recipients',
        'client_onboarding_steps'
    ] loop
        if to_regclass(format('public.%I', current_table)) is not null
           and exists (
               select 1 from information_schema.columns c
               where c.table_schema = 'public' and c.table_name = current_table
                 and c.column_name = 'company_id'
           )
           and not exists (
               select 1 from information_schema.columns c
               where c.table_schema = 'public' and c.table_name = current_table
                 and c.column_name = 'tenant_id'
           ) then
            execute format('alter table public.%I rename column company_id to tenant_id', current_table);
        end if;
    end loop;
end;
$$;

do $$
begin
    if to_regclass('public.tenant_memberships_company_id_idx') is not null
       and to_regclass('public.tenant_memberships_tenant_id_idx') is null then
        alter index public.tenant_memberships_company_id_idx rename to tenant_memberships_tenant_id_idx;
    end if;
    if to_regclass('public.team_client_assignments_user_company_idx') is not null
       and to_regclass('public.team_client_assignments_user_tenant_idx') is null then
        alter index public.team_client_assignments_user_company_idx rename to team_client_assignments_user_tenant_idx;
    end if;
    if to_regclass('public.contracts_company_period_idx') is not null
       and to_regclass('public.contracts_tenant_period_idx') is null then
        alter index public.contracts_company_period_idx rename to contracts_tenant_period_idx;
    end if;
    if to_regclass('public.client_addresses_company_idx') is not null
       and to_regclass('public.client_addresses_tenant_idx') is null then
        alter index public.client_addresses_company_idx rename to client_addresses_tenant_idx;
    end if;
    if to_regclass('public.recipients_company_created_idx') is not null
       and to_regclass('public.recipients_tenant_created_idx') is null then
        alter index public.recipients_company_created_idx rename to recipients_tenant_created_idx;
    end if;
end;
$$;

alter table public.profiles alter column role drop default;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles alter column role type text using
    case role::text
        when 'admin' then 'SUPER_ADMIN'
        when 'SUPER_ADMIN' then 'SUPER_ADMIN'
        when 'moderator' then 'KAM'
        when 'TEAM' then 'KAM'
        when 'KAM' then 'KAM'
        else 'CLIENT'
    end;
alter table public.profiles alter column role set default 'CLIENT';
alter table public.profiles add constraint profiles_role_check
    check (role in ('CLIENT', 'KAM', 'SUPER_ADMIN'));
drop type if exists public.app_role;

revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

create table if not exists public.tenants (
    id uuid primary key default gen_random_uuid(),
    tenant_type text not null check (tenant_type in ('ORGANIZATION', 'INDIVIDUAL')),
    name text not null,
    legal_name text,
    gstin text,
    email_domain text,
    status text not null default 'PENDING_SETUP'
        check (status in ('PENDING_SETUP', 'ACTIVE', 'DEACTIVATED')),
    logo_file_id uuid,
    brand_notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint tenants_gstin_check check (gstin is null or gstin ~ '^[A-Za-z0-9]{15}$')
);
alter table public.tenants
    add column if not exists tenant_type text not null default 'ORGANIZATION';
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.tenants'::regclass and conname = 'tenants_tenant_type_check'
    ) then
        alter table public.tenants add constraint tenants_tenant_type_check
            check (tenant_type in ('ORGANIZATION', 'INDIVIDUAL'));
    end if;
end;
$$;

create table if not exists public.tenant_memberships (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    user_id uuid not null unique references public.profiles(id) on delete cascade,
    membership_type text not null check (membership_type in ('CLIENT', 'PLATFORM')),
    status text not null default 'INVITED' check (status in ('INVITED', 'ACTIVE', 'DEACTIVATED')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
alter table public.tenant_memberships
    add column if not exists membership_type text;
do $$
begin
    update public.tenant_memberships m
    set membership_type = case when p.role = 'CLIENT' then 'CLIENT' else 'PLATFORM' end
    from public.profiles p
    where p.id = m.user_id and m.membership_type is null;
end;
$$;
alter table public.tenant_memberships
    alter column membership_type set default 'CLIENT',
    alter column membership_type set not null;
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.tenant_memberships'::regclass
          and conname = 'tenant_memberships_membership_type_check'
    ) then
        alter table public.tenant_memberships add constraint tenant_memberships_membership_type_check
            check (membership_type in ('CLIENT', 'PLATFORM'));
    end if;
end;
$$;
create index if not exists tenant_memberships_tenant_id_idx on public.tenant_memberships(tenant_id);
drop trigger if exists tenant_memberships_updated_at on public.tenant_memberships;
create trigger tenant_memberships_updated_at before update on public.tenant_memberships
    for each row execute function public.handle_updated_at();

create table if not exists public.tenant_invitations (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    normalized_email text not null,
    full_name text,
    role text not null check (role in ('CLIENT', 'KAM', 'SUPER_ADMIN')),
    status text not null default 'PENDING'
        check (status in ('PENDING', 'SENT', 'ACCEPTED', 'REVOKED', 'FAILED')),
    invited_by_user_id uuid not null references public.profiles(id) on delete restrict,
    user_id uuid unique references public.profiles(id) on delete set null,
    domain_override_reason text,
    expires_at timestamptz not null,
    sent_at timestamptz,
    accepted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create unique index tenant_invitations_pending_email_uq
    on public.tenant_invitations(normalized_email)
    where status in ('PENDING', 'SENT');
create index tenant_invitations_tenant_status_idx
    on public.tenant_invitations(tenant_id, status, created_at desc);
create trigger tenant_invitations_updated_at before update on public.tenant_invitations
    for each row execute function public.handle_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    pending_invitation public.tenant_invitations;
begin
    select * into pending_invitation
    from public.tenant_invitations
    where normalized_email = lower(new.email)
      and status = 'PENDING'
      and expires_at > now()
    for update;
    if not found then
        raise exception 'A valid tenant invitation is required to create a user';
    end if;
    if not exists (
        select 1 from public.tenants
        where id = pending_invitation.tenant_id and status <> 'DEACTIVATED'
    ) then
        raise exception 'User tenant does not exist or is inactive';
    end if;
    insert into public.profiles (id, email, full_name, avatar_url, role)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'full_name', ''),
        coalesce(new.raw_user_meta_data->>'avatar_url', ''),
        pending_invitation.role
    )
    on conflict (id) do update set
        email = excluded.email,
        full_name = case when excluded.full_name <> '' then excluded.full_name else public.profiles.full_name end,
        avatar_url = case when excluded.avatar_url <> '' then excluded.avatar_url else public.profiles.avatar_url end;
    insert into public.tenant_memberships (tenant_id, user_id, membership_type, status)
    values (
        pending_invitation.tenant_id,
        new.id,
        case when pending_invitation.role = 'CLIENT' then 'CLIENT' else 'PLATFORM' end,
        'INVITED'
    );
    update public.tenant_invitations
    set user_id = new.id
    where id = pending_invitation.id;
    return new;
end;
$$;

create table if not exists public.team_client_assignments (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    user_id uuid not null references public.profiles(id) on delete restrict,
    assignment_type text not null default 'KAM'
        check (assignment_type in ('KAM', 'BACKUP_KAM', 'OPS')),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    unique (tenant_id, user_id, assignment_type)
);
create index if not exists team_client_assignments_user_tenant_idx
    on public.team_client_assignments(user_id, tenant_id) where active;

create table if not exists public.contracts (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    contract_number text not null,
    status text not null default 'DRAFT'
        check (status in ('DRAFT', 'ACTIVE', 'EXPIRED', 'CLOSED')),
    sla_tier text not null check (sla_tier in ('VVIP', 'EXECUTIVE', 'STANDARD')),
    start_date date not null,
    end_date date not null,
    currency char(3) not null default 'INR',
    contract_value numeric(14,2) not null check (contract_value >= 0),
    payment_terms text,
    version integer not null default 1 check (version > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (start_date <= end_date),
    unique (tenant_id, contract_number)
);
create index if not exists contracts_tenant_period_idx on public.contracts(tenant_id, start_date, end_date);

create table if not exists public.contract_tier_budgets (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    contract_id uuid not null references public.contracts(id) on delete restrict,
    tier_key text not null check (tier_key in ('VVIP', 'A', 'B', 'C')),
    budget_amount numeric(14,2) not null check (budget_amount >= 0),
    per_gift_limit numeric(14,2) check (per_gift_limit is null or per_gift_limit >= 0),
    unique (contract_id, tier_key)
);
create index if not exists contract_tier_budgets_company_contract_idx
    on public.contract_tier_budgets(tenant_id, contract_id);

create table if not exists public.client_addresses (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    label text not null,
    address text not null,
    city text not null,
    state text,
    pincode text not null check (pincode ~ '^[0-9]{6}$'),
    contact_name text not null,
    mobile text not null,
    address_type text not null default 'DELIVERY'
        check (address_type in ('DELIVERY', 'BILLING', 'BOTH')),
    is_default boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists client_addresses_tenant_idx on public.client_addresses(tenant_id);

create table if not exists public.recipients (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    first_name text not null,
    last_name text not null,
    designation text,
    mobile text not null,
    email text,
    tier text not null check (tier in ('VVIP', 'A', 'B', 'C')),
    birth_date date,
    anniversary_date date,
    address_id uuid references public.client_addresses(id) on delete set null,
    recipient_group text,
    preferences text,
    source text not null default 'TOFAA' check (source in ('CLIENT', 'TOFAA', 'IMPORT')),
    created_by_user_id uuid references public.profiles(id) on delete set null,
    updated_by_user_id uuid references public.profiles(id) on delete set null,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create unique index if not exists recipients_company_mobile_active_uq
    on public.recipients(tenant_id, mobile) where deleted_at is null;
create index if not exists recipients_tenant_created_idx on public.recipients(tenant_id, created_at desc)
    where deleted_at is null;

create table if not exists public.client_onboarding_steps (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    step_key text not null check (step_key in ('COMPANY', 'ADDRESSES', 'CONTRACT', 'RECIPIENTS', 'USERS')),
    completed_at timestamptz,
    completed_by_user_id uuid references public.profiles(id) on delete set null,
    notes text,
    unique (tenant_id, step_key)
);

drop trigger if exists companies_updated_at on public.tenants;
drop trigger if exists tenants_updated_at on public.tenants;
create trigger tenants_updated_at before update on public.tenants
    for each row execute function public.handle_updated_at();
drop trigger if exists contracts_updated_at on public.contracts;
create trigger contracts_updated_at before update on public.contracts
    for each row execute function public.handle_updated_at();
drop trigger if exists client_addresses_updated_at on public.client_addresses;
create trigger client_addresses_updated_at before update on public.client_addresses
    for each row execute function public.handle_updated_at();
drop trigger if exists recipients_updated_at on public.recipients;
create trigger recipients_updated_at before update on public.recipients
    for each row execute function public.handle_updated_at();

drop function if exists public.provision_client(
    text, text, text, uuid, uuid, text, text, date, date, numeric, text, jsonb
);
create or replace function public.provision_client(
    p_tenant_name text,
    p_legal_name text,
    p_email_domain text,
    p_kam_user_id uuid,
    p_backup_kam_user_id uuid,
    p_contract_number text,
    p_sla_tier text,
    p_start_date date,
    p_end_date date,
    p_contract_value numeric,
    p_payment_terms text,
    p_tier_budgets jsonb
)
returns setof public.tenants
language plpgsql
security definer
set search_path = ''
as $$
declare
    new_tenant public.tenants;
    new_contract_id uuid;
begin
    if not exists (
        select 1 from public.profiles
        where id = p_kam_user_id and role = 'KAM' and is_active
    ) then
        raise exception 'KAM must be an active user' using errcode = '23514';
    end if;
    if p_backup_kam_user_id is not null and not exists (
        select 1 from public.profiles
        where id = p_backup_kam_user_id and role = 'KAM' and is_active
    ) then
        raise exception 'Backup KAM must be an active user' using errcode = '23514';
    end if;
    if p_backup_kam_user_id = p_kam_user_id then
        raise exception 'KAM and backup KAM must be different users' using errcode = '23514';
    end if;

    insert into public.tenants(tenant_type, name, legal_name, email_domain)
    values ('ORGANIZATION', p_tenant_name, p_legal_name, p_email_domain)
    returning * into new_tenant;

    insert into public.contracts(
        tenant_id, contract_number, status, sla_tier, start_date, end_date,
        contract_value, payment_terms
    ) values (
        new_tenant.id,
        coalesce(p_contract_number, 'TOF-' || to_char(now() at time zone 'UTC', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
        'DRAFT', p_sla_tier, p_start_date,
        p_end_date, p_contract_value, p_payment_terms
    ) returning id into new_contract_id;

    insert into public.contract_tier_budgets(tenant_id, contract_id, tier_key, budget_amount)
    select new_tenant.id, new_contract_id, item.key, item.value::numeric
    from jsonb_each_text(p_tier_budgets) as item;

    insert into public.team_client_assignments(tenant_id, user_id, assignment_type)
    values (new_tenant.id, p_kam_user_id, 'KAM');
    if p_backup_kam_user_id is not null then
        insert into public.team_client_assignments(tenant_id, user_id, assignment_type)
        values (new_tenant.id, p_backup_kam_user_id, 'BACKUP_KAM');
    end if;
    return next new_tenant;
end;
$$;
revoke all on function public.provision_client(
    text, text, text, uuid, uuid, text, text, date, date, numeric, text, jsonb
) from public, anon, authenticated;
grant execute on function public.provision_client(
    text, text, text, uuid, uuid, text, text, date, date, numeric, text, jsonb
) to service_role;

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
    where user_id = p_user_id and status = 'SENT' and expires_at > now()
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

create or replace function public.deactivate_tenant_user(p_tenant_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    update public.tenant_memberships
    set status = 'DEACTIVATED'
    where tenant_id = p_tenant_id and user_id = p_user_id and status <> 'DEACTIVATED';
    if not found then
        return false;
    end if;
    update public.profiles set is_active = false where id = p_user_id;
    update public.tenant_invitations
    set status = 'REVOKED'
    where tenant_id = p_tenant_id and user_id = p_user_id and status in ('PENDING', 'SENT');
    return true;
end;
$$;
revoke all on function public.deactivate_tenant_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.deactivate_tenant_user(uuid, uuid) to service_role;

create schema if not exists private;
create or replace function private.require_profile_tenant_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if exists (select 1 from public.profiles where id = new.id)
       and not exists (
           select 1 from public.tenant_memberships where user_id = new.id
       ) then
        raise exception 'Every user profile must have exactly one tenant membership';
    end if;
    return null;
end;
$$;
revoke all on function private.require_profile_tenant_membership() from public, anon, authenticated;

create or replace function private.require_membership_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if exists (select 1 from public.profiles where id = old.user_id)
       and not exists (
           select 1 from public.tenant_memberships where user_id = old.user_id
       ) then
        raise exception 'A tenant membership cannot be removed while its user exists';
    end if;
    return null;
end;
$$;
revoke all on function private.require_membership_owner() from public, anon, authenticated;

create constraint trigger profiles_require_tenant_membership
    after insert or update of id on public.profiles
    deferrable initially deferred for each row
    execute function private.require_profile_tenant_membership();
create constraint trigger memberships_require_profile_owner
    after delete on public.tenant_memberships
    deferrable initially deferred for each row
    execute function private.require_membership_owner();

create or replace function private.has_tenant_access(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid()) and p.is_active
          and p.role = 'SUPER_ADMIN'
    ) or exists (
        select 1 from public.tenant_memberships m
        join public.tenants t on t.id = m.tenant_id
        where m.user_id = (select auth.uid()) and m.tenant_id = target_tenant_id
          and m.status = 'ACTIVE' and t.status <> 'DEACTIVATED'
    ) or exists (
        select 1 from public.profiles p
        join public.team_client_assignments a on a.user_id = p.id
        where p.id = (select auth.uid()) and p.is_active and p.role = 'KAM'
          and a.tenant_id = target_tenant_id and a.active
    );
$$;
revoke all on function private.has_tenant_access(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.has_tenant_access(uuid) to authenticated;

create or replace function private.has_company_access(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select private.has_tenant_access(target_company_id);
$$;
revoke all on function private.has_company_access(uuid) from public, anon;
grant execute on function private.has_company_access(uuid) to authenticated;

alter table public.tenants enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.tenant_invitations enable row level security;
alter table public.team_client_assignments enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_tier_budgets enable row level security;
alter table public.client_addresses enable row level security;
alter table public.client_onboarding_steps enable row level security;
alter table public.recipients enable row level security;

drop policy if exists companies_read_scope on public.tenants;
drop policy if exists memberships_read_scope on public.tenant_memberships;
drop policy if exists assignments_read_scope on public.team_client_assignments;
drop policy if exists contracts_read_scope on public.contracts;
drop policy if exists budgets_read_scope on public.contract_tier_budgets;
drop policy if exists addresses_read_scope on public.client_addresses;
drop policy if exists onboarding_read_scope on public.client_onboarding_steps;
drop policy if exists recipients_read_scope on public.recipients;
drop policy if exists tenants_read_scope on public.tenants;
create policy tenants_read_scope on public.tenants for select to authenticated
    using ((select private.has_tenant_access(id)));
create policy memberships_read_scope on public.tenant_memberships for select to authenticated
    using (user_id = (select auth.uid()) or (select private.has_tenant_access(tenant_id)));
create policy assignments_read_scope on public.team_client_assignments for select to authenticated
    using (user_id = (select auth.uid()) or (select private.has_tenant_access(tenant_id)));
create policy contracts_read_scope on public.contracts for select to authenticated
    using ((select private.has_tenant_access(tenant_id)));
create policy budgets_read_scope on public.contract_tier_budgets for select to authenticated
    using ((select private.has_tenant_access(tenant_id)));
create policy addresses_read_scope on public.client_addresses for select to authenticated
    using ((select private.has_tenant_access(tenant_id)));
create policy onboarding_read_scope on public.client_onboarding_steps for select to authenticated
    using ((select private.has_tenant_access(tenant_id)));
create policy recipients_read_scope on public.recipients for select to authenticated
    using ((select private.has_tenant_access(tenant_id)));

-- Writes are intentionally service-role-only until module services and audit writes are in place.
grant select on public.tenants, public.tenant_memberships, public.team_client_assignments,
    public.contracts, public.contract_tier_budgets, public.client_addresses,
    public.client_onboarding_steps, public.recipients to authenticated;
grant all on public.tenants, public.tenant_memberships, public.team_client_assignments,
    public.tenant_invitations, public.contracts, public.contract_tier_budgets, public.client_addresses,
    public.client_onboarding_steps, public.recipients to service_role;

notify pgrst, 'reload schema';
