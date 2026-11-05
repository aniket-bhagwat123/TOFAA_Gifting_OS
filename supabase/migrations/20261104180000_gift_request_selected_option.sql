-- Which proposal option the client chose when approving (0-based position in proposal.options).
alter table public.gift_requests
    add column if not exists selected_option_index smallint
    check (selected_option_index is null or selected_option_index between 0 and 19);

notify pgrst, 'reload schema';
