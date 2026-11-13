-- Collaborative recipient onboarding: one shared recipient record that the client's EA and TOFAA's KAM both maintain.
-- Everything here is additive: new nullable columns, new tables. Existing recipients, events and flows keep working.

-- 1. More about the person, plus a version number so two people editing at once are warned instead of overwriting.
alter table public.recipients
    add column if not exists email text
        check (email is null or (char_length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
    add column if not exists company text check (company is null or char_length(company) <= 200),
    add column if not exists recipient_type text not null default 'INDIVIDUAL'
        check (recipient_type in ('INDIVIDUAL', 'BUSINESS')),
    add column if not exists version integer not null default 1,
    add column if not exists city text check (city is null or char_length(city) <= 100);

-- The city is kept on its own so a person can be added with just a city; existing rows get it from their address.
update public.recipients set city = nullif(btrim(address->>'city'), '') where city is null and address is not null;
create index if not exists recipients_tenant_city_idx on public.recipients (tenant_id, lower(city)) where city is not null and deleted_at is null;

create index if not exists recipients_tenant_email_idx
    on public.recipients (tenant_id, lower(email))
    where email is not null and deleted_at is null;

-- 2. Links between recipients ("Anjali is Sachin's spouse"). One row per direction, so each side can be edited alone.
create table if not exists public.recipient_relationships (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    recipient_id uuid not null,
    related_recipient_id uuid not null,
    relationship_type text not null check (relationship_type in
        ('SPOUSE', 'SON', 'DAUGHTER', 'PARENT', 'SIBLING', 'BUSINESS_ASSOCIATE', 'COLLEAGUE', 'OTHER')),
    created_by_user_id uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint recipient_relationships_distinct check (recipient_id <> related_recipient_id),
    constraint recipient_relationships_recipient_fk foreign key (tenant_id, recipient_id)
        references public.recipients (tenant_id, id) on delete cascade,
    constraint recipient_relationships_related_fk foreign key (tenant_id, related_recipient_id)
        references public.recipients (tenant_id, id) on delete cascade,
    constraint recipient_relationships_pair_uq unique (tenant_id, recipient_id, related_recipient_id)
);
create index if not exists recipient_relationships_related_idx on public.recipient_relationships (tenant_id, related_recipient_id);

-- 3. People who share an occasion (a wedding anniversary belongs to both partners). The event keeps its main recipient.
create table if not exists public.event_participants (
    event_id uuid not null references public.events(id) on delete cascade,
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    recipient_id uuid not null,
    created_at timestamptz not null default now(),
    primary key (event_id, recipient_id),
    constraint event_participants_recipient_fk foreign key (tenant_id, recipient_id)
        references public.recipients (tenant_id, id) on delete cascade
);
create index if not exists event_participants_recipient_idx on public.event_participants (tenant_id, recipient_id);

-- 4. Gifting preferences (all optional).
create table if not exists public.recipient_preferences (
    recipient_id uuid primary key,
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    interests text[] not null default '{}',
    preferred_brands text[] not null default '{}',
    gift_preferences text check (gift_preferences is null or char_length(gift_preferences) <= 2000),
    dietary_preferences text check (dietary_preferences is null or char_length(dietary_preferences) <= 1000),
    gifts_to_avoid text check (gifts_to_avoid is null or char_length(gifts_to_avoid) <= 1000),
    special_instructions text check (special_instructions is null or char_length(special_instructions) <= 2000),
    updated_by_user_id uuid references public.profiles(id) on delete set null,
    updated_at timestamptz not null default now(),
    constraint recipient_preferences_recipient_fk foreign key (tenant_id, recipient_id)
        references public.recipients (tenant_id, id) on delete cascade
);

-- 5. Delivery addresses: several per person, one marked default.
create table if not exists public.recipient_addresses (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    recipient_id uuid not null,
    label text not null check (label in ('OFFICE', 'RESIDENTIAL', 'OTHER')),
    address_line1 text not null check (char_length(address_line1) between 3 and 300),
    address_line2 text check (address_line2 is null or char_length(address_line2) <= 300),
    city text not null check (char_length(city) between 1 and 100),
    state text check (state is null or char_length(state) <= 100),
    postal_code text not null check (postal_code ~ '^[0-9]{6}$'),
    country text not null default 'IN' check (country ~ '^[A-Z]{2}$'),
    is_default boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint recipient_addresses_recipient_fk foreign key (tenant_id, recipient_id)
        references public.recipients (tenant_id, id) on delete cascade
);
create unique index if not exists recipient_addresses_one_default_uq
    on public.recipient_addresses (recipient_id) where is_default;
create index if not exists recipient_addresses_recipient_idx on public.recipient_addresses (tenant_id, recipient_id);

-- 6. Where each missing piece of information stands (pending, asked of the client, verified, ...).
create table if not exists public.recipient_info_status (
    recipient_id uuid not null,
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    field_key text not null check (char_length(field_key) between 1 and 60),
    status text not null check (status in
        ('PENDING', 'REQUESTED_FROM_CLIENT', 'KAM_FOLLOW_UP', 'SUBMITTED_FOR_CONFIRMATION', 'VERIFIED', 'NOT_APPLICABLE')),
    note text check (note is null or char_length(note) <= 1000),
    updated_by_user_id uuid references public.profiles(id) on delete set null,
    updated_at timestamptz not null default now(),
    primary key (recipient_id, field_key),
    constraint recipient_info_status_recipient_fk foreign key (tenant_id, recipient_id)
        references public.recipients (tenant_id, id) on delete cascade
);

-- 7. Immutable history of what changed on a recipient, by whom, from which source.
create table if not exists public.recipient_audit (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    tenant_id uuid not null references public.tenants(id) on delete restrict,
    recipient_id uuid not null,
    actor_user_id uuid not null,
    actor_name text,
    actor_role text not null,
    action text not null check (action in ('CREATE', 'EDIT', 'IMPORT', 'UPDATE', 'ARCHIVE', 'RESTORE', 'DELETE')),
    field text,
    old_value jsonb,
    new_value jsonb,
    source text not null default 'MANUAL'
        check (source in ('MANUAL', 'EXCEL_IMPORT', 'CALL', 'WHATSAPP', 'MEETING', 'EMAIL', 'OTHER'))
);
create index if not exists recipient_audit_recipient_idx on public.recipient_audit (tenant_id, recipient_id, created_at desc);

create or replace function private.reject_recipient_audit_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception 'recipient_audit_is_append_only' using errcode = '23514';
end;
$$;
revoke all on function private.reject_recipient_audit_change() from public, anon, authenticated;

drop trigger if exists recipient_audit_append_only on public.recipient_audit;
create trigger recipient_audit_append_only
    before update or delete on public.recipient_audit
    for each row execute function private.reject_recipient_audit_change();

-- 8. Locked down like every other tenant table: only the API (service role) reads and writes.
alter table public.recipient_relationships enable row level security;
alter table public.event_participants enable row level security;
alter table public.recipient_preferences enable row level security;
alter table public.recipient_addresses enable row level security;
alter table public.recipient_info_status enable row level security;
alter table public.recipient_audit enable row level security;
revoke all on public.recipient_relationships, public.event_participants, public.recipient_preferences,
    public.recipient_addresses, public.recipient_info_status, public.recipient_audit from public, anon, authenticated;
grant select, insert, update, delete on public.recipient_relationships, public.event_participants, public.recipient_preferences,
    public.recipient_addresses, public.recipient_info_status to service_role;
grant select, insert on public.recipient_audit to service_role;
grant usage, select on sequence public.recipient_audit_id_seq to service_role;

notify pgrst, 'reload schema';
