-- Starter global occasions (tenant_id null = visible to every client). Safe to re-run.
insert into public.occasions (tenant_id, occasion_name, occasion_date, description)
select null, v.name, v.on_date::date, v.descr
from (values
    ('Diwali',            '2026-11-08', 'Festival of lights'),
    ('Christmas',         '2026-12-25', 'Christmas Day'),
    ('New Year',          '2027-01-01', 'New Year''s Day'),
    ('Republic Day',      '2027-01-26', 'Republic Day of India'),
    ('Valentine''s Day',  '2027-02-14', 'Valentine''s Day'),
    ('Women''s Day',      '2027-03-08', 'International Women''s Day')
) as v(name, on_date, descr)
where not exists (
    select 1 from public.occasions o
    where o.tenant_id is null and lower(o.occasion_name) = lower(v.name)
);
