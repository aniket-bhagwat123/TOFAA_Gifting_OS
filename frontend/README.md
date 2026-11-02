# TOFAA Gifting OS – Phase 1 Frontend

A Next.js App Router + TypeScript starter frontend built from `TOFAA_Phase1_API_Specification_Formatted.docx`.

## Stack

- Next.js App Router / React / TypeScript strict mode
- Tailwind CSS
- Redux Toolkit + React Redux
- Axios with cookie credentials
- React Hook Form + Zod
- Sonner notifications
- Lucide React icons

## Run locally

1. Install Node.js 20.9+.
2. Copy `.env.example` to `.env.local`.
3. Set `NEXT_PUBLIC_API_BASE_URL` to the backend origin (for example `http://localhost:8000`).
4. Install and run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Implemented foundation

- Login, logout and current-user bootstrap using `/auth/login`, `/auth/logout`, `/auth/me`.
- Role-aware sidebar for `CLIENT`, `TOFAA_TEAM` and `SUPER_ADMIN`.
- Role-specific dashboard API selection:
  - `/dashboard/client`
  - `/dashboard/team`
  - `/dashboard/admin`
- Generic API-driven paginated list screens for clients, recipients, occasions, requests, gifts, issues, invoices, notifications, team users and audit logs.
- Reusable UI primitives, status badges, form input, Zod schemas and a working create-recipient form.
- Centralized Axios client and API error helpers.

## Phase 1 endpoint inventory used by the starter

| Area | Endpoints |
|---|---|
| Authentication | `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/password/forgot`, `/auth/password/reset`, `/auth/password/change` |
| Dashboard | `/dashboard/client`, `/dashboard/team`, `/dashboard/admin` |
| Clients | `/clients`, `/clients/{clientId}`, `/clients/{clientId}/users`, `/company-change-requests` |
| Contract | `/contract`, `/contract/spend-summary` |
| Recipients | `/recipients`, `/recipients/{id}`, `/recipients/imports`, `/recipient-groups`, `/recipients/exports` |
| Occasions | `/occasions`, `/occasions/custom`, `/admin/occasions` |
| Requests / proposals | `/requests`, `/requests/{id}`, `/requests/{id}/messages`, `/requests/{id}/proposals`, `/proposals/{id}/send`, `/proposals/{id}/approve`, `/proposals/{id}/reject` |
| Gifts / fulfilment | `/gifts`, `/gifts/{id}`, `/gifts/{id}/status`, `/gifts/{id}/dispatch`, `/gifts/{id}/delivery-proof`, `/gifts/{id}/issues`, `/gifts/{id}/wish-card` |
| Issues | `/issues`, `/issues/{id}/resolve` |
| Finance | `/invoices`, `/invoices/{id}/mark-paid`, `/invoices/{id}/file` |
| Notifications / files | `/notifications`, `/notifications/{id}/read`, `/notifications/mark-all-read`, `/files` |
| Administration | `/admin/team-users`, `/admin/sla-rules`, `/admin/settings`, `/admin/audit-logs` |

The full source specification contains additional workflow endpoints. Implement each workflow against the backend's finalized Swagger contract before enabling it in production.

## Important API contract notes

The source API document calls itself a **proposed implementation contract**, not an OpenAPI-generated final contract. Verify paths, payloads, status enums, permissions and error details against the running Swagger UI before production integration.

The API specification assumes secure HttpOnly cookie sessions. The Axios client uses `withCredentials: true`; configure backend CORS to allow the frontend origin with credentials and implement CSRF protection for cookie-authenticated state-changing requests. Do not move session secrets into localStorage.

Tenant isolation and authorization must be enforced by the backend. Frontend role-aware navigation is only a usability layer, not a security boundary.

## Known next implementation steps

1. Add backend-specific CSRF token handling if required by the backend.
2. Confirm exact Swagger schemas and response envelopes; adapt generic list parsing if the API wraps payloads differently.
3. Add full create/detail/edit workflows for clients, requests, proposals, gifts, issues, invoices and admin configuration.
4. Implement invitation acceptance, Team activation, password reset, Team email challenge and Super Admin TOTP screens.
5. Add recipient import preview/commit, export job polling and secure file download handling.
6. Add permission checks per action using the actual permissions returned by `/auth/me`.
7. Add unit, integration and end-to-end tests.
8. Run `npm run typecheck` and `npm run build` after installing dependencies.

## Important scope exclusions

This frontend intentionally does not implement Phase 2 features such as vendor portal, online payments, automatic courier booking/tracking, mobile OTP login, delivery-agent portal, multi-level approval, or native mobile app.
