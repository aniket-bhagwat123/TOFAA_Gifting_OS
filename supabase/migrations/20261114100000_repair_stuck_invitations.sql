-- Repair users whose tenant_memberships row is stuck at INVITED.
-- This happens when accept_tenant_invitation is called during tenant creation but
-- fails silently (invitation already ACCEPTED, or invitation in PENDING state).
-- The user can authenticate but cannot log in because tenant_id resolves to NULL.
--
-- Safe to run multiple times: only affects INVITED rows that belong to an active tenant.

do $$
declare
    r record;
    promoted integer := 0;
begin
    for r in
        select m.user_id, m.tenant_id
        from public.tenant_memberships m
        join public.tenants t on t.id = m.tenant_id
        where m.status = 'INVITED'
          and t.status = 'ACTIVE'
          -- Only promote users whose account is otherwise complete (profile exists)
          and exists (select 1 from public.profiles p where p.id = m.user_id)
    loop
        update public.tenant_memberships
        set status = 'ACTIVE'
        where user_id = r.user_id
          and tenant_id = r.tenant_id
          and status = 'INVITED';

        update public.profiles
        set is_active = true
        where id = r.user_id;

        promoted := promoted + 1;
    end loop;

    if promoted > 0 then
        raise notice 'Promoted % stuck invitation(s) to ACTIVE.', promoted;
    else
        raise notice 'No stuck invitations found — nothing to repair.';
    end if;
end;
$$;

notify pgrst, 'reload schema';
