# Project Structure Blueprint

A folder structure for a full-stack app: **Next.js frontend + FastAPI backend + Supabase database**.
Copy this layout into a new repository and add your own feature modules using the patterns below.

---

## 1. Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 3, Redux Toolkit + redux-persist, axios, react-hook-form + zod, sonner, lucide-react |
| Backend | Python 3.12, FastAPI, Pydantic v2 + pydantic-settings, PyJWT, `uv`, pytest |
| Data / Auth | Supabase (Postgres, Auth, Storage) |
| Email | Resend |
| Hosting | Render (backend, `render.yaml`), any Node host for the frontend |

---

## 2. Repository layout

```
repo-root/
├── backend/            FastAPI service (REST API under /api/v1)
├── frontend/           Next.js web app
├── supabase/           Database migrations + config
├── mobile/             Reserved for a future mobile app
├── render.yaml         Backend deploy blueprint
├── start.bat           Dev launcher (backend :8000 + frontend :3000)
└── PROJECT_STRUCTURE.md
```

---

## 3. Backend

```
backend/
├── pyproject.toml            dependencies + pytest config
├── uv.lock
├── .python-version
├── .env.example              environment variable names (no values)
├── README.md
├── API_REFERENCE.md          generated API reference
├── src/
│   ├── main.py               FastAPI app: CORS, error handlers, middleware, health routes
│   ├── api/
│   │   └── router.py         mounts every module router under /api/v1
│   ├── core/                 cross-cutting infrastructure (no business rules)
│   │   ├── config.py         settings loaded from .env
│   │   ├── supabase.py       database client
│   │   ├── security.py       JWT verification
│   │   ├── errors.py         exceptions + error response shape
│   │   ├── pagination.py     page / limit helpers
│   │   ├── schema.py         shared response envelope
│   │   ├── activity.py       activity feed helper
│   │   ├── audit.py          audit trail writer
│   │   ├── concurrency.py    optimistic locking helpers
│   │   ├── images.py         image upload validation
│   │   ├── telemetry.py      request timing / logging
│   │   └── ttl_cache.py      small in-memory cache
│   └── modules/              one folder per feature (see 3.1)
│       ├── auth/             sign-in, tokens, roles (used by every other module)
│       └── <your_module>/    add features here
└── tests/
    ├── conftest.py
    ├── unit/<module>/        schema, service and helper tests
    └── e2e/                  API-level tests through the ASGI app
```

### 3.1 Module pattern

Every feature folder has the same shape:

```
modules/<module_name>/
├── __init__.py
├── router.py     HTTP only: path, method, auth dependency, calls the service
├── schemas.py    Pydantic request / response models
├── service.py    business rules + database queries (no FastAPI imports)
└── (optional)    extra files when a module grows, e.g. helpers.py, export.py, guard.py
```

Rules:
- `router.py` never touches the database.
- `service.py` holds permission checks and all queries.
- Modules import each other's `service.py` / `schemas.py`, never another `router.py`.
- Each module has matching tests in `tests/unit/<module_name>/`.

`modules/auth/` also provides the shared pieces: current-user dependency, role enum, permission checks.

### 3.2 Mounting modules (`src/api/router.py`)

```python
api_router = APIRouter()

# Public / pre-context routes
api_router.include_router(auth_router)

# Guarded routes (add a dependency that validates the scope in the path)
guarded = [Depends(enforce_scope)]
api_router.include_router(<module>_router, dependencies=guarded)
```

`main.py` mounts `api_router` at `/api/v1`. Docs are at `/api/v1/docs` (turned off in production).

### 3.3 Endpoint conventions

```
GET    /api/v1/<resource>              list (page, limit, search, sort)
POST   /api/v1/<resource>              create
GET    /api/v1/<resource>/{id}         read
PATCH  /api/v1/<resource>/{id}         update
DELETE /api/v1/<resource>/{id}         delete
POST   /api/v1/<resource>/{id}/<action>  state change (approve, cancel, activate …)
POST   /api/v1/<resource>/bulk-delete  bulk action
PUT    /api/v1/<resource>/{id}/image   file upload
GET    /health  /health/live  /health/ready
```

