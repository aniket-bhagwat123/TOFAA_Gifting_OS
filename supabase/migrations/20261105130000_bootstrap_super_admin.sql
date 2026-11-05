-- The very first super admin has nobody to be invited by, so the inviter may be empty.
alter table public.tenant_invitations alter column invited_by_user_id drop not null;
