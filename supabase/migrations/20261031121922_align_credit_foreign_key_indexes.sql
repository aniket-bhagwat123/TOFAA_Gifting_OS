-- Use the canonical index names already declared in credit_management.sql.
drop index if exists public.credit_ledger_created_by_user_idx;
drop index if exists public.credit_request_events_actor_user_idx;
drop index if exists public.credit_requests_created_by_user_idx;
drop index if exists public.credit_requests_ledger_entry_id_idx;
drop index if exists public.credit_requests_reviewed_by_user_idx;
drop index if exists public.credit_requests_verified_by_user_idx;
create index if not exists credit_ledger_created_by_idx on public.credit_ledger_entries(created_by_user_id);
create index if not exists credit_request_events_actor_idx on public.credit_request_events(actor_user_id);
create index if not exists credit_requests_created_by_idx on public.credit_requests(created_by_user_id);
create index if not exists credit_requests_ledger_entry_idx on public.credit_requests(ledger_entry_id);
create index if not exists credit_requests_reviewed_by_idx on public.credit_requests(reviewed_by_user_id);
create index if not exists credit_requests_verified_by_idx on public.credit_requests(verified_by_user_id);