- Response envelope: `{ "data": ..., "message": "..." }`.
- Validation errors: `{ "data": { "errors": [...] }, "message": "Request validation failed." }`.
- Auth: `Authorization: Bearer <access_token>`.
- Updates send a record `version`; a conflict returns `409` with the latest copy.
- Money-moving or repeatable POSTs take an `Idempotency-Key` header.
- JSON is camelCase on the wire, snake_case in Python.

### 3.4 Environment variables (`.env.example`)

```
ENVIRONMENT, PROJECT_NAME, API_V1_STR, BACKEND_CORS_ORIGINS, FRONTEND_URL,
RESEND_API_KEY, RESEND_FROM_EMAIL,
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
SUPABASE_JWT_SECRET, SUPABASE_JWT_ALGORITHM, SUPABASE_JWT_AUDIENCE
```

---

## 4. Database

```
supabase/
├── config.toml
├── .gitignore
└── migrations/
    └── YYYYMMDDHHMMSS_<what_changed>.sql    one file per change, applied in filename order
```

Never edit an applied migration; add a new one named for the change.

---

## 5. Frontend

```
frontend/
├── package.json  tsconfig.json  next.config.ts  tailwind.config.ts  postcss.config.mjs
├── .env.example                 NEXT_PUBLIC_API_BASE_URL (API origin only; /api/v1 is appended)
├── DESIGN.md                    visual rules
├── README.md
├── public/
│   ├── manifest.webmanifest  sw.js  offline.html     PWA files
│   ├── icons/
│   └── images/
└── src/
    ├── app/            routes only (thin pages)
    ├── components/     UI, grouped by feature
    ├── features/       state + API logic per domain
    ├── services/       axios client + endpoint constants
    ├── store/          Redux store + typed hooks
    ├── hooks/          shared React hooks
    ├── lib/            pure helpers (no React)
    └── types/          shared TypeScript types
```

### 5.1 `src/app/` (routes)

```
app/
├── layout.tsx  globals.css  page.tsx
├── login/page.tsx
├── forgot-password/page.tsx
├── reset-password/page.tsx
└── (portal)/                        signed-in area
    ├── layout.tsx                   portal shell + auth guard
    ├── home/page.tsx
    ├── profile/page.tsx
    ├── <feature>/page.tsx           list page
    ├── <feature>/new/page.tsx       create page
    ├── <feature>/[id]/page.tsx      detail page
    ├── <feature>/[id]/edit/page.tsx
    └── [module]/page.tsx            generic config-driven list page (see 5.3)
```

Pages stay thin: read params, check access, render one component.

### 5.2 `src/components/`

```
components/
├── providers.tsx            Redux + persist gate + toaster + session handler
├── pwa-register.tsx
├── layout/                  portal-shell, sidebar, topbar
├── ui/                      design-system primitives (no business logic, no API calls)
│     button, card, sheet, side-panel, delete-dialog, popover, input-field, password-field,
│     searchable-select, switch, tab-bar, status-badge, avatar, spinner, empty-state,
│     date-picker-field, date-time-picker-field, time-picker-field, calendar,
│     filter-menu, format-menu, form-panel, page-header, search-input, image-upload,
│     hover-scroll-x, required-mark, table-styles
├── modules/                 generic config-driven screens: module-gate, module-list, …
├── profile/                 profile form
└── <feature>/               one folder per feature: list view, table, dialog, sheet, wizard/ …
```

Rules: a feature folder owns its components. Anything reused by two or more features moves to `ui/` (visual)
or `lib/` (logic). All destructive confirmations use `ui/delete-dialog.tsx`.

### 5.3 `src/features/`, `services/`, `store/`, `lib/`

