A user will send a gift under two categories:
1. Events
2. Occasions

1. Events: Your events are only a narrower thing for the recipient. An event will contain birthdays, anniversaries, or any specific things that are connected to the particular recipient.
- Events are created by a tenant for his recipients, and he is able to create a budget for it for each event. 
2. Occasions: Occasions are something broader. Occasions are common festivals that are common across all the tenets, like Diwali, Eid, Christmas, and New Year.
- Occasions are the common events that are common across all the tenants, like the festivals. It is created by the super admin or the internal team of the Tofaa. All the tenants will see the upcoming occasions and give bulk orders. 

The difference between occasion and event is that occasion is a broader spectrum where we give well orders, but for events, that is individual for the recipient, where we sell the gifts in retail. 



## Tenant isolation

Tenant data is protected at three layers. A new feature must keep all three.

1. **Tenant guard (`src/modules/tenants/guard.py`).** Every module router is mounted with `enforce_tenant_scope`, which validates the `tenant_id` in the path on each request:
   - Malformed ID: `422`.
   - Unknown tenant, or a tenant the caller has no access to: `404`. The two look identical, so tenant IDs cannot be probed.
   - Write to a deactivated tenant: `409`. Staff can still read it.
   - Denied requests are logged as `tenant_access_denied` (logger `tofaa.tenant_access`), and allowed ones as `tenant_access`.
2. **Services.** The backend connects with the Supabase service role, which bypasses RLS, so every query must filter by `tenant_id`. Routes that find the tenant from a record ID (`/gifts/{id}`, `/admin/...`) have no tenant in the path and must call `tenant_service.require_context(tenant_id, actor, write=True)`.
3. **Database.** RLS denies direct access with the anon key except through the read policies. Composite foreign keys and triggers stop records from referencing another tenant, or moving to one.

Who can reach a client tenant:

| Role | Access |
| --- | --- |
| `CLIENT` | Their own tenant, while both the membership and the tenant are `ACTIVE` |
| `KAM` | Every client for now (`KAM_ACCESS_ALL_CLIENTS=true`). Set it to `false` to limit KAMs to their `team_client_assignments` rows |
| `SUPER_ADMIN` | Every client |

Clients and KAMs belong to exactly one tenant and cannot sign in without an active one. A super admin needs no tenant. KAMs belong to the single `INTERNAL` "TOFAA Internal" tenant. That membership only says who they are: it is never a data context (routes return 404 for it) and grants no client access. Staff accounts are managed at `/admin/team`; client users at `/tenants/{id}/users`. The tenant's email domain is optional information and never decides who can be invited.

Staff changes are written to `audit_log` (append-only) by one middleware. Clients read the staff changes made for them at `/tenants/{id}/activity`, without the staff member's identity.

`tests/unit/tenants/test_tenant_isolation.py` calls every tenant route in the API schema as another tenant's client, so a route mounted without the guard fails the test suite.

## Production settings

Set `ENVIRONMENT=production`. The API then refuses to start on placeholder Supabase keys, a JWT secret under 32 characters, or any non-HTTPS URL or CORS origin. It also sends HSTS and stops serving the API docs.
