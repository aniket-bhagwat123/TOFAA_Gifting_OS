-- Recipient import/export fields: the occasion a person is gifted for, and a separate budget for their birthday and anniversary.
alter table public.recipients
    add column if not exists gifting_occasion text check (gifting_occasion is null or length(trim(gifting_occasion)) between 1 and 200),
    add column if not exists birthday_budget numeric(12, 2) check (birthday_budget is null or birthday_budget >= 0),
    add column if not exists anniversary_budget numeric(12, 2) check (anniversary_budget is null or anniversary_budget >= 0);
notify pgrst, 'reload schema';