```
features/
├── auth/        auth.service.ts, auth.slice.ts
├── modules/     module-config.ts   registry that drives generic list pages
│                module.service.ts  getModuleRecords / mutateModule
│                module-utils.ts
│                modules.slice.ts
├── dashboard/   dashboard.service.ts
├── forms/       form.service.ts, schemas.ts (zod)
└── <domain>/    add per-domain services and slices here

services/
├── api-client.ts    axios instance (base URL + /api/v1, Bearer token, refresh on 401, retry on timeout)
└── endpoints.ts     endpoint constants

store/   index.ts (configureStore + redux-persist), hooks.ts (typed hooks)
hooks/   shared hooks
lib/     utils.ts (cn), csv.ts, data-io.ts, password.ts
types/   api.ts
```

**Config-driven list pages.** `features/modules/module-config.ts` exports a record of module definitions.
The route `app/(portal)/[module]/page.tsx` looks up the key and renders `ModuleGate` → `ModuleList`
(table, search, create / edit / delete, row actions). Adding a simple list screen is one config entry:

```ts
type ModuleConfig = {
  roles: Role[];                                   // who can open it (sidebar + route guard)
  title: string; singular?: string; description: string; emptyHint?: string;
  endpoint: (user, selectedScopeId) => string;     // API path for the list
  columns: string[];
  createFields?: ModuleField[]; updateFields?: ModuleField[];
  updateMethod?: "patch" | "put";
  updateEndpoint?: (endpoint, record) => string;
  deletePath?: (endpoint, id) => string;
  actions?: (row, user, scopeId) => ModuleAction[]; // extra row buttons that call the API
  modalWidth?: "sm" | "md" | "lg" | "xl"; pageSize?: number;
};
```

Complex screens (wizards, boards, dashboards) get their own components under `components/<feature>/`
and still call the API through `module.service.ts`.

---

## 6. Adding a feature

1. **Database:** add `supabase/migrations/<timestamp>_<name>.sql`.
2. **Backend:** create `backend/src/modules/<name>/{__init__,router,schemas,service}.py`, mount it in `src/api/router.py`, add `tests/unit/<name>/`.
3. **Frontend, simple list:** add one entry to `moduleConfig`.
4. **Frontend, custom screen:** add a thin page under `src/app/(portal)/<route>/` and components under `src/components/<feature>/`; call the API through `module.service.ts`; use `ui/` primitives.
5. Regenerate `backend/API_REFERENCE.md`.

## 7. End-to-end application flow

The browser talks to FastAPI; the backend owns database and storage access. The frontend does not
connect directly to Supabase.

```text
Browser page / feature component
  -> frontend/src/features/* or frontend/src/components/*
  -> frontend/src/features/modules/module.service.ts
  -> frontend/src/services/api-client.ts
  -> FastAPI /api/v1 route
  -> authentication + tenant guard
  -> backend/src/modules/<feature>/service.py
  -> Supabase Auth, Postgres (PostgREST / RPC), or Storage
  <- { "data": ..., "message": "..." }
```

### 7.1 Frontend to API

- Pages in `frontend/src/app/` render feature components. Feature components call
  `getModuleRecords` for reads and `mutateModule` for writes; both use the shared Axios client.
- The client appends `/api/v1` to `NEXT_PUBLIC_API_BASE_URL`, attaches the saved bearer token, and
  unwraps the API's `data` response envelope. It refreshes an expired session once and retries the
  request; if refresh fails, it clears the session and returns the user to sign-in.
- Login goes through `/api/v1/auth/login`. The backend authenticates with Supabase Auth and returns
  a profile and token pair. The current frontend stores that pair in `tofaa-session` in browser
  local storage. Do not log or expose these tokens.
- The frontend base URL is the backend origin only, for example `http://localhost:8000`; do not
  append `/api/v1` there.

### 7.2 API to backend service

- `backend/src/main.py` configures FastAPI, middleware, error responses, CORS, health endpoints, and
  mounts `api_router` at `API_V1_STR` (normally `/api/v1`).
- `backend/src/api/router.py` mounts auth and other pre-tenant routes separately. Tenant feature
  routers are mounted with `enforce_tenant_scope`.
