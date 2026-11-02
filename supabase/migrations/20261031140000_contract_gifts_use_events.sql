-- Convert legacy contract gift occasion references into recipient events.
-- Clean installations already create event_id, so only perform the backfill
-- when the legacy occasion_id column is present.
create unique index if not exists events_tenant_id_id_recipient_uq
    on public.events(tenant_id, id, recipient_id);

do $$
declare
    gift_group record;
    created_event_id uuid;
begin
    if exists (select 1 from information_schema.columns
        where table_schema='public' and table_name='gifts' and column_name='occasion_id') then
        alter table public.gifts add column if not exists event_id uuid;
        create temporary table gift_occasion_event_map (
            tenant_id uuid not null, recipient_id uuid not null, occasion_id uuid not null,
            event_id uuid not null, primary key (tenant_id, recipient_id, occasion_id)
        ) on commit drop;
        for gift_group in
            select g.tenant_id, g.recipient_id, g.occasion_id,
                   o.occasion_name, coalesce(o.occasion_date, min(g.delivery_date)) as event_date,
                   o.description, o.is_active
            from public.gifts g join public.occasions o on o.id=g.occasion_id
            group by g.tenant_id,g.recipient_id,g.occasion_id,o.occasion_name,o.occasion_date,o.description,o.is_active
        loop
            if gift_group.event_date is null then
                raise exception 'Cannot migrate gift occasion % without an occasion or delivery date',gift_group.occasion_id;
            end if;
            insert into public.events(tenant_id,recipient_id,event_name,event_date,description,is_active)
            values(gift_group.tenant_id,gift_group.recipient_id,gift_group.occasion_name,gift_group.event_date,gift_group.description,gift_group.is_active)
            returning id into created_event_id;
            insert into gift_occasion_event_map values(gift_group.tenant_id,gift_group.recipient_id,gift_group.occasion_id,created_event_id);
        end loop;
        update public.gifts g set event_id=m.event_id
        from gift_occasion_event_map m
        where m.tenant_id=g.tenant_id and m.recipient_id=g.recipient_id and m.occasion_id=g.occasion_id;
        alter table public.gifts alter column event_id set not null;
        alter table public.gifts drop constraint if exists gifts_occasion_id_fkey;
        alter table public.gifts drop column occasion_id;
        alter table public.gifts drop constraint if exists gifts_event_same_tenant_recipient_fk;
        alter table public.gifts add constraint gifts_event_same_tenant_recipient_fk
            foreign key(tenant_id,event_id,recipient_id) references public.events(tenant_id,id,recipient_id) on delete restrict;
    end if;
end $$;

create index if not exists gifts_tenant_event_idx on public.gifts(tenant_id,event_id);
notify pgrst, 'reload schema';
