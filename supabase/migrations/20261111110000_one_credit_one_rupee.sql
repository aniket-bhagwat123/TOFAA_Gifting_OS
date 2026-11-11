-- 1 credit = 1 rupee (100 paise). Credit requests already raised keep the price they were made at.
insert into public.credit_pricing(id, currency, minor_units_per_credit)
values (1, 'INR', 100)
on conflict (id) do update set currency = 'INR', minor_units_per_credit = 100, updated_at = now();