- `CurrentUserDep` validates the bearer JWT and resolves the current profile. The tenant guard
  checks the tenant in the URL; feature services still enforce their action-level permissions and
  tenant filters. Routes without a tenant ID in the URL must resolve and check the record's tenant
  in the service.
- A feature `router.py` validates HTTP input and calls its `service.py`. The service owns business
  rules, authorization, database queries, and storage operations. `schemas.py` defines the request
  and response shapes.
- Successful responses use `{ "data": ..., "message": "..." }`. Validation and HTTP errors use the
  same envelope, with a readable message and any validation details.

### 7.3 Backend to Supabase

- `backend/src/core/supabase.py` creates the Supabase clients. Auth uses the anon client; privileged
  backend database and storage operations use the service-role client. The service-role key bypasses
  RLS, so every service query must apply the required tenant and record filters and enforce access
  before reading or writing.
- Access tokens are verified by the backend. The user-scoped client is available when an operation
  must run with the user's token and therefore be subject to that user's RLS policies.
- Supabase Auth manages credentials and token refresh; Postgres stores application data and exposes
  RPCs; Storage holds uploaded files. Private buckets and their policies belong in SQL migrations.
- RLS is still required to protect direct Supabase access. It supplements, but does not replace, the
  backend tenant guard and service-level authorization.

### 7.4 Example: gift request

1. A page under `frontend/src/app/` renders the gift-request component. The component sends a request
   through the shared module service; the API client adds the session token and `/api/v1` prefix.
2. FastAPI dispatches to `backend/src/modules/gift_requests/router.py`. Authentication and the
   tenant guard run before the route calls `gift_request_service`.
3. `gift_request_service` checks the actor, tenant, recipient, and related event or occasion, then
   reads or writes `gift_requests` and related records through Supabase.
4. Workflow actions are validated by the service and database functions defined by migrations.
   The database records status changes and gift-request history; proposal approval also applies the
   relevant credit and budget rules.
5. FastAPI returns the updated request in the standard response envelope. The frontend displays it
   and clears its short-lived request cache after mutations.

Events are tenant-owned and tied to a specific recipient (for example, a birthday). Occasions are
shared events managed by TOFAA (for example, a festival) and can drive bulk gift requests. Both
flows use the gift-request API and the same tenant and permission checks.

## 8. Supabase migration and environment management

`supabase/migrations/` is the version-controlled source of truth for schema, constraints, RLS,
functions, triggers, and Storage configuration. Create a new timestamped migration for every change;
never edit a migration that has already been applied.

### Local development

Run Supabase CLI commands from the repository root. Install the Supabase CLI and Docker Desktop
first. `start.bat` starts only the FastAPI and Next.js development servers; it does not start the
local Supabase stack.

```powershell
supabase start
supabase status
supabase db reset
```

`supabase db reset` is destructive to the local database: it rebuilds it from migrations and runs
the configured seed. The current `supabase/config.toml` enables seeding and points to
`supabase/seed.sql`; add that file or update the seed configuration before relying on a local reset.
Use local Supabase credentials in `backend/.env` when developing against the local stack.

### Adding and deploying a database change

1. Create a migration, for example `supabase migration new add_gift_feature_fields`.
2. Write the SQL in the generated file under `supabase/migrations/`. Include relevant constraints,
   indexes, RLS policies, functions, and Storage policies in the migration.
3. Apply and test it against a local Supabase database. Run the relevant backend tests as well.
4. Review the migration and deploy it to the intended Supabase project. Link the project once with
   `supabase link --project-ref <project-ref>`, check migration status with `supabase migration list`,
   then apply pending migrations with `supabase db push`.
5. Deploy the backend and frontend only after the database migration succeeds. Keep separate
   Supabase projects and credentials for development, staging, and production.

Do not put the service-role key or JWT signing secret in frontend variables, source control, or
client-side code. Configure Supabase URL, anon key, service-role key, and JWT settings in the
backend environment; configure only the API origin as `NEXT_PUBLIC_API_BASE_URL` in the frontend.
Keep local environment files out of commits, and apply production migrations through the reviewed
migration workflow rather than making untracked dashboard edits.
