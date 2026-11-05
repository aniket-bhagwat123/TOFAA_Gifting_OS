# TOFAA Gifting OS API Reference

API endpoint and schema reference for UI integration.

**Generated from the application OpenAPI schema.** Rebuild after changing API routes or Pydantic schemas. JSON dates use ISO 8601 (`YYYY-MM-DD`); timestamps use ISO 8601 date-time; UUIDs are strings; decimals are JSON numbers/strings depending on client serialization.

> **Not yet regenerated for the tenant changes.** Public signup (`POST /auth/register`) is removed, and invitations no longer take `domainOverrideReason`. New: `GET /tenants/{tenantId}/activity` (changes TOFAA made for a client), `/admin/team` (TOFAA staff accounts, super admin only), and `firstUserEmail` / `firstUserName` on `POST /tenants`. User creation takes `sendInvitation` (default true); when false nobody is emailed, a `password` is required, and the account is active at once. Tenant type `INTERNAL` is reserved for the TOFAA team and is never returned in client lists. `GET /tenants/{tenantId}/recipients` accepts `recipientIds` (comma-separated IDs, at most 100) to return only those recipients, e.g. a group's members; an empty value returns none.

## Base URLs and authentication

- API base path: `/api/v1` (all versioned routes below are prefixed `/api/v1`).
- Protected endpoints require `Authorization: Bearer <access_token>` unless marked public. Authentication endpoints identify their own token requirements.
- OpenAPI JSON: `GET /api/v1/openapi.json`; interactive docs: `/api/v1/docs`; ReDoc: `/api/v1/redoc`.
- JSON responses generally use `{ "data": ..., "message": "..." }` for module endpoints. Auth endpoints and health check may return their model directly. Validation errors use `{ "data": { "errors": [...] }, "message": "Request validation failed." }`.

## Endpoint index

- [GET `/health` — System health check](#health-get-health)
- [GET `/health/live` — Liveness check](#health-get-health-live)
- [GET `/health/ready` — Readiness check](#health-get-health-ready)
- [POST `/api/v1/auth/login` — User login](#authentication-post-api-v1-auth-login)
- [POST `/api/v1/auth/refresh` — Refresh access token](#authentication-post-api-v1-auth-refresh)
- [POST `/api/v1/auth/logout` — User logout](#authentication-post-api-v1-auth-logout)
- [POST `/api/v1/auth/forgot-password` — Request password reset](#authentication-post-api-v1-auth-forgot-password)
- [POST `/api/v1/auth/reset-password` — Update user password](#authentication-post-api-v1-auth-reset-password)
- [GET `/api/v1/auth/me` — Get current user profile](#authentication-get-api-v1-auth-me)
- [POST `/api/v1/tenants/{tenant_id}/credit-requests` — Create Credit Request](#credits-post-api-v1-tenants-tenant_id-credit-requests)
- [GET `/api/v1/tenants/{tenant_id}/credit-requests` — List Credit Requests](#credits-get-api-v1-tenants-tenant_id-credit-requests)
- [GET `/api/v1/tenants/{tenant_id}/credit-requests/{request_id}` — Get Credit Request](#credits-get-api-v1-tenants-tenant_id-credit-requests-request_id)
- [GET `/api/v1/tenants/{tenant_id}/credit-requests/{request_id}/history` — Credit Request History](#credits-get-api-v1-tenants-tenant_id-credit-requests-request_id-history)
- [POST `/api/v1/tenants/{tenant_id}/credit-requests/{request_id}/payment-submission` — Submit Credit Payment](#credits-post-api-v1-tenants-tenant_id-credit-requests-request_id-payment-submission)
- [GET `/api/v1/admin/credit-requests` — Staff Credit Request Queue](#credits-get-api-v1-admin-credit-requests)
- [POST `/api/v1/admin/credit-requests/{request_id}/approve` — Approve Credit Request](#credits-post-api-v1-admin-credit-requests-request_id-approve)
- [POST `/api/v1/admin/credit-requests/{request_id}/reject` — Reject Credit Request](#credits-post-api-v1-admin-credit-requests-request_id-reject)
- [POST `/api/v1/admin/credit-requests/{request_id}/reject-payment` — Reject Payment Submission](#credits-post-api-v1-admin-credit-requests-request_id-reject-payment)
- [POST `/api/v1/admin/credit-requests/{request_id}/verify-payment` — Verify Credit Payment](#credits-post-api-v1-admin-credit-requests-request_id-verify-payment)
- [GET `/api/v1/tenants/{tenant_id}/credits/balance` — Credit Balance](#credits-get-api-v1-tenants-tenant_id-credits-balance)
- [GET `/api/v1/tenants/{tenant_id}/credits/ledger` — Credit Ledger](#credits-get-api-v1-tenants-tenant_id-credits-ledger)
- [GET `/api/v1/tenants/{tenant_id}/credits/usage` — Credit Usage Summary](#credits-get-api-v1-tenants-tenant_id-credits-usage)
- [GET `/api/v1/tenants/{tenant_id}/credits/usage/{usage_id}` — Credit Usage Entry](#credits-get-api-v1-tenants-tenant_id-credits-usage-usage_id)
- [POST `/api/v1/admin/tenants/{tenant_id}/credits/adjustments` — Adjust Credit Balance](#credits-post-api-v1-admin-tenants-tenant_id-credits-adjustments)
- [GET `/api/v1/tenants/{tenant_id}/contract-workspace` — Get Contract Workspace](#contract-workspace-get-api-v1-tenants-tenant_id-contract-workspace)
- [GET `/api/v1/tenants/{tenant_id}/gifts` — List Contract Gifts](#contract-workspace-get-api-v1-tenants-tenant_id-gifts)
- [POST `/api/v1/tenants/{tenant_id}/gifts` — Create Contract Gift](#contract-workspace-post-api-v1-tenants-tenant_id-gifts)
- [PATCH `/api/v1/gifts/{gift_id}` — Update Contract Gift](#contract-workspace-patch-api-v1-gifts-gift_id)
- [POST `/api/v1/gifts/{gift_id}/cancel` — Cancel Contract Gift](#contract-workspace-post-api-v1-gifts-gift_id-cancel)
- [POST `/api/v1/gifts/bulk-update` — Bulk Update Contract Gifts](#contract-workspace-post-api-v1-gifts-bulk-update)
- [GET `/api/v1/tenants/{tenant_id}/contract-workspace/export` — Export Contract Workspace](#contract-workspace-get-api-v1-tenants-tenant_id-contract-workspace-export)
- [GET `/api/v1/tenants/{tenant_id}/events` — List Tenant Events](#events-get-api-v1-tenants-tenant_id-events)
- [POST `/api/v1/tenants/{tenant_id}/events` — Create Tenant Event](#events-post-api-v1-tenants-tenant_id-events)
- [GET `/api/v1/tenants/{tenant_id}/events/{event_id}` — Get Event](#events-get-api-v1-tenants-tenant_id-events-event_id)
- [PATCH `/api/v1/tenants/{tenant_id}/events/{event_id}` — Update Event](#events-patch-api-v1-tenants-tenant_id-events-event_id)
- [DELETE `/api/v1/tenants/{tenant_id}/events/{event_id}` — Delete Event](#events-delete-api-v1-tenants-tenant_id-events-event_id)
- [GET `/api/v1/tenants/{tenant_id}/recipients/{recipient_id}/events` — List Recipient Events](#events-get-api-v1-tenants-tenant_id-recipients-recipient_id-events)
- [POST `/api/v1/tenants/{tenant_id}/recipients/{recipient_id}/events` — Create Recipient Event](#events-post-api-v1-tenants-tenant_id-recipients-recipient_id-events)
- [POST `/api/v1/tenants/{tenant_id}/gift-requests` — Create Gift Request](#gift-requests-post-api-v1-tenants-tenant_id-gift-requests)
- [GET `/api/v1/tenants/{tenant_id}/gift-requests` — List Gift Requests](#gift-requests-get-api-v1-tenants-tenant_id-gift-requests)
- [GET `/api/v1/tenants/{tenant_id}/gift-requests/{request_id}` — Get Gift Request](#gift-requests-get-api-v1-tenants-tenant_id-gift-requests-request_id)
- [PATCH `/api/v1/tenants/{tenant_id}/gift-requests/{request_id}` — Update Gift Request](#gift-requests-patch-api-v1-tenants-tenant_id-gift-requests-request_id)
- [GET `/api/v1/tenants/{tenant_id}/gift-requests/{request_id}/history` — Gift Request History](#gift-requests-get-api-v1-tenants-tenant_id-gift-requests-request_id-history)
- [POST `/api/v1/tenants/{tenant_id}/gift-requests/{request_id}/submit` — Submit Gift Request](#gift-requests-post-api-v1-tenants-tenant_id-gift-requests-request_id-submit)
- [POST `/api/v1/tenants/{tenant_id}/gift-requests/{request_id}/cancel` — Cancel Gift Request](#gift-requests-post-api-v1-tenants-tenant_id-gift-requests-request_id-cancel)
- [POST `/api/v1/tenants/{tenant_id}/gift-requests/{request_id}/approve` — Approve Gift Proposal](#gift-requests-post-api-v1-tenants-tenant_id-gift-requests-request_id-approve)
- [POST `/api/v1/tenants/{tenant_id}/gift-requests/{request_id}/request-changes` — Request Gift Proposal Changes](#gift-requests-post-api-v1-tenants-tenant_id-gift-requests-request_id-request-changes)
- [GET `/api/v1/admin/gift-requests` — Staff Gift Request Queue](#gift-requests-get-api-v1-admin-gift-requests)
- [POST `/api/v1/admin/gift-requests/{request_id}/start-review` — Start Gift Request Review](#gift-requests-post-api-v1-admin-gift-requests-request_id-start-review)
- [POST `/api/v1/admin/gift-requests/{request_id}/request-info` — Request Gift Request Information](#gift-requests-post-api-v1-admin-gift-requests-request_id-request-info)
- [PUT `/api/v1/admin/gift-requests/{request_id}/proposal` — Publish Gift Proposal](#gift-requests-put-api-v1-admin-gift-requests-request_id-proposal)
- [POST `/api/v1/admin/gift-requests/{request_id}/reject` — Reject Gift Request](#gift-requests-post-api-v1-admin-gift-requests-request_id-reject)
- [GET `/api/v1/tenants/{tenant_id}/gift-spend/groups` — List Recipient Groups](#gift-spend-management-get-api-v1-tenants-tenant_id-gift-spend-groups)
- [POST `/api/v1/tenants/{tenant_id}/gift-spend/groups` — Create Recipient Group](#gift-spend-management-post-api-v1-tenants-tenant_id-gift-spend-groups)
- [PUT `/api/v1/tenants/{tenant_id}/gift-spend/groups/{group_id}` — Update Recipient Group](#gift-spend-management-put-api-v1-tenants-tenant_id-gift-spend-groups-group_id)
- [DELETE `/api/v1/tenants/{tenant_id}/gift-spend/groups/{group_id}` — Delete Recipient Group](#gift-spend-management-delete-api-v1-tenants-tenant_id-gift-spend-groups-group_id)
- [POST `/api/v1/tenants/{tenant_id}/gift-spend/occasions/{occasion_id}/groups/import` — Import Group To Occasion](#gift-spend-management-post-api-v1-tenants-tenant_id-gift-spend-occasions-occasion_id-groups-import)
- [PUT `/api/v1/tenants/{tenant_id}/gift-spend/occasions/{occasion_id}/groups/{allocation_id}` — Update Occasion Group Budget](#gift-spend-management-put-api-v1-tenants-tenant_id-gift-spend-occasions-occasion_id-groups-allocation_id)
- [PUT `/api/v1/tenants/{tenant_id}/gift-spend/occasions/{occasion_id}/recipients/{recipient_id}/budget` — Set Occasion Recipient Budget](#gift-spend-management-put-api-v1-tenants-tenant_id-gift-spend-occasions-occasion_id-recipients-recipient_id-budget)
- [GET `/api/v1/tenants/{tenant_id}/gift-spend/occasions/{occasion_id}/summary` — Occasion Spend Summary](#gift-spend-management-get-api-v1-tenants-tenant_id-gift-spend-occasions-occasion_id-summary)
- [PUT `/api/v1/tenants/{tenant_id}/gift-spend/events/{event_id}/budget` — Set Event Budget](#gift-spend-management-put-api-v1-tenants-tenant_id-gift-spend-events-event_id-budget)
- [GET `/api/v1/tenants/{tenant_id}/gift-spend/events/{event_id}/summary` — Event Spend Summary](#gift-spend-management-get-api-v1-tenants-tenant_id-gift-spend-events-event_id-summary)
- [GET `/api/v1/tenants/{tenant_id}/gift-spend/summary` — Gift Spend Summary](#gift-spend-management-get-api-v1-tenants-tenant_id-gift-spend-summary)
- [GET `/api/v1/tenants/{tenant_id}/gift-spend/settings` — Get Gift Spend Settings](#gift-spend-management-get-api-v1-tenants-tenant_id-gift-spend-settings)
- [PUT `/api/v1/tenants/{tenant_id}/gift-spend/settings` — Update Gift Spend Settings](#gift-spend-management-put-api-v1-tenants-tenant_id-gift-spend-settings)
- [GET `/api/v1/tenants/{tenant_id}/gift-spend/notifications` — List Notifications](#gift-spend-management-get-api-v1-tenants-tenant_id-gift-spend-notifications)
- [PATCH `/api/v1/tenants/{tenant_id}/gift-spend/notifications/{notification_id}/read` — Mark Notification Read](#gift-spend-management-patch-api-v1-tenants-tenant_id-gift-spend-notifications-notification_id-read)
- [GET `/api/v1/occasions` — List All Occasions](#occasions-get-api-v1-occasions)
- [POST `/api/v1/occasions` — Create Global Occasion](#occasions-post-api-v1-occasions)
- [GET `/api/v1/occasions/{occasion_id}` — Get Any Occasion](#occasions-get-api-v1-occasions-occasion_id)
- [PATCH `/api/v1/occasions/{occasion_id}` — Update Any Occasion](#occasions-patch-api-v1-occasions-occasion_id)
- [DELETE `/api/v1/occasions/{occasion_id}` — Delete Any Occasion](#occasions-delete-api-v1-occasions-occasion_id)
- [GET `/api/v1/tenants/{tenant_id}/occasions` — List Occasions](#occasions-get-api-v1-tenants-tenant_id-occasions)
- [POST `/api/v1/tenants/{tenant_id}/occasions` — Create Occasion](#occasions-post-api-v1-tenants-tenant_id-occasions)
- [GET `/api/v1/tenants/{tenant_id}/occasions/{occasion_id}` — Get Occasion](#occasions-get-api-v1-tenants-tenant_id-occasions-occasion_id)
- [PATCH `/api/v1/tenants/{tenant_id}/occasions/{occasion_id}` — Update Occasion](#occasions-patch-api-v1-tenants-tenant_id-occasions-occasion_id)
- [DELETE `/api/v1/tenants/{tenant_id}/occasions/{occasion_id}` — Delete Occasion](#occasions-delete-api-v1-tenants-tenant_id-occasions-occasion_id)
- [GET `/api/v1/tenants/{tenant_id}/recipients` — List Recipients](#recipients-get-api-v1-tenants-tenant_id-recipients)
- [POST `/api/v1/tenants/{tenant_id}/recipients` — Create Recipient](#recipients-post-api-v1-tenants-tenant_id-recipients)
- [GET `/api/v1/tenants/{tenant_id}/recipients/{recipient_id}` — Get Recipient](#recipients-get-api-v1-tenants-tenant_id-recipients-recipient_id)
- [PATCH `/api/v1/tenants/{tenant_id}/recipients/{recipient_id}` — Update Recipient](#recipients-patch-api-v1-tenants-tenant_id-recipients-recipient_id)
- [DELETE `/api/v1/tenants/{tenant_id}/recipients/{recipient_id}` — Delete Recipient](#recipients-delete-api-v1-tenants-tenant_id-recipients-recipient_id)
- [POST `/api/v1/tenants/{tenant_id}/recipients/{recipient_id}/restore` — Restore Recipient](#recipients-post-api-v1-tenants-tenant_id-recipients-recipient_id-restore)
- [POST `/api/v1/tenants` — Create Tenant](#tenants-post-api-v1-tenants)
- [GET `/api/v1/tenants` — List Tenants](#tenants-get-api-v1-tenants)
- [GET `/api/v1/tenants/{tenant_id}` — Get Tenant](#tenants-get-api-v1-tenants-tenant_id)
- [PATCH `/api/v1/tenants/{tenant_id}` — Update Tenant](#tenants-patch-api-v1-tenants-tenant_id)
- [POST `/api/v1/tenants/{tenant_id}/activate` — Activate Tenant](#tenants-post-api-v1-tenants-tenant_id-activate)
- [POST `/api/v1/tenants/{tenant_id}/deactivate` — Deactivate Tenant](#tenants-post-api-v1-tenants-tenant_id-deactivate)
- [GET `/api/v1/admin/kams` — List Active Kams](#users-get-api-v1-admin-kams)
- [POST `/api/v1/tenants/{tenant_id}/users` — Invite User](#users-post-api-v1-tenants-tenant_id-users)
- [GET `/api/v1/tenants/{tenant_id}/users` — List Users](#users-get-api-v1-tenants-tenant_id-users)
- [GET `/api/v1/tenants/{tenant_id}/users/{user_id}` — Get User](#users-get-api-v1-tenants-tenant_id-users-user_id)
- [PATCH `/api/v1/tenants/{tenant_id}/users/{user_id}` — Update User](#users-patch-api-v1-tenants-tenant_id-users-user_id)
- [POST `/api/v1/tenants/{tenant_id}/users/{user_id}/activate` — Activate User](#users-post-api-v1-tenants-tenant_id-users-user_id-activate)
- [POST `/api/v1/tenants/{tenant_id}/users/{user_id}/deactivate` — Deactivate User](#users-post-api-v1-tenants-tenant_id-users-user_id-deactivate)
- [POST `/api/v1/tenants/{tenant_id}/users/{user_id}/resend-invite` — Resend Invitation](#users-post-api-v1-tenants-tenant_id-users-user_id-resend-invite)
- [POST `/api/v1/auth/invitations/accept` — Accept Invitation](#users-post-api-v1-auth-invitations-accept)
- [GET `/api/v1/me` — Current Profile](#shared-api-get-api-v1-me)
- [GET `/api/v1/reference-data` — Reference Data](#shared-api-get-api-v1-reference-data)

## Endpoint details

### Health — GET `/health/live` {#health-get-health-live}

Liveness check. **Authentication:** Public / no bearer token required.

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: `{ "status": "alive" }` | Successful Response |

### Health — GET `/health/ready` {#health-get-health-ready}

Readiness check. **Authentication:** Public / no bearer token required.

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: `{ "status": "ready" }` | Successful Response |

### Health — GET `/health` {#health-get-health}

System health check

**Authentication:** Public / no bearer token declared.

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: `object` | Successful Response |

### Authentication — POST `/api/v1/auth/login` {#authentication-post-api-v1-auth-login}

User login

Authenticates credentials against Supabase Auth and returns JWT access & refresh tokens.

**Authentication:** Public / no bearer token declared.

**Request body:** required.
- `application/json`: [UserLoginRequest](#userloginrequest)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [AuthResponse](#authresponse) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Authentication — POST `/api/v1/auth/refresh` {#authentication-post-api-v1-auth-refresh}

Refresh access token

Issues a new JWT access and refresh token pair using an unexpired refresh token.

**Authentication:** Public / no bearer token declared.

**Request body:** required.
- `application/json`: [RefreshTokenRequest](#refreshtokenrequest)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [TokenResponse](#tokenresponse) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Authentication — POST `/api/v1/auth/logout` {#authentication-post-api-v1-auth-logout}

User logout

Invalidates the user's current session in Supabase Auth.

**Authentication:** Required.

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [MessageResponse](#messageresponse) | Successful Response |

### Authentication — POST `/api/v1/auth/forgot-password` {#authentication-post-api-v1-auth-forgot-password}

Request password reset

Sends a password reset email if the provided email exists in Supabase Auth.

**Authentication:** Public / no bearer token declared.

**Request body:** required.
- `application/json`: [PasswordResetRequest](#passwordresetrequest)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [MessageResponse](#messageresponse) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Authentication — POST `/api/v1/auth/reset-password` {#authentication-post-api-v1-auth-reset-password}

Update user password

Updates the password for the currently authenticated user.

**Authentication:** Required.

**Request body:** required.
- `application/json`: [PasswordUpdateRequest](#passwordupdaterequest)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_dict_](#apiresponse_dict_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Authentication — GET `/api/v1/auth/me` {#authentication-get-api-v1-auth-me}

Get current user profile

Returns the profile information for the currently authenticated user extracted from the JWT and database.

**Authentication:** Required.

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [UserProfileResponse](#userprofileresponse) | Successful Response |

### Credits — POST `/api/v1/tenants/{tenant_id}/credit-requests` {#credits-post-api-v1-tenants-tenant_id-credit-requests}

Create Credit Request

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `Idempotency-Key` | header | Yes | `string` |  |

**Request body:** required.
- `application/json`: [CreditRequestCreate](#creditrequestcreate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 201 | `application/json`: [ApiResponse_CreditRequestRead_](#apiresponse_creditrequestread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Credits — GET `/api/v1/tenants/{tenant_id}/credit-requests` {#credits-get-api-v1-tenants-tenant_id-credit-requests}

List Credit Requests

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `page` | query | No | `integer` | Default: `1`. |
| `limit` | query | No | `integer` | Default: `20`. |
| `status` | query | No | `string` | `null` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_CreditRequestPage_](#apiresponse_creditrequestpage_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Credits — GET `/api/v1/tenants/{tenant_id}/credit-requests/{request_id}` {#credits-get-api-v1-tenants-tenant_id-credit-requests-request_id}

Get Credit Request

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `request_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_CreditRequestRead_](#apiresponse_creditrequestread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Credits — GET `/api/v1/tenants/{tenant_id}/credit-requests/{request_id}/history` {#credits-get-api-v1-tenants-tenant_id-credit-requests-request_id-history}

Credit Request History

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `request_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_CreditRequestHistory_](#apiresponse_creditrequesthistory_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Credits — POST `/api/v1/tenants/{tenant_id}/credit-requests/{request_id}/payment-submission` {#credits-post-api-v1-tenants-tenant_id-credit-requests-request_id-payment-submission}

Submit Credit Payment

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `request_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [PaymentSubmission](#paymentsubmission)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_CreditRequestRead_](#apiresponse_creditrequestread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Credits — GET `/api/v1/admin/credit-requests` {#credits-get-api-v1-admin-credit-requests}

Staff Credit Request Queue

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `page` | query | No | `integer` | Default: `1`. |
| `limit` | query | No | `integer` | Default: `20`. |
| `status` | query | No | `string` | `null` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_CreditRequestPage_](#apiresponse_creditrequestpage_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Credits — POST `/api/v1/admin/credit-requests/{request_id}/approve` {#credits-post-api-v1-admin-credit-requests-request_id-approve}

Approve Credit Request

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `request_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [CreditReview](#creditreview)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_CreditRequestRead_](#apiresponse_creditrequestread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Credits — POST `/api/v1/admin/credit-requests/{request_id}/reject` {#credits-post-api-v1-admin-credit-requests-request_id-reject}

Reject Credit Request

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `request_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [CreditRejection](#creditrejection)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_CreditRequestRead_](#apiresponse_creditrequestread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Credits — POST `/api/v1/admin/credit-requests/{request_id}/reject-payment` {#credits-post-api-v1-admin-credit-requests-request_id-reject-payment}

Reject Payment Submission

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `request_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [CreditRejection](#creditrejection)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_CreditRequestRead_](#apiresponse_creditrequestread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Credits — POST `/api/v1/admin/credit-requests/{request_id}/verify-payment` {#credits-post-api-v1-admin-credit-requests-request_id-verify-payment}

Verify Credit Payment

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `request_id` | path | Yes | `string (uuid)` |  |
| `Idempotency-Key` | header | Yes | `string` |  |

**Request body:** required.
- `application/json`: [PaymentVerification](#paymentverification)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_CreditMutationResult_](#apiresponse_creditmutationresult_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Credits — GET `/api/v1/tenants/{tenant_id}/credits/balance` {#credits-get-api-v1-tenants-tenant_id-credits-balance}

Credit Balance

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_CreditBalanceRead_](#apiresponse_creditbalanceread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Credits — GET `/api/v1/tenants/{tenant_id}/credits/ledger` {#credits-get-api-v1-tenants-tenant_id-credits-ledger}

Credit Ledger

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `page` | query | No | `integer` | Default: `1`. |
| `limit` | query | No | `integer` | Default: `20`. |
| `entry_type` | query | No | `string` | `null` |  |
| `from` | query | No | `string (date)` | `null` |  |
| `to` | query | No | `string (date)` | `null` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_CreditLedgerPage_](#apiresponse_creditledgerpage_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Credits — GET `/api/v1/tenants/{tenant_id}/credits/usage` {#credits-get-api-v1-tenants-tenant_id-credits-usage}

Credit Usage Summary

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `from` | query | Yes | `string (date)` |  |
| `to` | query | Yes | `string (date)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_CreditUsageSummary_](#apiresponse_creditusagesummary_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Credits — GET `/api/v1/tenants/{tenant_id}/credits/usage/{usage_id}` {#credits-get-api-v1-tenants-tenant_id-credits-usage-usage_id}

Credit Usage Entry

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `usage_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_CreditUsageRead_](#apiresponse_creditusageread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Credits — POST `/api/v1/admin/tenants/{tenant_id}/credits/adjustments` {#credits-post-api-v1-admin-tenants-tenant_id-credits-adjustments}

Adjust Credit Balance

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `Idempotency-Key` | header | Yes | `string` |  |

**Request body:** required.
- `application/json`: [CreditAdjustment](#creditadjustment)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 201 | `application/json`: [ApiResponse_CreditLedgerRead_](#apiresponse_creditledgerread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Contract Workspace — GET `/api/v1/tenants/{tenant_id}/contract-workspace` {#contract-workspace-get-api-v1-tenants-tenant_id-contract-workspace}

Get Contract Workspace

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `page` | query | No | `integer` | Default: `1`. |
| `limit` | query | No | `integer` | Default: `20`. |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_ContractWorkspaceRead_](#apiresponse_contractworkspaceread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Contract Workspace — GET `/api/v1/tenants/{tenant_id}/gifts` {#contract-workspace-get-api-v1-tenants-tenant_id-gifts}

List Contract Gifts

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `page` | query | No | `integer` | Default: `1`. |
| `limit` | query | No | `integer` | Default: `20`. |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftLinePage_](#apiresponse_giftlinepage_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Contract Workspace — POST `/api/v1/tenants/{tenant_id}/gifts` {#contract-workspace-post-api-v1-tenants-tenant_id-gifts}

Create Contract Gift

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [GiftLineCreate](#giftlinecreate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 201 | `application/json`: [ApiResponse_GiftLineRead_](#apiresponse_giftlineread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Contract Workspace — PATCH `/api/v1/gifts/{gift_id}` {#contract-workspace-patch-api-v1-gifts-gift_id}

Update Contract Gift

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `gift_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [GiftLineUpdate](#giftlineupdate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftLineRead_](#apiresponse_giftlineread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Contract Workspace — POST `/api/v1/gifts/{gift_id}/cancel` {#contract-workspace-post-api-v1-gifts-gift_id-cancel}

Cancel Contract Gift

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `gift_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [GiftLineCancel](#giftlinecancel)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftLineRead_](#apiresponse_giftlineread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Contract Workspace — POST `/api/v1/gifts/bulk-update` {#contract-workspace-post-api-v1-gifts-bulk-update}

Bulk Update Contract Gifts

**Authentication:** Required.

**Request body:** required.
- `application/json`: [GiftBulkUpdate](#giftbulkupdate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftBulkUpdateResult_](#apiresponse_giftbulkupdateresult_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Contract Workspace — GET `/api/v1/tenants/{tenant_id}/contract-workspace/export` {#contract-workspace-get-api-v1-tenants-tenant_id-contract-workspace-export}

Export Contract Workspace

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | No response body | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Events — GET `/api/v1/tenants/{tenant_id}/events` {#events-get-api-v1-tenants-tenant_id-events}

List Tenant Events

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `page` | query | No | `integer` | Default: `1`. |
| `limit` | query | No | `integer` | Default: `10`. |
| `recipient_id` | query | No | `string (uuid)` | `null` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [EventList](#eventlist) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Events — POST `/api/v1/tenants/{tenant_id}/events` {#events-post-api-v1-tenants-tenant_id-events}

Create Tenant Event

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `recipient_id` | query | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [EventCreate](#eventcreate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 201 | `application/json`: [ApiResponse_EventRead_](#apiresponse_eventread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Events — GET `/api/v1/tenants/{tenant_id}/events/{event_id}` {#events-get-api-v1-tenants-tenant_id-events-event_id}

Get Event

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `event_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_EventRead_](#apiresponse_eventread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Events — PATCH `/api/v1/tenants/{tenant_id}/events/{event_id}` {#events-patch-api-v1-tenants-tenant_id-events-event_id}

Update Event

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `event_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [EventUpdate](#eventupdate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_EventRead_](#apiresponse_eventread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Events — DELETE `/api/v1/tenants/{tenant_id}/events/{event_id}` {#events-delete-api-v1-tenants-tenant_id-events-event_id}

Delete Event

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `event_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_dict_](#apiresponse_dict_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Events — GET `/api/v1/tenants/{tenant_id}/recipients/{recipient_id}/events` {#events-get-api-v1-tenants-tenant_id-recipients-recipient_id-events}

List Recipient Events

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `recipient_id` | path | Yes | `string (uuid)` |  |
| `page` | query | No | `integer` | Default: `1`. |
| `limit` | query | No | `integer` | Default: `10`. |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [EventList](#eventlist) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Events — POST `/api/v1/tenants/{tenant_id}/recipients/{recipient_id}/events` {#events-post-api-v1-tenants-tenant_id-recipients-recipient_id-events}

Create Recipient Event

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `recipient_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [EventCreate](#eventcreate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 201 | `application/json`: [ApiResponse_EventRead_](#apiresponse_eventread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Requests — POST `/api/v1/tenants/{tenant_id}/gift-requests` {#gift-requests-post-api-v1-tenants-tenant_id-gift-requests}

Create Gift Request

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [GiftRequestCreate](#giftrequestcreate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 201 | `application/json`: [ApiResponse_GiftRequestRead_](#apiresponse_giftrequestread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Requests — GET `/api/v1/tenants/{tenant_id}/gift-requests` {#gift-requests-get-api-v1-tenants-tenant_id-gift-requests}

List Gift Requests

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `page` | query | No | `integer` | Default: `1`. |
| `limit` | query | No | `integer` | Default: `20`. |
| `status` | query | No | [GiftRequestStatus](#giftrequeststatus) | `null` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftRequestPage_](#apiresponse_giftrequestpage_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Requests — GET `/api/v1/tenants/{tenant_id}/gift-requests/{request_id}` {#gift-requests-get-api-v1-tenants-tenant_id-gift-requests-request_id}

Get Gift Request

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `request_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftRequestRead_](#apiresponse_giftrequestread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Requests — PATCH `/api/v1/tenants/{tenant_id}/gift-requests/{request_id}` {#gift-requests-patch-api-v1-tenants-tenant_id-gift-requests-request_id}

Update Gift Request

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `request_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [GiftRequestUpdate](#giftrequestupdate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftRequestRead_](#apiresponse_giftrequestread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Requests — GET `/api/v1/tenants/{tenant_id}/gift-requests/{request_id}/history` {#gift-requests-get-api-v1-tenants-tenant_id-gift-requests-request_id-history}

Gift Request History

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `request_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftRequestEventPage_](#apiresponse_giftrequesteventpage_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Requests — POST `/api/v1/tenants/{tenant_id}/gift-requests/{request_id}/submit` {#gift-requests-post-api-v1-tenants-tenant_id-gift-requests-request_id-submit}

Submit Gift Request

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `request_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftRequestRead_](#apiresponse_giftrequestread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Requests — POST `/api/v1/tenants/{tenant_id}/gift-requests/{request_id}/cancel` {#gift-requests-post-api-v1-tenants-tenant_id-gift-requests-request_id-cancel}

Cancel Gift Request

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `request_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [GiftRequestAction](#giftrequestaction)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftRequestRead_](#apiresponse_giftrequestread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Requests — POST `/api/v1/tenants/{tenant_id}/gift-requests/{request_id}/approve` {#gift-requests-post-api-v1-tenants-tenant_id-gift-requests-request_id-approve}

Approve Gift Proposal

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `request_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [GiftRequestAction](#giftrequestaction)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftRequestRead_](#apiresponse_giftrequestread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Requests — POST `/api/v1/tenants/{tenant_id}/gift-requests/{request_id}/request-changes` {#gift-requests-post-api-v1-tenants-tenant_id-gift-requests-request_id-request-changes}

Request Gift Proposal Changes

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `request_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [GiftRequestAction](#giftrequestaction)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftRequestRead_](#apiresponse_giftrequestread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Requests — GET `/api/v1/admin/gift-requests` {#gift-requests-get-api-v1-admin-gift-requests}

Staff Gift Request Queue

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `page` | query | No | `integer` | Default: `1`. |
| `limit` | query | No | `integer` | Default: `20`. |
| `status` | query | No | [GiftRequestStatus](#giftrequeststatus) | `null` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftRequestPage_](#apiresponse_giftrequestpage_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Requests — POST `/api/v1/admin/gift-requests/{request_id}/start-review` {#gift-requests-post-api-v1-admin-gift-requests-request_id-start-review}

Start Gift Request Review

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `request_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftRequestRead_](#apiresponse_giftrequestread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Requests — POST `/api/v1/admin/gift-requests/{request_id}/request-info` {#gift-requests-post-api-v1-admin-gift-requests-request_id-request-info}

Request Gift Request Information

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `request_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [GiftRequestAction](#giftrequestaction)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftRequestRead_](#apiresponse_giftrequestread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Requests — PUT `/api/v1/admin/gift-requests/{request_id}/proposal` {#gift-requests-put-api-v1-admin-gift-requests-request_id-proposal}

Publish Gift Proposal

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `request_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [GiftProposalUpdate](#giftproposalupdate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftRequestRead_](#apiresponse_giftrequestread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Requests — POST `/api/v1/admin/gift-requests/{request_id}/reject` {#gift-requests-post-api-v1-admin-gift-requests-request_id-reject}

Reject Gift Request

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `request_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [GiftRequestAction](#giftrequestaction)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftRequestRead_](#apiresponse_giftrequestread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Spend Management — GET `/api/v1/tenants/{tenant_id}/gift-spend/groups` {#gift-spend-management-get-api-v1-tenants-tenant_id-gift-spend-groups}

List Recipient Groups

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_list_RecipientGroupRead__](#apiresponse_list_recipientgroupread__) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Spend Management — POST `/api/v1/tenants/{tenant_id}/gift-spend/groups` {#gift-spend-management-post-api-v1-tenants-tenant_id-gift-spend-groups}

Create Recipient Group

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [RecipientGroupCreate](#recipientgroupcreate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 201 | `application/json`: [ApiResponse_RecipientGroupRead_](#apiresponse_recipientgroupread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Spend Management — PUT `/api/v1/tenants/{tenant_id}/gift-spend/groups/{group_id}` {#gift-spend-management-put-api-v1-tenants-tenant_id-gift-spend-groups-group_id}

Update Recipient Group

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `group_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [RecipientGroupUpdate](#recipientgroupupdate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_RecipientGroupRead_](#apiresponse_recipientgroupread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Spend Management — DELETE `/api/v1/tenants/{tenant_id}/gift-spend/groups/{group_id}` {#gift-spend-management-delete-api-v1-tenants-tenant_id-gift-spend-groups-group_id}

Delete Recipient Group

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `group_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_dict_](#apiresponse_dict_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Spend Management — POST `/api/v1/tenants/{tenant_id}/gift-spend/occasions/{occasion_id}/groups/import` {#gift-spend-management-post-api-v1-tenants-tenant_id-gift-spend-occasions-occasion_id-groups-import}

Import Group To Occasion

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `occasion_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [OccasionGroupImport](#occasiongroupimport)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 201 | `application/json`: [ApiResponse_OccasionGroupAllocationRead_](#apiresponse_occasiongroupallocationread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Spend Management — POST `/api/v1/tenants/{tenant_id}/gift-spend/occasions/{occasion_id}/groups`

Create a group inside an occasion. No budget is needed; set it later with the PUT below.

**Request body:** `{ "group_name": "Leadership", "recipient_ids": ["<uuid>", "..."] }`

**Responses:** 201 `ApiResponse<OccasionGroupAllocationRead>`; 409 name already used in the occasion or a person already belongs to another group; 404 occasion or recipient not found.

### Gift Spend Management — DELETE `/api/v1/tenants/{tenant_id}/gift-spend/occasions/{occasion_id}/groups/{allocation_id}`

Delete an occasion group and its budget. Returns 409 if any person in it already has spend.

### Gift Spend Management — DELETE `/api/v1/tenants/{tenant_id}/gift-spend/occasions/{occasion_id}/recipients/{recipient_id}/budget`

Remove a person added directly to an occasion (not through a group) when they have no spend.

### Gift Spend Management — PUT `/api/v1/tenants/{tenant_id}/gift-spend/occasions/{occasion_id}/groups/{allocation_id}` {#gift-spend-management-put-api-v1-tenants-tenant_id-gift-spend-occasions-occasion_id-groups-allocation_id}

Update an occasion group. Send only what changes: `group_name`, `recipient_ids`, `budget_mode`, `budget_credits` (camelCase names also accepted).

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `occasion_id` | path | Yes | `string (uuid)` |  |
| `allocation_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: `OccasionGroupUpdate` — `{ "group_name"?: string, "recipient_ids"?: uuid[], "budget_mode"?: "PER_RECIPIENT"|"SHARED_POOL", "budget_credits"?: int > 0 }`

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_OccasionGroupAllocationRead_](#apiresponse_occasiongroupallocationread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Spend Management — PUT `/api/v1/tenants/{tenant_id}/gift-spend/occasions/{occasion_id}/recipients/{recipient_id}/budget` {#gift-spend-management-put-api-v1-tenants-tenant_id-gift-spend-occasions-occasion_id-recipients-recipient_id-budget}

Set Occasion Recipient Budget

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `occasion_id` | path | Yes | `string (uuid)` |  |
| `recipient_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [RecipientOccasionBudgetUpdate](#recipientoccasionbudgetupdate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_dict_](#apiresponse_dict_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Spend Management — GET `/api/v1/tenants/{tenant_id}/gift-spend/occasions/{occasion_id}/summary` {#gift-spend-management-get-api-v1-tenants-tenant_id-gift-spend-occasions-occasion_id-summary}

Occasion Spend Summary

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `occasion_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_OccasionSpendSummary_](#apiresponse_occasionspendsummary_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Spend Management — PUT `/api/v1/tenants/{tenant_id}/gift-spend/events/{event_id}/budget` {#gift-spend-management-put-api-v1-tenants-tenant_id-gift-spend-events-event_id-budget}

Set Event Budget

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `event_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [EventBudgetUpdate](#eventbudgetupdate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_dict_](#apiresponse_dict_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Spend Management — GET `/api/v1/tenants/{tenant_id}/gift-spend/events/{event_id}/summary` {#gift-spend-management-get-api-v1-tenants-tenant_id-gift-spend-events-event_id-summary}

Event Spend Summary

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `event_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_EventSpendSummary_](#apiresponse_eventspendsummary_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Spend Management — GET `/api/v1/tenants/{tenant_id}/gift-spend/summary` {#gift-spend-management-get-api-v1-tenants-tenant_id-gift-spend-summary}

Gift Spend Summary

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_SpendSummary_](#apiresponse_spendsummary_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Spend Management — GET `/api/v1/tenants/{tenant_id}/gift-spend/settings` {#gift-spend-management-get-api-v1-tenants-tenant_id-gift-spend-settings}

Get Gift Spend Settings

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftSpendSettingsRead_](#apiresponse_giftspendsettingsread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Spend Management — PUT `/api/v1/tenants/{tenant_id}/gift-spend/settings` {#gift-spend-management-put-api-v1-tenants-tenant_id-gift-spend-settings}

Update Gift Spend Settings

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [GiftSpendSettingsUpdate](#giftspendsettingsupdate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftSpendSettingsRead_](#apiresponse_giftspendsettingsread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Spend Management — GET `/api/v1/tenants/{tenant_id}/gift-spend/notifications` {#gift-spend-management-get-api-v1-tenants-tenant_id-gift-spend-notifications}

List Notifications

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `page` | query | No | `integer` | Default: `1`. |
| `limit` | query | No | `integer` | Default: `20`. |
| `unreadOnly` | query | No | `boolean` | Default: `False`. |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftSpendNotificationPage_](#apiresponse_giftspendnotificationpage_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Gift Spend Management — PATCH `/api/v1/tenants/{tenant_id}/gift-spend/notifications/{notification_id}/read` {#gift-spend-management-patch-api-v1-tenants-tenant_id-gift-spend-notifications-notification_id-read}

Mark Notification Read

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `notification_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_GiftSpendNotificationRead_](#apiresponse_giftspendnotificationread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Occasions — GET `/api/v1/occasions` {#occasions-get-api-v1-occasions}

List All Occasions

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `page` | query | No | `integer` | Default: `1`. |
| `limit` | query | No | `integer` | Default: `10`. |
| `activeOnly` | query | No | `boolean` | Default: `False`. |
| `tenantId` | query | No | `string (uuid)` | `null` | Limits results to this tenant plus global occasions. Unknown tenant: `404`. |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [OccasionList](#occasionlist) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Occasions — POST `/api/v1/occasions` {#occasions-post-api-v1-occasions}

Create Global Occasion

**Authentication:** Required.

**Request body:** required.
- `application/json`: [OccasionCreate](#occasioncreate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 201 | `application/json`: [ApiResponse_OccasionRead_](#apiresponse_occasionread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Occasions — GET `/api/v1/occasions/{occasion_id}` {#occasions-get-api-v1-occasions-occasion_id}

Get Any Occasion

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `occasion_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [OccasionRead](#occasionread) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Occasions — PATCH `/api/v1/occasions/{occasion_id}` {#occasions-patch-api-v1-occasions-occasion_id}

Update Any Occasion

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `occasion_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [OccasionUpdate](#occasionupdate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_OccasionRead_](#apiresponse_occasionread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Occasions — DELETE `/api/v1/occasions/{occasion_id}` {#occasions-delete-api-v1-occasions-occasion_id}

Delete Any Occasion

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `occasion_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_dict_](#apiresponse_dict_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Occasions — GET `/api/v1/tenants/{tenant_id}/occasions` {#occasions-get-api-v1-tenants-tenant_id-occasions}

List Occasions

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `page` | query | No | `integer` | Default: `1`. |
| `limit` | query | No | `integer` | Default: `10`. |
| `activeOnly` | query | No | `boolean` | Default: `False`. |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [OccasionList](#occasionlist) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Occasions — POST `/api/v1/tenants/{tenant_id}/occasions` {#occasions-post-api-v1-tenants-tenant_id-occasions}

Create Occasion

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [OccasionCreate](#occasioncreate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 201 | `application/json`: [ApiResponse_OccasionRead_](#apiresponse_occasionread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Occasions — GET `/api/v1/tenants/{tenant_id}/occasions/{occasion_id}` {#occasions-get-api-v1-tenants-tenant_id-occasions-occasion_id}

Get Occasion

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `occasion_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [OccasionRead](#occasionread) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Occasions — PATCH `/api/v1/tenants/{tenant_id}/occasions/{occasion_id}` {#occasions-patch-api-v1-tenants-tenant_id-occasions-occasion_id}

Update Occasion

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `occasion_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [OccasionUpdate](#occasionupdate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_OccasionRead_](#apiresponse_occasionread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Occasions — DELETE `/api/v1/tenants/{tenant_id}/occasions/{occasion_id}` {#occasions-delete-api-v1-tenants-tenant_id-occasions-occasion_id}

Delete Occasion

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `occasion_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_dict_](#apiresponse_dict_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Recipients — GET `/api/v1/tenants/{tenant_id}/recipients` {#recipients-get-api-v1-tenants-tenant_id-recipients}

List Recipients

List recipients visible to a user in the requested tenant.

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `page` | query | No | `integer` | Default: `1`. |
| `limit` | query | No | `integer` | Default: `10`. |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [RecipientList](#recipientlist) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Recipients — POST `/api/v1/tenants/{tenant_id}/recipients` {#recipients-post-api-v1-tenants-tenant_id-recipients}

Create Recipient

Create a recipient under the authorized tenant.

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [RecipientCreate](#recipientcreate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 201 | `application/json`: [ApiResponse_RecipientRead_](#apiresponse_recipientread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Recipients — GET `/api/v1/tenants/{tenant_id}/recipients/{recipient_id}` {#recipients-get-api-v1-tenants-tenant_id-recipients-recipient_id}

Get Recipient

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `recipient_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [RecipientRead](#recipientread) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Recipients — PATCH `/api/v1/tenants/{tenant_id}/recipients/{recipient_id}` {#recipients-patch-api-v1-tenants-tenant_id-recipients-recipient_id}

Update Recipient

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `recipient_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [RecipientUpdate](#recipientupdate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_RecipientRead_](#apiresponse_recipientread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Recipients — DELETE `/api/v1/tenants/{tenant_id}/recipients/{recipient_id}` {#recipients-delete-api-v1-tenants-tenant_id-recipients-recipient_id}

Delete Recipient

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `recipient_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_dict_](#apiresponse_dict_) | Successful Response |
| 401 | No response body | Missing or invalid bearer token. |
| 403 | No response body | The user does not have permission to delete recipients. |
| 404 | No response body | Recipient not found in this tenant. |
| 500 | No response body | Unexpected server error. Include the X-Request-Id when reporting it. |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Recipients — POST `/api/v1/tenants/{tenant_id}/recipients/{recipient_id}/restore` {#recipients-post-api-v1-tenants-tenant_id-recipients-recipient_id-restore}

Restore Recipient

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `recipient_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_RecipientRead_](#apiresponse_recipientread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Tenants — POST `/api/v1/tenants` {#tenants-post-api-v1-tenants}

Create Tenant

Create a tenant before inviting its users.

**Authentication:** Required.

**Request body:** required.
- `application/json`: [TenantCreate](#tenantcreate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 201 | `application/json`: [ApiResponse_TenantRead_](#apiresponse_tenantread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Tenants — GET `/api/v1/tenants` {#tenants-get-api-v1-tenants}

List Tenants

List only tenants available to the authenticated role and assignment scope.

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `page` | query | No | `integer` | Default: `1`. |
| `limit` | query | No | `integer` | Default: `10`. |
| `search` | query | No | `string` | `null` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [TenantList](#tenantlist) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Tenants — GET `/api/v1/tenants/{tenant_id}` {#tenants-get-api-v1-tenants-tenant_id}

Get Tenant

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [TenantRead](#tenantread) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Tenants — PATCH `/api/v1/tenants/{tenant_id}` {#tenants-patch-api-v1-tenants-tenant_id}

Update Tenant

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [TenantUpdate](#tenantupdate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_TenantRead_](#apiresponse_tenantread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Tenants — POST `/api/v1/tenants/{tenant_id}/activate` {#tenants-post-api-v1-tenants-tenant_id-activate}

Activate Tenant

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_TenantRead_](#apiresponse_tenantread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Tenants — POST `/api/v1/tenants/{tenant_id}/deactivate` {#tenants-post-api-v1-tenants-tenant_id-deactivate}

Deactivate Tenant

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_TenantRead_](#apiresponse_tenantread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Users — GET `/api/v1/admin/kams` {#users-get-api-v1-admin-kams}

List Active Kams

List active KAM accounts and their UUIDs for client provisioning.

**Authentication:** Required.

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: array of [KamOption](#kamoption) | Successful Response |

### Users — POST `/api/v1/tenants/{tenant_id}/users` {#users-post-api-v1-tenants-tenant_id-users}

Invite User

Invite a user to one tenant; the path tenant ID is authoritative.

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [UserInviteCreate](#userinvitecreate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 202 | `application/json`: [ApiResponse_UserInviteRead_](#apiresponse_userinviteread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Users — GET `/api/v1/tenants/{tenant_id}/users` {#users-get-api-v1-tenants-tenant_id-users}

List Users

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `page` | query | No | `integer` | Default: `1`. |
| `limit` | query | No | `integer` | Default: `10`. |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [UserList](#userlist) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Users — GET `/api/v1/tenants/{tenant_id}/users/{user_id}` {#users-get-api-v1-tenants-tenant_id-users-user_id}

Get User

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `user_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [UserRead](#userread) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Users — PATCH `/api/v1/tenants/{tenant_id}/users/{user_id}` {#users-patch-api-v1-tenants-tenant_id-users-user_id}

Update User

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `user_id` | path | Yes | `string (uuid)` |  |

**Request body:** required.
- `application/json`: [UserUpdate](#userupdate)

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_UserRead_](#apiresponse_userread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Users — POST `/api/v1/tenants/{tenant_id}/users/{user_id}/activate` {#users-post-api-v1-tenants-tenant_id-users-user_id-activate}

Activate User

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `user_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_dict_](#apiresponse_dict_) | Successful Response |
| 401 | No response body | Missing or invalid bearer token. |
| 403 | No response body | The user does not have permission to activate users. |
| 404 | No response body | User is not a member of this tenant. |
| 409 | No response body | The user could not be activated. |
| 500 | No response body | Unexpected server error. Include the X-Request-Id when reporting it. |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Users — POST `/api/v1/tenants/{tenant_id}/users/{user_id}/deactivate` {#users-post-api-v1-tenants-tenant_id-users-user_id-deactivate}

Deactivate User

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `user_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_dict_](#apiresponse_dict_) | Successful Response |
| 401 | No response body | Missing or invalid bearer token. |
| 403 | No response body | The user does not have permission to deactivate users. |
| 404 | No response body | User is not a member of this tenant. |
| 409 | No response body | The membership could not be deactivated. |
| 500 | No response body | Unexpected server error. Include the X-Request-Id when reporting it. |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Users — POST `/api/v1/tenants/{tenant_id}/users/{user_id}/resend-invite` {#users-post-api-v1-tenants-tenant_id-users-user_id-resend-invite}

Resend Invitation

**Authentication:** Required.

**Parameters**

| Name | In | Required | Type / schema | Notes |
|---|---|---:|---|---|
| `tenant_id` | path | Yes | `string (uuid)` |  |
| `user_id` | path | Yes | `string (uuid)` |  |

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_UserInviteRead_](#apiresponse_userinviteread_) | Successful Response |
| 422 | `application/json`: [HTTPValidationError](#httpvalidationerror) | Validation Error |

### Users — POST `/api/v1/auth/invitations/accept` {#users-post-api-v1-auth-invitations-accept}

Accept Invitation

Activate the invitation for the user identified by the verified bearer token.

**Authentication:** Required.

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [ApiResponse_UserRead_](#apiresponse_userread_) | Successful Response |

### Shared API — GET `/api/v1/me` {#shared-api-get-api-v1-me}

Current Profile

Return the authenticated profile and resolved tenant context.

**Authentication:** Required.

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: [UserProfileResponse](#userprofileresponse) | Successful Response |

### Shared API — GET `/api/v1/reference-data` {#shared-api-get-api-v1-reference-data}

Reference Data

Return the Phase 1 enums used by client forms.

**Authentication:** Required.

**Responses**

| Status | Schema | Description |
|---|---|---|
| 200 | `application/json`: `object` | Successful Response |

## Reusable schemas

All schema property names below use the public JSON field names (camelCase unless explicitly aliased). Required fields are listed by OpenAPI. Constraints such as length, numeric bounds, patterns, defaults, and enum values are included in the schema JSON.

### ApiResponse_AuthResponse_ {#apiresponse_authresponse_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/AuthResponse"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[AuthResponse]"
}
```

### ApiResponse_ContractWorkspaceRead_ {#apiresponse_contractworkspaceread_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/ContractWorkspaceRead"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[ContractWorkspaceRead]"
}
```

### ApiResponse_CreditBalanceRead_ {#apiresponse_creditbalanceread_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/CreditBalanceRead"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[CreditBalanceRead]"
}
```

### ApiResponse_CreditLedgerPage_ {#apiresponse_creditledgerpage_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/CreditLedgerPage"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[CreditLedgerPage]"
}
```

### ApiResponse_CreditLedgerRead_ {#apiresponse_creditledgerread_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/CreditLedgerRead"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[CreditLedgerRead]"
}
```

### ApiResponse_CreditMutationResult_ {#apiresponse_creditmutationresult_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/CreditMutationResult"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[CreditMutationResult]"
}
```

### ApiResponse_CreditRequestHistory_ {#apiresponse_creditrequesthistory_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/CreditRequestHistory"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[CreditRequestHistory]"
}
```

### ApiResponse_CreditRequestPage_ {#apiresponse_creditrequestpage_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/CreditRequestPage"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[CreditRequestPage]"
}
```

### ApiResponse_CreditRequestRead_ {#apiresponse_creditrequestread_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/CreditRequestRead"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[CreditRequestRead]"
}
```

### ApiResponse_CreditUsageRead_ {#apiresponse_creditusageread_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/CreditUsageRead"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[CreditUsageRead]"
}
```

### ApiResponse_CreditUsageSummary_ {#apiresponse_creditusagesummary_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/CreditUsageSummary"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[CreditUsageSummary]"
}
```

### ApiResponse_EventRead_ {#apiresponse_eventread_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/EventRead"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[EventRead]"
}
```

### ApiResponse_EventSpendSummary_ {#apiresponse_eventspendsummary_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/EventSpendSummary"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[EventSpendSummary]"
}
```

### ApiResponse_GiftBulkUpdateResult_ {#apiresponse_giftbulkupdateresult_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/GiftBulkUpdateResult"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[GiftBulkUpdateResult]"
}
```

### ApiResponse_GiftLinePage_ {#apiresponse_giftlinepage_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/GiftLinePage"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[GiftLinePage]"
}
```

### ApiResponse_GiftLineRead_ {#apiresponse_giftlineread_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/GiftLineRead"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[GiftLineRead]"
}
```

### ApiResponse_GiftRequestEventPage_ {#apiresponse_giftrequesteventpage_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/GiftRequestEventPage"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[GiftRequestEventPage]"
}
```

### ApiResponse_GiftRequestPage_ {#apiresponse_giftrequestpage_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/GiftRequestPage"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[GiftRequestPage]"
}
```

### ApiResponse_GiftRequestRead_ {#apiresponse_giftrequestread_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/GiftRequestRead"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[GiftRequestRead]"
}
```

### ApiResponse_GiftSpendNotificationPage_ {#apiresponse_giftspendnotificationpage_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/GiftSpendNotificationPage"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[GiftSpendNotificationPage]"
}
```

### ApiResponse_GiftSpendNotificationRead_ {#apiresponse_giftspendnotificationread_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/GiftSpendNotificationRead"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[GiftSpendNotificationRead]"
}
```

### ApiResponse_GiftSpendSettingsRead_ {#apiresponse_giftspendsettingsread_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/GiftSpendSettingsRead"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[GiftSpendSettingsRead]"
}
```

### ApiResponse_OccasionGroupAllocationRead_ {#apiresponse_occasiongroupallocationread_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/OccasionGroupAllocationRead"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[OccasionGroupAllocationRead]"
}
```

### ApiResponse_OccasionRead_ {#apiresponse_occasionread_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/OccasionRead"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[OccasionRead]"
}
```

### ApiResponse_OccasionSpendSummary_ {#apiresponse_occasionspendsummary_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/OccasionSpendSummary"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[OccasionSpendSummary]"
}
```

### ApiResponse_RecipientGroupRead_ {#apiresponse_recipientgroupread_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/RecipientGroupRead"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[RecipientGroupRead]"
}
```

### ApiResponse_RecipientRead_ {#apiresponse_recipientread_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/RecipientRead"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[RecipientRead]"
}
```

### ApiResponse_SpendSummary_ {#apiresponse_spendsummary_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/SpendSummary"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[SpendSummary]"
}
```

### ApiResponse_TenantRead_ {#apiresponse_tenantread_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/TenantRead"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[TenantRead]"
}
```

### ApiResponse_UserInviteRead_ {#apiresponse_userinviteread_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/UserInviteRead"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[UserInviteRead]"
}
```

### ApiResponse_UserRead_ {#apiresponse_userread_}

```json
{
  "properties": {
    "data": {
      "$ref": "#/components/schemas/UserRead"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[UserRead]"
}
```

### ApiResponse_dict_ {#apiresponse_dict_}

```json
{
  "properties": {
    "data": {
      "additionalProperties": true,
      "type": "object",
      "title": "Data"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[dict]"
}
```

### ApiResponse_list_RecipientGroupRead__ {#apiresponse_list_recipientgroupread__}

```json
{
  "properties": {
    "data": {
      "items": {
        "$ref": "#/components/schemas/RecipientGroupRead"
      },
      "type": "array",
      "title": "Data"
    },
    "message": {
      "type": "string",
      "title": "Message"
    }
  },
  "type": "object",
  "required": [
    "data",
    "message"
  ],
  "title": "ApiResponse[list[RecipientGroupRead]]"
}
```

### AuthResponse {#authresponse}

```json
{
  "properties": {
    "user": {
      "$ref": "#/components/schemas/UserProfileResponse",
      "description": "User profile details"
    },
    "session": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/TokenResponse"
        },
        {
          "type": "null"
        }
      ],
      "description": "Session authentication tokens"
    },
    "message": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Message",
      "description": "Informational message"
    }
  },
  "type": "object",
  "required": [
    "user"
  ],
  "title": "AuthResponse"
}
```

### ContractGiftStatus {#contractgiftstatus}

```json
{
  "type": "string",
  "enum": [
    "PLANNED",
    "IN_PREPARATION",
    "DISPATCHED",
    "IN_TRANSIT",
    "DELIVERED",
    "ISSUE_REPORTED",
    "CANCELLED"
  ],
  "title": "ContractGiftStatus"
}
```

### ContractParameters {#contractparameters}

```json
{
  "properties": {
    "id": {
      "type": "string",
      "title": "Id"
    },
    "contractNumber": {
      "type": "string",
      "title": "Contractnumber"
    },
    "status": {
      "type": "string",
      "title": "Status"
    },
    "slaTier": {
      "type": "string",
      "title": "Slatier"
    },
    "startDate": {
      "type": "string",
      "format": "date",
      "title": "Startdate"
    },
    "endDate": {
      "type": "string",
      "format": "date",
      "title": "Enddate"
    },
    "currency": {
      "type": "string",
      "title": "Currency"
    },
    "contractValue": {
      "type": "string",
      "title": "Contractvalue"
    }
  },
  "type": "object",
  "required": [
    "id",
    "contractNumber",
    "status",
    "slaTier",
    "startDate",
    "endDate",
    "currency",
    "contractValue"
  ],
  "title": "ContractParameters"
}
```

### ContractSpend {#contractspend}

```json
{
  "properties": {
    "committed": {
      "type": "string",
      "title": "Committed"
    },
    "delivered": {
      "type": "string",
      "title": "Delivered"
    },
    "contractValue": {
      "type": "string",
      "title": "Contractvalue"
    },
    "usedPercent": {
      "type": "string",
      "title": "Usedpercent"
    },
    "budgetAlert": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Budgetalert"
    }
  },
  "type": "object",
  "required": [
    "committed",
    "delivered",
    "contractValue",
    "usedPercent"
  ],
  "title": "ContractSpend"
}
```

### ContractTierBudget {#contracttierbudget}

```json
{
  "properties": {
    "tierKey": {
      "type": "string",
      "title": "Tierkey"
    },
    "budgetAmount": {
      "type": "string",
      "title": "Budgetamount"
    },
    "perGiftLimit": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Pergiftlimit"
    }
  },
  "type": "object",
  "required": [
    "tierKey",
    "budgetAmount"
  ],
  "title": "ContractTierBudget"
}
```

### ContractWorkspaceRead {#contractworkspaceread}

```json
{
  "properties": {
    "tenantId": {
      "type": "string",
      "title": "Tenantid"
    },
    "contract": {
      "$ref": "#/components/schemas/ContractParameters"
    },
    "tierBudgets": {
      "items": {
        "$ref": "#/components/schemas/ContractTierBudget"
      },
      "type": "array",
      "title": "Tierbudgets"
    },
    "giftPlan": {
      "$ref": "#/components/schemas/GiftLinePage"
    },
    "spend": {
      "$ref": "#/components/schemas/ContractSpend"
    }
  },
  "type": "object",
  "required": [
    "tenantId",
    "contract",
    "tierBudgets",
    "giftPlan",
    "spend"
  ],
  "title": "ContractWorkspaceRead"
}
```

### CreditAdjustment {#creditadjustment}

```json
{
  "properties": {
    "direction": {
      "type": "string",
      "enum": [
        "credit",
        "debit"
      ],
      "title": "Direction"
    },
    "credits": {
      "type": "integer",
      "maximum": 1000000000.0,
      "exclusiveMinimum": 0.0,
      "title": "Credits"
    },
    "reason": {
      "type": "string",
      "maxLength": 1000,
      "minLength": 1,
      "title": "Reason"
    },
    "reference": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 150
        },
        {
          "type": "null"
        }
      ],
      "title": "Reference"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "direction",
    "credits",
    "reason"
  ],
  "title": "CreditAdjustment"
}
```

### CreditBalanceRead {#creditbalanceread}

```json
{
  "properties": {
    "tenantId": {
      "type": "string",
      "title": "Tenantid"
    },
    "availableCredits": {
      "type": "integer",
      "title": "Availablecredits"
    },
    "currency": {
      "type": "string",
      "title": "Currency"
    },
    "asOf": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Asof"
    }
  },
  "type": "object",
  "required": [
    "tenantId",
    "availableCredits",
    "currency",
    "asOf"
  ],
  "title": "CreditBalanceRead"
}
```

### CreditLedgerPage {#creditledgerpage}

```json
{
  "properties": {
    "items": {
      "items": {
        "$ref": "#/components/schemas/CreditLedgerRead"
      },
      "type": "array",
      "title": "Items"
    },
    "pagination": {
      "$ref": "#/components/schemas/PaginationMeta"
    },
    "nextCursor": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Nextcursor"
    }
  },
  "type": "object",
  "required": [
    "items",
    "pagination"
  ],
  "title": "CreditLedgerPage"
}
```

### CreditLedgerRead {#creditledgerread}

```json
{
  "properties": {
    "id": {
      "type": "string",
      "title": "Id"
    },
    "tenantId": {
      "type": "string",
      "title": "Tenantid"
    },
    "entryType": {
      "type": "string",
      "title": "Entrytype"
    },
    "creditsDelta": {
      "type": "integer",
      "title": "Creditsdelta"
    },
    "balanceAfter": {
      "type": "integer",
      "title": "Balanceafter"
    },
    "sourceType": {
      "type": "string",
      "title": "Sourcetype"
    },
    "sourceId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Sourceid"
    },
    "paymentReference": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Paymentreference"
    },
    "description": {
      "type": "string",
      "title": "Description"
    },
    "reason": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Reason"
    },
    "reference": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Reference"
    },
    "createdByUserId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Createdbyuserid"
    },
    "createdAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Createdat"
    }
  },
  "type": "object",
  "required": [
    "id",
    "tenantId",
    "entryType",
    "creditsDelta",
    "balanceAfter",
    "sourceType",
    "description",
    "createdAt"
  ],
  "title": "CreditLedgerRead"
}
```

### CreditMutationResult {#creditmutationresult}

```json
{
  "properties": {
    "request": {
      "$ref": "#/components/schemas/CreditRequestRead"
    },
    "ledgerEntry": {
      "$ref": "#/components/schemas/CreditLedgerRead"
    }
  },
  "type": "object",
  "required": [
    "request",
    "ledgerEntry"
  ],
  "title": "CreditMutationResult"
}
```

### CreditRejection {#creditrejection}

```json
{
  "properties": {
    "reason": {
      "type": "string",
      "maxLength": 1000,
      "minLength": 1,
      "title": "Reason"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "reason"
  ],
  "title": "CreditRejection"
}
```

### CreditRequestCreate {#creditrequestcreate}

```json
{
  "properties": {
    "requestedCredits": {
      "type": "integer",
      "maximum": 1000000000.0,
      "exclusiveMinimum": 0.0,
      "title": "Requestedcredits"
    },
    "note": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 1000
        },
        {
          "type": "null"
        }
      ],
      "title": "Note"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "requestedCredits"
  ],
  "title": "CreditRequestCreate"
}
```

### CreditRequestEventRead {#creditrequesteventread}

```json
{
  "properties": {
    "id": {
      "type": "string",
      "title": "Id"
    },
    "requestId": {
      "type": "string",
      "title": "Requestid"
    },
    "fromStatus": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Fromstatus"
    },
    "toStatus": {
      "type": "string",
      "title": "Tostatus"
    },
    "actorUserId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Actoruserid"
    },
    "note": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Note"
    },
    "createdAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Createdat"
    }
  },
  "type": "object",
  "required": [
    "id",
    "requestId",
    "toStatus",
    "createdAt"
  ],
  "title": "CreditRequestEventRead"
}
```

### CreditRequestHistory {#creditrequesthistory}

```json
{
  "properties": {
    "items": {
      "items": {
        "$ref": "#/components/schemas/CreditRequestEventRead"
      },
      "type": "array",
      "title": "Items"
    }
  },
  "type": "object",
  "required": [
    "items"
  ],
  "title": "CreditRequestHistory"
}
```

### CreditRequestPage {#creditrequestpage}

```json
{
  "properties": {
    "items": {
      "items": {
        "$ref": "#/components/schemas/CreditRequestRead"
      },
      "type": "array",
      "title": "Items"
    },
    "pagination": {
      "$ref": "#/components/schemas/PaginationMeta"
    },
    "nextCursor": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Nextcursor"
    }
  },
  "type": "object",
  "required": [
    "items",
    "pagination"
  ],
  "title": "CreditRequestPage"
}
```

### CreditRequestRead {#creditrequestread}

```json
{
  "properties": {
    "id": {
      "type": "string",
      "title": "Id"
    },
    "tenantId": {
      "type": "string",
      "title": "Tenantid"
    },
    "requestedCredits": {
      "type": "integer",
      "title": "Requestedcredits"
    },
    "currency": {
      "type": "string",
      "title": "Currency"
    },
    "unitPriceMinor": {
      "type": "integer",
      "title": "Unitpriceminor"
    },
    "amountDueMinor": {
      "type": "integer",
      "title": "Amountdueminor"
    },
    "status": {
      "type": "string",
      "title": "Status"
    },
    "note": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Note"
    },
    "createdByUserId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Createdbyuserid"
    },
    "reviewedByUserId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Reviewedbyuserid"
    },
    "reviewNote": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Reviewnote"
    },
    "paymentReference": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Paymentreference"
    },
    "paymentProofFileId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Paymentprooffileid"
    },
    "paidAmountMinor": {
      "anyOf": [
        {
          "type": "integer"
        },
        {
          "type": "null"
        }
      ],
      "title": "Paidamountminor"
    },
    "verificationNote": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Verificationnote"
    },
    "verifiedByUserId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Verifiedbyuserid"
    },
    "ledgerEntryId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Ledgerentryid"
    },
    "createdAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Createdat"
    },
    "updatedAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Updatedat"
    }
  },
  "type": "object",
  "required": [
    "id",
    "tenantId",
    "requestedCredits",
    "currency",
    "unitPriceMinor",
    "amountDueMinor",
    "status",
    "createdAt",
    "updatedAt"
  ],
  "title": "CreditRequestRead"
}
```

### CreditReview {#creditreview}

```json
{
  "properties": {
    "reviewNote": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 1000
        },
        {
          "type": "null"
        }
      ],
      "title": "Reviewnote"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "title": "CreditReview"
}
```

### CreditUsageGroup {#creditusagegroup}

```json
{
  "properties": {
    "sourceType": {
      "type": "string",
      "title": "Sourcetype"
    },
    "creditsUsed": {
      "type": "integer",
      "title": "Creditsused"
    },
    "entryCount": {
      "type": "integer",
      "title": "Entrycount"
    }
  },
  "type": "object",
  "required": [
    "sourceType",
    "creditsUsed",
    "entryCount"
  ],
  "title": "CreditUsageGroup"
}
```

### CreditUsageRead {#creditusageread}

```json
{
  "properties": {
    "id": {
      "type": "string",
      "title": "Id"
    },
    "tenantId": {
      "type": "string",
      "title": "Tenantid"
    },
    "creditsUsed": {
      "type": "integer",
      "title": "Creditsused"
    },
    "balanceAfter": {
      "type": "integer",
      "title": "Balanceafter"
    },
    "sourceType": {
      "type": "string",
      "title": "Sourcetype"
    },
    "sourceId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Sourceid"
    },
    "description": {
      "type": "string",
      "title": "Description"
    },
    "createdAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Createdat"
    }
  },
  "type": "object",
  "required": [
    "id",
    "tenantId",
    "creditsUsed",
    "balanceAfter",
    "sourceType",
    "description",
    "createdAt"
  ],
  "title": "CreditUsageRead"
}
```

### CreditUsageSummary {#creditusagesummary}

```json
{
  "properties": {
    "tenantId": {
      "type": "string",
      "title": "Tenantid"
    },
    "fromDate": {
      "type": "string",
      "format": "date",
      "title": "Fromdate"
    },
    "toDate": {
      "type": "string",
      "format": "date",
      "title": "Todate"
    },
    "totalCreditsUsed": {
      "type": "integer",
      "title": "Totalcreditsused"
    },
    "groups": {
      "items": {
        "$ref": "#/components/schemas/CreditUsageGroup"
      },
      "type": "array",
      "title": "Groups"
    }
  },
  "type": "object",
  "required": [
    "tenantId",
    "fromDate",
    "toDate",
    "totalCreditsUsed",
    "groups"
  ],
  "title": "CreditUsageSummary"
}
```

### EventBudgetUpdate {#eventbudgetupdate}

```json
{
  "properties": {
    "budgetCredits": {
      "type": "integer",
      "maximum": 1000000000.0,
      "exclusiveMinimum": 0.0,
      "title": "Budgetcredits"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "budgetCredits"
  ],
  "title": "EventBudgetUpdate"
}
```

### EventCreate {#eventcreate}

```json
{
  "properties": {
    "eventName": {
      "type": "string",
      "maxLength": 150,
      "minLength": 1,
      "title": "Eventname"
    },
    "eventDate": {
      "type": "string",
      "format": "date",
      "title": "Eventdate"
    },
    "description": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 2000
        },
        {
          "type": "null"
        }
      ],
      "title": "Description"
    },
    "isActive": {
      "type": "boolean",
      "title": "Isactive",
      "default": true
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "eventName",
    "eventDate"
  ],
  "title": "EventCreate"
}
```

### EventList {#eventlist}

```json
{
  "properties": {
    "items": {
      "items": {
        "$ref": "#/components/schemas/EventRead"
      },
      "type": "array",
      "title": "Items"
    },
    "pagination": {
      "$ref": "#/components/schemas/PaginationMeta"
    },
    "nextCursor": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Nextcursor"
    }
  },
  "type": "object",
  "required": [
    "items",
    "pagination"
  ],
  "title": "EventList"
}
```

### EventRead {#eventread}

```json
{
  "properties": {
    "id": {
      "type": "string",
      "title": "Id"
    },
    "tenantId": {
      "type": "string",
      "title": "Tenantid"
    },
    "recipientId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Recipientid"
    },
    "eventName": {
      "type": "string",
      "title": "Eventname"
    },
    "eventDate": {
      "type": "string",
      "format": "date",
      "title": "Eventdate"
    },
    "description": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Description"
    },
    "isActive": {
      "type": "boolean",
      "title": "Isactive"
    },
    "createdByUserId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Createdbyuserid"
    },
    "createdAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Createdat"
    },
    "updatedAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Updatedat"
    }
  },
  "type": "object",
  "required": [
    "id",
    "tenantId",
    "eventName",
    "eventDate",
    "isActive",
    "createdAt",
    "updatedAt"
  ],
  "title": "EventRead"
}
```

### EventSpendSummary {#eventspendsummary}

```json
{
  "properties": {
    "eventId": {
      "type": "string",
      "title": "Eventid"
    },
    "eventName": {
      "type": "string",
      "title": "Eventname"
    },
    "eventDate": {
      "type": "string",
      "format": "date",
      "title": "Eventdate"
    },
    "tenantId": {
      "type": "string",
      "title": "Tenantid"
    },
    "recipientId": {
      "type": "string",
      "title": "Recipientid"
    },
    "recipientName": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Recipientname"
    },
    "budgetCredits": {
      "type": "integer",
      "title": "Budgetcredits"
    },
    "spentCredits": {
      "type": "integer",
      "title": "Spentcredits"
    },
    "reservedCredits": {
      "type": "integer",
      "title": "Reservedcredits"
    }
  },
  "type": "object",
  "required": [
    "eventId",
    "eventName",
    "eventDate",
    "tenantId",
    "recipientId",
    "budgetCredits",
    "spentCredits",
    "reservedCredits"
  ],
  "title": "EventSpendSummary"
}
```

### EventUpdate {#eventupdate}

```json
{
  "properties": {
    "eventName": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 150,
          "minLength": 1
        },
        {
          "type": "null"
        }
      ],
      "title": "Eventname"
    },
    "eventDate": {
      "anyOf": [
        {
          "type": "string",
          "format": "date"
        },
        {
          "type": "null"
        }
      ],
      "title": "Eventdate"
    },
    "recipientId": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ],
      "title": "Recipientid"
    },
    "description": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 2000
        },
        {
          "type": "null"
        }
      ],
      "title": "Description"
    },
    "isActive": {
      "anyOf": [
        {
          "type": "boolean"
        },
        {
          "type": "null"
        }
      ],
      "title": "Isactive"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "title": "EventUpdate"
}
```

### GiftBulkUpdate {#giftbulkupdate}

```json
{
  "properties": {
    "giftIds": {
      "items": {
        "type": "string",
        "format": "uuid"
      },
      "type": "array",
      "maxItems": 100,
      "minItems": 1,
      "title": "Giftids"
    },
    "status": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/ContractGiftStatus"
        },
        {
          "type": "null"
        }
      ]
    },
    "vendorName": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 180
        },
        {
          "type": "null"
        }
      ],
      "title": "Vendorname"
    },
    "deliveryDate": {
      "anyOf": [
        {
          "type": "string",
          "format": "date"
        },
        {
          "type": "null"
        }
      ],
      "title": "Deliverydate"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "giftIds"
  ],
  "title": "GiftBulkUpdate"
}
```

### GiftBulkUpdateResult {#giftbulkupdateresult}

```json
{
  "properties": {
    "updatedCount": {
      "type": "integer",
      "title": "Updatedcount"
    },
    "items": {
      "items": {
        "$ref": "#/components/schemas/GiftLineRead"
      },
      "type": "array",
      "title": "Items"
    }
  },
  "type": "object",
  "required": [
    "updatedCount",
    "items"
  ],
  "title": "GiftBulkUpdateResult"
}
```

### GiftLineCancel {#giftlinecancel}

```json
{
  "properties": {
    "reason": {
      "type": "string",
      "maxLength": 1000,
      "minLength": 1,
      "title": "Reason"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "reason"
  ],
  "title": "GiftLineCancel"
}
```

### GiftLineCreate {#giftlinecreate}

```json
{
  "properties": {
    "recipientId": {
      "type": "string",
      "format": "uuid",
      "title": "Recipientid"
    },
    "eventId": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ],
      "title": "Eventid"
    },
    "occasionId": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ],
      "title": "Occasionid"
    },
    "requestId": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ],
      "title": "Requestid"
    },
    "giftName": {
      "type": "string",
      "maxLength": 180,
      "minLength": 1,
      "title": "Giftname"
    },
    "customisation": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 2000
        },
        {
          "type": "null"
        }
      ],
      "title": "Customisation"
    },
    "unitPrice": {
      "anyOf": [
        {
          "type": "number",
          "minimum": 0.0
        },
        {
          "type": "string"
        }
      ],
      "title": "Unitprice"
    },
    "quantity": {
      "type": "integer",
      "maximum": 10000.0,
      "minimum": 1.0,
      "title": "Quantity",
      "default": 1
    },
    "deliveryDate": {
      "anyOf": [
        {
          "type": "string",
          "format": "date"
        },
        {
          "type": "null"
        }
      ],
      "title": "Deliverydate"
    },
    "vendorName": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 180
        },
        {
          "type": "null"
        }
      ],
      "title": "Vendorname"
    },
    "status": {
      "$ref": "#/components/schemas/ContractGiftStatus",
      "default": "PLANNED"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "recipientId",
    "giftName",
    "unitPrice"
  ],
  "title": "GiftLineCreate"
}
```

### GiftLinePage {#giftlinepage}

```json
{
  "properties": {
    "items": {
      "items": {
        "$ref": "#/components/schemas/GiftLineRead"
      },
      "type": "array",
      "title": "Items"
    },
    "pagination": {
      "$ref": "#/components/schemas/PaginationMeta"
    },
    "nextCursor": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Nextcursor"
    }
  },
  "type": "object",
  "required": [
    "items",
    "pagination"
  ],
  "title": "GiftLinePage"
}
```

### GiftLineRead {#giftlineread}

```json
{
  "properties": {
    "id": {
      "type": "string",
      "title": "Id"
    },
    "tenantId": {
      "type": "string",
      "title": "Tenantid"
    },
    "contractId": {
      "type": "string",
      "title": "Contractid"
    },
    "recipientId": {
      "type": "string",
      "title": "Recipientid"
    },
    "recipientName": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Recipientname"
    },
    "recipientTier": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Recipienttier"
    },
    "eventId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Eventid"
    },
    "eventName": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Eventname"
    },
    "occasionId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Occasionid"
    },
    "occasionName": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Occasionname"
    },
    "requestId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Requestid"
    },
    "giftName": {
      "type": "string",
      "title": "Giftname"
    },
    "customisation": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Customisation"
    },
    "unitPrice": {
      "type": "string",
      "title": "Unitprice"
    },
    "quantity": {
      "type": "integer",
      "title": "Quantity"
    },
    "deliveryDate": {
      "anyOf": [
        {
          "type": "string",
          "format": "date"
        },
        {
          "type": "null"
        }
      ],
      "title": "Deliverydate"
    },
    "vendorName": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Vendorname"
    },
    "status": {
      "$ref": "#/components/schemas/ContractGiftStatus"
    },
    "priceChangeReason": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Pricechangereason"
    },
    "createdAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Createdat"
    },
    "updatedAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Updatedat"
    },
    "lineTotal": {
      "type": "string",
      "title": "Linetotal",
      "readOnly": true
    }
  },
  "type": "object",
  "required": [
    "id",
    "tenantId",
    "contractId",
    "recipientId",
    "giftName",
    "unitPrice",
    "quantity",
    "status",
    "createdAt",
    "updatedAt",
    "lineTotal"
  ],
  "title": "GiftLineRead"
}
```

### GiftLineUpdate {#giftlineupdate}

```json
{
  "properties": {
    "recipientId": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ],
      "title": "Recipientid"
    },
    "eventId": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ],
      "title": "Eventid"
    },
    "occasionId": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ],
      "title": "Occasionid"
    },
    "requestId": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ],
      "title": "Requestid"
    },
    "giftName": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 180,
          "minLength": 1
        },
        {
          "type": "null"
        }
      ],
      "title": "Giftname"
    },
    "customisation": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 2000
        },
        {
          "type": "null"
        }
      ],
      "title": "Customisation"
    },
    "unitPrice": {
      "anyOf": [
        {
          "type": "number",
          "minimum": 0.0
        },
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Unitprice"
    },
    "quantity": {
      "anyOf": [
        {
          "type": "integer",
          "maximum": 10000.0,
          "minimum": 1.0
        },
        {
          "type": "null"
        }
      ],
      "title": "Quantity"
    },
    "deliveryDate": {
      "anyOf": [
        {
          "type": "string",
          "format": "date"
        },
        {
          "type": "null"
        }
      ],
      "title": "Deliverydate"
    },
    "vendorName": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 180
        },
        {
          "type": "null"
        }
      ],
      "title": "Vendorname"
    },
    "reason": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 1000
        },
        {
          "type": "null"
        }
      ],
      "title": "Reason"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "title": "GiftLineUpdate"
}
```

### GiftProposal {#giftproposal}

```json
{
  "properties": {
    "options": {
      "items": {
        "$ref": "#/components/schemas/GiftProposalOption-Output"
      },
      "type": "array",
      "maxItems": 20,
      "minItems": 1,
      "title": "Options"
    },
    "note": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 2000
        },
        {
          "type": "null"
        }
      ],
      "title": "Note"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "options"
  ],
  "title": "GiftProposal"
}
```

### GiftProposalOption-Input {#giftproposaloption-input}

```json
{
  "properties": {
    "name": {
      "type": "string",
      "maxLength": 180,
      "minLength": 1,
      "title": "Name"
    },
    "description": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 1000
        },
        {
          "type": "null"
        }
      ],
      "title": "Description"
    },
    "price": {
      "anyOf": [
        {
          "type": "number",
          "minimum": 0.0
        },
        {
          "type": "string"
        }
      ],
      "title": "Price"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "name",
    "price"
  ],
  "title": "GiftProposalOption"
}
```

### GiftProposalOption-Output {#giftproposaloption-output}

```json
{
  "properties": {
    "name": {
      "type": "string",
      "maxLength": 180,
      "minLength": 1,
      "title": "Name"
    },
    "description": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 1000
        },
        {
          "type": "null"
        }
      ],
      "title": "Description"
    },
    "price": {
      "type": "string",
      "title": "Price"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "name",
    "price"
  ],
  "title": "GiftProposalOption"
}
```

### GiftProposalUpdate {#giftproposalupdate}

```json
{
  "properties": {
    "options": {
      "items": {
        "$ref": "#/components/schemas/GiftProposalOption-Input"
      },
      "type": "array",
      "maxItems": 20,
      "minItems": 1,
      "title": "Options"
    },
    "note": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 2000
        },
        {
          "type": "null"
        }
      ],
      "title": "Note"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "options"
  ],
  "title": "GiftProposalUpdate"
}
```

### GiftRequestAction {#giftrequestaction}

```json
{
  "properties": {
    "note": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 2000
        },
        {
          "type": "null"
        }
      ],
      "title": "Note"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "title": "GiftRequestAction"
}
```

### GiftRequestCreate {#giftrequestcreate}

```json
{
  "properties": {
    "title": {
      "type": "string",
      "maxLength": 180,
      "minLength": 1,
      "title": "Title"
    },
    "recipientId": {
      "type": "string",
      "format": "uuid",
      "title": "Recipientid"
    },
    "eventId": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ],
      "title": "Eventid"
    },
    "occasionId": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ],
      "title": "Occasionid"
    },
    "requestedCredits": {
      "anyOf": [
        {
          "type": "integer",
          "maximum": 1000000000.0,
          "exclusiveMinimum": 0.0
        },
        {
          "type": "null"
        }
      ],
      "title": "Requestedcredits"
    },
    "purpose": {
      "type": "string",
      "maxLength": 2000,
      "minLength": 1,
      "title": "Purpose"
    },
    "giftPreferences": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 2000
        },
        {
          "type": "null"
        }
      ],
      "title": "Giftpreferences"
    },
    "requestedBudget": {
      "anyOf": [
        {
          "type": "number",
          "minimum": 0.0
        },
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Requestedbudget"
    },
    "deliveryDate": {
      "anyOf": [
        {
          "type": "string",
          "format": "date"
        },
        {
          "type": "null"
        }
      ],
      "title": "Deliverydate"
    },
    "message": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 1000
        },
        {
          "type": "null"
        }
      ],
      "title": "Message"
    },
    "specialInstructions": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 2000
        },
        {
          "type": "null"
        }
      ],
      "title": "Specialinstructions"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "title",
    "recipientId",
    "purpose"
  ],
  "title": "GiftRequestCreate"
}
```

### GiftRequestEventPage {#giftrequesteventpage}

```json
{
  "properties": {
    "items": {
      "items": {
        "$ref": "#/components/schemas/GiftRequestEventRead"
      },
      "type": "array",
      "title": "Items"
    }
  },
  "type": "object",
  "required": [
    "items"
  ],
  "title": "GiftRequestEventPage"
}
```

### GiftRequestEventRead {#giftrequesteventread}

```json
{
  "properties": {
    "id": {
      "type": "string",
      "title": "Id"
    },
    "tenantId": {
      "type": "string",
      "title": "Tenantid"
    },
    "giftRequestId": {
      "type": "string",
      "title": "Giftrequestid"
    },
    "fromStatus": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/GiftRequestStatus"
        },
        {
          "type": "null"
        }
      ]
    },
    "toStatus": {
      "$ref": "#/components/schemas/GiftRequestStatus"
    },
    "actorUserId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Actoruserid"
    },
    "note": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Note"
    },
    "createdAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Createdat"
    }
  },
  "type": "object",
  "required": [
    "id",
    "tenantId",
    "giftRequestId",
    "toStatus",
    "createdAt"
  ],
  "title": "GiftRequestEventRead"
}
```

### GiftRequestPage {#giftrequestpage}

```json
{
  "properties": {
    "items": {
      "items": {
        "$ref": "#/components/schemas/GiftRequestRead"
      },
      "type": "array",
      "title": "Items"
    },
    "pagination": {
      "$ref": "#/components/schemas/PaginationMeta"
    },
    "nextCursor": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Nextcursor"
    }
  },
  "type": "object",
  "required": [
    "items",
    "pagination"
  ],
  "title": "GiftRequestPage"
}
```

### GiftRequestRead {#giftrequestread}

```json
{
  "properties": {
    "id": {
      "type": "string",
      "title": "Id"
    },
    "tenantId": {
      "type": "string",
      "title": "Tenantid"
    },
    "recipientId": {
      "type": "string",
      "title": "Recipientid"
    },
    "eventId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Eventid"
    },
    "occasionId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Occasionid"
    },
    "createdByUserId": {
      "type": "string",
      "title": "Createdbyuserid"
    },
    "title": {
      "type": "string",
      "title": "Title"
    },
    "purpose": {
      "type": "string",
      "title": "Purpose"
    },
    "giftPreferences": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Giftpreferences"
    },
    "requestedBudget": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Requestedbudget"
    },
    "requestedCredits": {
      "anyOf": [
        {
          "type": "integer"
        },
        {
          "type": "null"
        }
      ],
      "title": "Requestedcredits"
    },
    "deliveryDate": {
      "anyOf": [
        {
          "type": "string",
          "format": "date"
        },
        {
          "type": "null"
        }
      ],
      "title": "Deliverydate"
    },
    "message": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Message"
    },
    "specialInstructions": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Specialinstructions"
    },
    "status": {
      "$ref": "#/components/schemas/GiftRequestStatus"
    },
    "proposal": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/GiftProposal"
        },
        {
          "type": "null"
        }
      ]
    },
    "statusNote": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Statusnote"
    },
    "createdAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Createdat"
    },
    "updatedAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Updatedat"
    }
  },
  "type": "object",
  "required": [
    "id",
    "tenantId",
    "recipientId",
    "createdByUserId",
    "title",
    "purpose",
    "status",
    "createdAt",
    "updatedAt"
  ],
  "title": "GiftRequestRead"
}
```

### GiftRequestStatus {#giftrequeststatus}

```json
{
  "type": "string",
  "enum": [
    "DRAFT",
    "SUBMITTED",
    "IN_REVIEW",
    "NEEDS_INFO",
    "PROPOSAL_READY",
    "APPROVED",
    "REJECTED",
    "CANCELLED"
  ],
  "title": "GiftRequestStatus"
}
```

### GiftRequestUpdate {#giftrequestupdate}

```json
{
  "properties": {
    "title": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 180,
          "minLength": 1
        },
        {
          "type": "null"
        }
      ],
      "title": "Title"
    },
    "recipientId": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ],
      "title": "Recipientid"
    },
    "eventId": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ],
      "title": "Eventid"
    },
    "occasionId": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid"
        },
        {
          "type": "null"
        }
      ],
      "title": "Occasionid"
    },
    "requestedCredits": {
      "anyOf": [
        {
          "type": "integer",
          "maximum": 1000000000.0,
          "exclusiveMinimum": 0.0
        },
        {
          "type": "null"
        }
      ],
      "title": "Requestedcredits"
    },
    "purpose": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 2000,
          "minLength": 1
        },
        {
          "type": "null"
        }
      ],
      "title": "Purpose"
    },
    "giftPreferences": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 2000
        },
        {
          "type": "null"
        }
      ],
      "title": "Giftpreferences"
    },
    "requestedBudget": {
      "anyOf": [
        {
          "type": "number",
          "minimum": 0.0
        },
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Requestedbudget"
    },
    "deliveryDate": {
      "anyOf": [
        {
          "type": "string",
          "format": "date"
        },
        {
          "type": "null"
        }
      ],
      "title": "Deliverydate"
    },
    "message": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 1000
        },
        {
          "type": "null"
        }
      ],
      "title": "Message"
    },
    "specialInstructions": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 2000
        },
        {
          "type": "null"
        }
      ],
      "title": "Specialinstructions"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "title": "GiftRequestUpdate"
}
```

### GiftSpendNotificationPage {#giftspendnotificationpage}

```json
{
  "properties": {
    "items": {
      "items": {
        "$ref": "#/components/schemas/GiftSpendNotificationRead"
      },
      "type": "array",
      "title": "Items"
    },
    "pagination": {
      "$ref": "#/components/schemas/PaginationMeta"
    },
    "nextCursor": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Nextcursor"
    }
  },
  "type": "object",
  "required": [
    "items",
    "pagination"
  ],
  "title": "GiftSpendNotificationPage"
}
```

### GiftSpendNotificationRead {#giftspendnotificationread}

```json
{
  "properties": {
    "id": {
      "type": "string",
      "title": "Id"
    },
    "tenantId": {
      "type": "string",
      "title": "Tenantid"
    },
    "notificationType": {
      "type": "string",
      "title": "Notificationtype"
    },
    "sourceType": {
      "type": "string",
      "title": "Sourcetype"
    },
    "sourceId": {
      "type": "string",
      "title": "Sourceid"
    },
    "title": {
      "type": "string",
      "title": "Title"
    },
    "body": {
      "type": "string",
      "title": "Body"
    },
    "leadDays": {
      "type": "integer",
      "title": "Leaddays"
    },
    "eventDate": {
      "type": "string",
      "format": "date",
      "title": "Eventdate"
    },
    "createdAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Createdat"
    },
    "readAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Readat"
    }
  },
  "type": "object",
  "required": [
    "id",
    "tenantId",
    "notificationType",
    "sourceType",
    "sourceId",
    "title",
    "body",
    "leadDays",
    "eventDate",
    "createdAt"
  ],
  "title": "GiftSpendNotificationRead"
}
```

### GiftSpendSettingsRead {#giftspendsettingsread}

```json
{
  "properties": {
    "reminderDays": {
      "items": {
        "type": "integer"
      },
      "type": "array",
      "maxItems": 10,
      "minItems": 1,
      "title": "Reminderdays"
    },
    "tenantId": {
      "type": "string",
      "title": "Tenantid"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "tenantId"
  ],
  "title": "GiftSpendSettingsRead"
}
```

### GiftSpendSettingsUpdate {#giftspendsettingsupdate}

```json
{
  "properties": {
    "reminderDays": {
      "items": {
        "type": "integer"
      },
      "type": "array",
      "maxItems": 10,
      "minItems": 1,
      "title": "Reminderdays"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "title": "GiftSpendSettingsUpdate"
}
```

### HTTPValidationError {#httpvalidationerror}

```json
{
  "properties": {
    "detail": {
      "items": {
        "$ref": "#/components/schemas/ValidationError"
      },
      "type": "array",
      "title": "Detail"
    }
  },
  "type": "object",
  "title": "HTTPValidationError"
}
```

### KamOption {#kamoption}

```json
{
  "properties": {
    "id": {
      "type": "string",
      "title": "Id"
    },
    "email": {
      "type": "string",
      "title": "Email"
    },
    "fullName": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Fullname"
    }
  },
  "type": "object",
  "required": [
    "id",
    "email"
  ],
  "title": "KamOption"
}
```

### MessageResponse {#messageresponse}

```json
{
  "properties": {
    "message": {
      "type": "string",
      "title": "Message",
      "description": "Response message"
    }
  },
  "type": "object",
  "required": [
    "message"
  ],
  "title": "MessageResponse"
}
```

### OccasionCreate {#occasioncreate}

```json
{
  "properties": {
    "occasionName": {
      "type": "string",
      "maxLength": 150,
      "minLength": 1,
      "title": "Occasionname"
    },
    "occasionDate": {
      "type": "string",
      "format": "date",
      "title": "Occasiondate"
    },
    "description": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 2000
        },
        {
          "type": "null"
        }
      ],
      "title": "Description"
    },
    "isActive": {
      "type": "boolean",
      "title": "Isactive",
      "default": true
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "occasionName",
    "occasionDate"
  ],
  "title": "OccasionCreate"
}
```

### OccasionGroupAllocationRead {#occasiongroupallocationread}

```json
{
  "properties": {
    "id": {
      "type": "string",
      "title": "Id"
    },
    "sourceGroupId": {
      "type": "string",
      "title": "Sourcegroupid"
    },
    "groupName": {
      "type": "string",
      "title": "Groupname"
    },
    "budgetMode": {
      "$ref": "#/components/schemas/SpendBudgetMode"
    },
    "budgetCredits": {
      "type": "integer",
      "title": "Budgetcredits"
    },
    "allocatedCredits": {
      "type": "integer",
      "title": "Allocatedcredits"
    },
    "spentCredits": {
      "type": "integer",
      "title": "Spentcredits"
    },
    "reservedCredits": {
      "type": "integer",
      "title": "Reservedcredits"
    },
    "members": {
      "items": {
        "$ref": "#/components/schemas/SpendRecipientAllocation"
      },
      "type": "array",
      "title": "Members"
    }
  },
  "type": "object",
  "required": [
    "id",
    "sourceGroupId",
    "groupName",
    "budgetMode",
    "budgetCredits",
    "allocatedCredits",
    "spentCredits",
    "reservedCredits",
    "members"
  ],
  "title": "OccasionGroupAllocationRead"
}
```

### OccasionGroupBudgetUpdate {#occasiongroupbudgetupdate}

```json
{
  "properties": {
    "budgetMode": {
      "$ref": "#/components/schemas/SpendBudgetMode"
    },
    "budgetCredits": {
      "type": "integer",
      "maximum": 1000000000.0,
      "exclusiveMinimum": 0.0,
      "title": "Budgetcredits"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "budgetMode",
    "budgetCredits"
  ],
  "title": "OccasionGroupBudgetUpdate"
}
```

### OccasionGroupImport {#occasiongroupimport}

```json
{
  "properties": {
    "recipientGroupId": {
      "type": "string",
      "format": "uuid",
      "title": "Recipientgroupid"
    },
    "budgetMode": {
      "$ref": "#/components/schemas/SpendBudgetMode"
    },
    "budgetCredits": {
      "type": "integer",
      "maximum": 1000000000.0,
      "exclusiveMinimum": 0.0,
      "title": "Budgetcredits"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "recipientGroupId",
    "budgetMode",
    "budgetCredits"
  ],
  "title": "OccasionGroupImport"
}
```

### OccasionList {#occasionlist}

```json
{
  "properties": {
    "items": {
      "items": {
        "$ref": "#/components/schemas/OccasionRead"
      },
      "type": "array",
      "title": "Items"
    },
    "pagination": {
      "$ref": "#/components/schemas/PaginationMeta"
    },
    "nextCursor": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Nextcursor"
    }
  },
  "type": "object",
  "required": [
    "items",
    "pagination"
  ],
  "title": "OccasionList"
}
```

### OccasionRead {#occasionread}

```json
{
  "properties": {
    "id": {
      "type": "string",
      "title": "Id"
    },
    "tenantId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Tenantid"
    },
    "occasionName": {
      "type": "string",
      "title": "Occasionname"
    },
    "occasionDate": {
      "anyOf": [
        {
          "type": "string",
          "format": "date"
        },
        {
          "type": "null"
        }
      ],
      "title": "Occasiondate"
    },
    "description": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Description"
    },
    "isActive": {
      "type": "boolean",
      "title": "Isactive"
    },
    "createdByUserId": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Createdbyuserid"
    },
    "createdAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Createdat"
    },
    "updatedAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Updatedat"
    }
  },
  "type": "object",
  "required": [
    "id",
    "occasionName",
    "isActive",
    "createdAt",
    "updatedAt"
  ],
  "title": "OccasionRead"
}
```

### OccasionSpendSummary {#occasionspendsummary}

```json
{
  "properties": {
    "occasionId": {
      "type": "string",
      "title": "Occasionid"
    },
    "occasionName": {
      "type": "string",
      "title": "Occasionname"
    },
    "tenantId": {
      "type": "string",
      "title": "Tenantid"
    },
    "groups": {
      "items": {
        "$ref": "#/components/schemas/OccasionGroupAllocationRead"
      },
      "type": "array",
      "title": "Groups"
    },
    "recipients": {
      "items": {
        "$ref": "#/components/schemas/SpendRecipientAllocation"
      },
      "type": "array",
      "title": "Recipients"
    },
    "allocatedCredits": {
      "type": "integer",
      "title": "Allocatedcredits"
    },
    "spentCredits": {
      "type": "integer",
      "title": "Spentcredits"
    },
    "reservedCredits": {
      "type": "integer",
      "title": "Reservedcredits"
    }
  },
  "type": "object",
  "required": [
    "occasionId",
    "occasionName",
    "tenantId",
    "groups",
    "recipients",
    "allocatedCredits",
    "spentCredits",
    "reservedCredits"
  ],
  "title": "OccasionSpendSummary"
}
```

### OccasionUpdate {#occasionupdate}

```json
{
  "properties": {
    "occasionName": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 150,
          "minLength": 1
        },
        {
          "type": "null"
        }
      ],
      "title": "Occasionname"
    },
    "occasionDate": {
      "anyOf": [
        {
          "type": "string",
          "format": "date"
        },
        {
          "type": "null"
        }
      ],
      "title": "Occasiondate"
    },
    "description": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 2000
        },
        {
          "type": "null"
        }
      ],
      "title": "Description"
    },
    "isActive": {
      "anyOf": [
        {
          "type": "boolean"
        },
        {
          "type": "null"
        }
      ],
      "title": "Isactive"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "title": "OccasionUpdate"
}
```

### PaginationMeta {#paginationmeta}

```json
{
  "properties": {
    "page": {
      "type": "integer",
      "minimum": 1.0,
      "title": "Page"
    },
    "limit": {
      "type": "integer",
      "minimum": 1.0,
      "title": "Limit"
    },
    "total_records": {
      "type": "integer",
      "minimum": 0.0,
      "title": "Total Records"
    }
  },
  "type": "object",
  "required": [
    "page",
    "limit",
    "total_records"
  ],
  "title": "PaginationMeta"
}
```

### PasswordResetRequest {#passwordresetrequest}

```json
{
  "properties": {
    "email": {
      "type": "string",
      "maxLength": 254,
      "pattern": "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$",
      "title": "Email",
      "description": "Account email to send recovery instructions"
    }
  },
  "type": "object",
  "required": [
    "email"
  ],
  "title": "PasswordResetRequest"
}
```

### PasswordUpdateRequest {#passwordupdaterequest}

```json
{
  "properties": {
    "newPassword": {
      "type": "string",
      "maxLength": 128,
      "minLength": 8,
      "title": "Newpassword",
      "description": "New password (min 8 characters)"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "newPassword"
  ],
  "title": "PasswordUpdateRequest"
}
```

### PaymentSubmission {#paymentsubmission}

```json
{
  "properties": {
    "paymentReference": {
      "type": "string",
      "maxLength": 150,
      "minLength": 3,
      "title": "Paymentreference"
    },
    "paidAmountMinor": {
      "type": "integer",
      "exclusiveMinimum": 0.0,
      "title": "Paidamountminor"
    },
    "paymentProofFileId": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 500,
          "minLength": 1
        },
        {
          "type": "null"
        }
      ],
      "title": "Paymentprooffileid"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "paymentReference",
    "paidAmountMinor"
  ],
  "title": "PaymentSubmission"
}
```

### PaymentVerification {#paymentverification}

```json
{
  "properties": {
    "verificationNote": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 1000
        },
        {
          "type": "null"
        }
      ],
      "title": "Verificationnote"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "title": "PaymentVerification"
}
```

### RecipientAddress {#recipientaddress}

```json
{
  "properties": {
    "addressLine1": {
      "type": "string",
      "maxLength": 300,
      "minLength": 3,
      "title": "Addressline1"
    },
    "addressLine2": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 300
        },
        {
          "type": "null"
        }
      ],
      "title": "Addressline2"
    },
    "city": {
      "type": "string",
      "maxLength": 100,
      "minLength": 1,
      "title": "City"
    },
    "state": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 100
        },
        {
          "type": "null"
        }
      ],
      "title": "State"
    },
    "postalCode": {
      "type": "string",
      "pattern": "^[0-9]{6}$",
      "title": "Postalcode"
    },
    "country": {
      "type": "string",
      "maxLength": 2,
      "minLength": 2,
      "pattern": "^[A-Z]{2}$",
      "title": "Country",
      "default": "IN"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "addressLine1",
    "city",
    "postalCode"
  ],
  "title": "RecipientAddress"
}
```

### RecipientCreate {#recipientcreate}

```json
{
  "properties": {
    "name": {
      "type": "string",
      "maxLength": 200,
      "minLength": 1,
      "title": "Name"
    },
    "mobileNumber": {
      "type": "string",
      "pattern": "^\\+?[1-9][0-9]{7,14}$",
      "title": "Mobilenumber"
    },
    "address": {
      "$ref": "#/components/schemas/RecipientAddress"
    },
    "dateOfBirth": {
      "type": "string",
      "format": "date",
      "title": "Dateofbirth"
    },
    "anniversaryDate": {
      "anyOf": [
        {
          "type": "string",
          "format": "date"
        },
        {
          "type": "null"
        }
      ],
      "title": "Anniversarydate"
    },
    "budget": {
      "anyOf": [
        {
          "type": "number",
          "minimum": 0.0
        },
        {
          "type": "string"
        }
      ],
      "title": "Budget",
      "description": "Per-gifting-occasion budget in INR."
    },
    "remark": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 2000
        },
        {
          "type": "null"
        }
      ],
      "title": "Remark"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "name",
    "mobileNumber",
    "address",
    "dateOfBirth",
    "budget"
  ],
  "title": "RecipientCreate"
}
```

### RecipientGroupCreate {#recipientgroupcreate}

```json
{
  "properties": {
    "name": {
      "type": "string",
      "maxLength": 100,
      "minLength": 1,
      "title": "Name"
    },
    "recipientIds": {
      "items": {
        "type": "string",
        "format": "uuid"
      },
      "type": "array",
      "maxItems": 1000,
      "minItems": 1,
      "title": "Recipientids"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "name",
    "recipientIds"
  ],
  "title": "RecipientGroupCreate"
}
```

### RecipientGroupRead {#recipientgroupread}

```json
{
  "properties": {
    "id": {
      "type": "string",
      "title": "Id"
    },
    "tenantId": {
      "type": "string",
      "title": "Tenantid"
    },
    "name": {
      "type": "string",
      "title": "Name"
    },
    "recipientIds": {
      "items": {
        "type": "string"
      },
      "type": "array",
      "title": "Recipientids"
    },
    "createdAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Createdat"
    },
    "updatedAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Updatedat"
    }
  },
  "type": "object",
  "required": [
    "id",
    "tenantId",
    "name",
    "recipientIds",
    "createdAt",
    "updatedAt"
  ],
  "title": "RecipientGroupRead"
}
```

### RecipientGroupUpdate {#recipientgroupupdate}

```json
{
  "properties": {
    "name": {
      "type": "string",
      "maxLength": 100,
      "minLength": 1,
      "title": "Name"
    },
    "recipientIds": {
      "items": {
        "type": "string",
        "format": "uuid"
      },
      "type": "array",
      "maxItems": 1000,
      "minItems": 1,
      "title": "Recipientids"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "name",
    "recipientIds"
  ],
  "title": "RecipientGroupUpdate"
}
```

### RecipientList {#recipientlist}

```json
{
  "properties": {
    "items": {
      "items": {
        "$ref": "#/components/schemas/RecipientRead"
      },
      "type": "array",
      "title": "Items"
    },
    "pagination": {
      "$ref": "#/components/schemas/PaginationMeta"
    },
    "nextCursor": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Nextcursor",
      "description": "Next page query values (page and limit), or null when there is no next page."
    }
  },
  "type": "object",
  "required": [
    "items",
    "pagination"
  ],
  "title": "RecipientList"
}
```

### RecipientOccasionBudgetUpdate {#recipientoccasionbudgetupdate}

```json
{
  "properties": {
    "budgetCredits": {
      "type": "integer",
      "maximum": 1000000000.0,
      "exclusiveMinimum": 0.0,
      "title": "Budgetcredits"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "budgetCredits"
  ],
  "title": "RecipientOccasionBudgetUpdate"
}
```

### RecipientRead {#recipientread}

```json
{
  "properties": {
    "id": {
      "type": "string",
      "title": "Id"
    },
    "tenantId": {
      "type": "string",
      "title": "Tenantid"
    },
    "name": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Name"
    },
    "mobileNumber": {
      "type": "string",
      "title": "Mobilenumber"
    },
    "address": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/RecipientAddress"
        },
        {
          "type": "null"
        }
      ]
    },
    "dateOfBirth": {
      "anyOf": [
        {
          "type": "string",
          "format": "date"
        },
        {
          "type": "null"
        }
      ],
      "title": "Dateofbirth"
    },
    "anniversaryDate": {
      "anyOf": [
        {
          "type": "string",
          "format": "date"
        },
        {
          "type": "null"
        }
      ],
      "title": "Anniversarydate"
    },
    "budget": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Budget"
    },
    "remark": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Remark"
    }
  },
  "type": "object",
  "required": [
    "id",
    "tenantId",
    "mobileNumber"
  ],
  "title": "RecipientRead"
}
```

### RecipientUpdate {#recipientupdate}

```json
{
  "properties": {
    "name": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 200,
          "minLength": 1
        },
        {
          "type": "null"
        }
      ],
      "title": "Name"
    },
    "mobileNumber": {
      "anyOf": [
        {
          "type": "string",
          "pattern": "^\\+?[1-9][0-9]{7,14}$"
        },
        {
          "type": "null"
        }
      ],
      "title": "Mobilenumber"
    },
    "address": {
      "anyOf": [
        {
          "$ref": "#/components/schemas/RecipientAddress"
        },
        {
          "type": "null"
        }
      ]
    },
    "dateOfBirth": {
      "anyOf": [
        {
          "type": "string",
          "format": "date"
        },
        {
          "type": "null"
        }
      ],
      "title": "Dateofbirth"
    },
    "anniversaryDate": {
      "anyOf": [
        {
          "type": "string",
          "format": "date"
        },
        {
          "type": "null"
        }
      ],
      "title": "Anniversarydate"
    },
    "budget": {
      "anyOf": [
        {
          "type": "number",
          "minimum": 0.0
        },
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Budget"
    },
    "remark": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 2000
        },
        {
          "type": "null"
        }
      ],
      "title": "Remark"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "title": "RecipientUpdate"
}
```

### RefreshTokenRequest {#refreshtokenrequest}

```json
{
  "properties": {
    "refresh_token": {
      "type": "string",
      "title": "Refresh Token",
      "description": "Valid Supabase refresh token"
    }
  },
  "type": "object",
  "required": [
    "refresh_token"
  ],
  "title": "RefreshTokenRequest"
}
```

### Role {#role}

```json
{
  "type": "string",
  "enum": [
    "SUPER_ADMIN",
    "KAM",
    "CLIENT"
  ],
  "title": "Role"
}
```

### SpendBudgetMode {#spendbudgetmode}

```json
{
  "type": "string",
  "enum": [
    "PER_RECIPIENT",
    "SHARED_POOL"
  ],
  "title": "SpendBudgetMode"
}
```

### SpendRecipientAllocation {#spendrecipientallocation}

```json
{
  "properties": {
    "recipientId": {
      "type": "string",
      "title": "Recipientid"
    },
    "recipientName": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Recipientname"
    },
    "budgetCredits": {
      "anyOf": [
        {
          "type": "integer"
        },
        {
          "type": "null"
        }
      ],
      "title": "Budgetcredits"
    },
    "spentCredits": {
      "type": "integer",
      "title": "Spentcredits"
    },
    "reservedCredits": {
      "type": "integer",
      "title": "Reservedcredits"
    },
    "budgetSource": {
      "type": "string",
      "title": "Budgetsource"
    }
  },
  "type": "object",
  "required": [
    "recipientId",
    "spentCredits",
    "reservedCredits",
    "budgetSource"
  ],
  "title": "SpendRecipientAllocation"
}
```

### SpendSummary {#spendsummary}

```json
{
  "properties": {
    "tenantId": {
      "type": "string",
      "title": "Tenantid"
    },
    "availableCredits": {
      "type": "integer",
      "title": "Availablecredits"
    },
    "reservedCredits": {
      "type": "integer",
      "title": "Reservedcredits"
    },
    "unallocatedCredits": {
      "type": "integer",
      "title": "Unallocatedcredits"
    },
    "totalAllocatedCredits": {
      "type": "integer",
      "title": "Totalallocatedcredits"
    },
    "totalSpentCredits": {
      "type": "integer",
      "title": "Totalspentcredits"
    },
    "occasions": {
      "items": {
        "$ref": "#/components/schemas/OccasionSpendSummary"
      },
      "type": "array",
      "title": "Occasions"
    },
    "events": {
      "items": {
        "$ref": "#/components/schemas/EventSpendSummary"
      },
      "type": "array",
      "title": "Events"
    }
  },
  "type": "object",
  "required": [
    "tenantId",
    "availableCredits",
    "reservedCredits",
    "unallocatedCredits",
    "totalAllocatedCredits",
    "totalSpentCredits",
    "occasions",
    "events"
  ],
  "title": "SpendSummary"
}
```

### TenantCreate {#tenantcreate}

```json
{
  "properties": {
    "tenantType": {
      "$ref": "#/components/schemas/TenantType"
    },
    "name": {
      "type": "string",
      "maxLength": 200,
      "minLength": 2,
      "title": "Name"
    },
    "legalName": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 200
        },
        {
          "type": "null"
        }
      ],
      "title": "Legalname"
    },
    "gstin": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 15,
          "minLength": 15,
          "pattern": "^[A-Za-z0-9]{15}$"
        },
        {
          "type": "null"
        }
      ],
      "title": "Gstin"
    },
    "emailDomain": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 253
        },
        {
          "type": "null"
        }
      ],
      "title": "Emaildomain"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "tenantType",
    "name"
  ],
  "title": "TenantCreate"
}
```

### TenantList {#tenantlist}

```json
{
  "properties": {
    "items": {
      "items": {
        "$ref": "#/components/schemas/TenantRead"
      },
      "type": "array",
      "title": "Items"
    },
    "pagination": {
      "$ref": "#/components/schemas/PaginationMeta"
    },
    "nextCursor": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Nextcursor",
      "description": "Next page query values (page and limit), or null when there is no next page."
    }
  },
  "type": "object",
  "required": [
    "items",
    "pagination"
  ],
  "title": "TenantList"
}
```

### TenantRead {#tenantread}

```json
{
  "properties": {
    "id": {
      "type": "string",
      "title": "Id"
    },
    "tenantType": {
      "$ref": "#/components/schemas/TenantType"
    },
    "name": {
      "type": "string",
      "title": "Name"
    },
    "legalName": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Legalname"
    },
    "gstin": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Gstin"
    },
    "emailDomain": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Emaildomain"
    },
    "status": {
      "$ref": "#/components/schemas/TenantStatus"
    },
    "createdAt": {
      "type": "string",
      "title": "Createdat"
    },
    "updatedAt": {
      "type": "string",
      "title": "Updatedat"
    }
  },
  "type": "object",
  "required": [
    "id",
    "tenantType",
    "name",
    "status",
    "createdAt",
    "updatedAt"
  ],
  "title": "TenantRead"
}
```

### TenantStatus {#tenantstatus}

```json
{
  "type": "string",
  "enum": [
    "PENDING_SETUP",
    "ACTIVE",
    "DEACTIVATED"
  ],
  "title": "TenantStatus"
}
```

### TenantType {#tenanttype}

```json
{
  "type": "string",
  "enum": [
    "ORGANIZATION",
    "INDIVIDUAL"
  ],
  "title": "TenantType"
}
```

### TenantUpdate {#tenantupdate}

```json
{
  "properties": {
    "name": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 200,
          "minLength": 2
        },
        {
          "type": "null"
        }
      ],
      "title": "Name"
    },
    "legalName": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 200
        },
        {
          "type": "null"
        }
      ],
      "title": "Legalname"
    },
    "gstin": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 15,
          "minLength": 15,
          "pattern": "^[A-Za-z0-9]{15}$"
        },
        {
          "type": "null"
        }
      ],
      "title": "Gstin"
    },
    "emailDomain": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 253
        },
        {
          "type": "null"
        }
      ],
      "title": "Emaildomain"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "title": "TenantUpdate"
}
```

### TokenResponse {#tokenresponse}

```json
{
  "properties": {
    "access_token": {
      "type": "string",
      "title": "Access Token",
      "description": "JWT Bearer access token"
    },
    "token_type": {
      "type": "string",
      "title": "Token Type",
      "description": "Token type, typically 'bearer'",
      "default": "bearer"
    },
    "expires_in": {
      "anyOf": [
        {
          "type": "integer"
        },
        {
          "type": "null"
        }
      ],
      "title": "Expires In",
      "description": "Token validity in seconds",
      "default": 3600
    },
    "expires_at": {
      "anyOf": [
        {
          "type": "integer"
        },
        {
          "type": "null"
        }
      ],
      "title": "Expires At",
      "description": "Unix timestamp when token expires"
    },
    "refresh_token": {
      "type": "string",
      "title": "Refresh Token",
      "description": "Refresh token used to obtain a new access token"
    }
  },
  "type": "object",
  "required": [
    "access_token",
    "refresh_token"
  ],
  "title": "TokenResponse"
}
```

### UserInviteCreate {#userinvitecreate}

```json
{
  "properties": {
    "email": {
      "type": "string",
      "maxLength": 254,
      "pattern": "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$",
      "title": "Email"
    },
    "fullName": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 150
        },
        {
          "type": "null"
        }
      ],
      "title": "Fullname"
    },
    "role": {
      "$ref": "#/components/schemas/Role",
      "default": "CLIENT"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "required": [
    "email"
  ],
  "title": "UserInviteCreate"
}
```

### UserInviteRead {#userinviteread}

```json
{
  "properties": {
    "invitationId": {
      "type": "string",
      "title": "Invitationid"
    },
    "tenantId": {
      "type": "string",
      "title": "Tenantid"
    },
    "email": {
      "type": "string",
      "title": "Email"
    },
    "status": {
      "type": "string",
      "title": "Status"
    },
    "expiresAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Expiresat"
    }
  },
  "type": "object",
  "required": [
    "invitationId",
    "tenantId",
    "email",
    "status",
    "expiresAt"
  ],
  "title": "UserInviteRead"
}
```

### UserList {#userlist}

```json
{
  "properties": {
    "items": {
      "items": {
        "$ref": "#/components/schemas/UserRead"
      },
      "type": "array",
      "title": "Items"
    },
    "pagination": {
      "$ref": "#/components/schemas/PaginationMeta"
    },
    "nextCursor": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Nextcursor",
      "description": "Next page query values (page and limit), or null when there is no next page."
    }
  },
  "type": "object",
  "required": [
    "items",
    "pagination"
  ],
  "title": "UserList"
}
```

### UserLoginRequest {#userloginrequest}

```json
{
  "properties": {
    "email": {
      "type": "string",
      "maxLength": 254,
      "pattern": "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$",
      "title": "Email",
      "description": "User's email address"
    },
    "password": {
      "type": "string",
      "title": "Password",
      "description": "User password"
    }
  },
  "type": "object",
  "required": [
    "email",
    "password"
  ],
  "title": "UserLoginRequest"
}
```

### UserProfileResponse {#userprofileresponse}

```json
{
  "properties": {
    "id": {
      "type": "string",
      "title": "Id",
      "description": "User unique identifier (UUID)"
    },
    "email": {
      "type": "string",
      "title": "Email",
      "description": "User's email address"
    },
    "full_name": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Full Name",
      "description": "User's full name"
    },
    "avatar_url": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Avatar Url",
      "description": "Avatar image URL"
    },
    "role": {
      "$ref": "#/components/schemas/Role",
      "description": "Application role",
      "default": "CLIENT"
    },
    "tenant_id": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Tenant Id",
      "description": "Tenant company for client users"
    },
    "is_active": {
      "type": "boolean",
      "title": "Is Active",
      "description": "Account active status",
      "default": true
    },
    "must_reset_password": {
      "type": "boolean",
      "title": "Must Reset Password",
      "description": "Whether the user must replace their temporary password",
      "default": false
    },
    "created_at": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Created At",
      "description": "Timestamp user was created"
    },
    "updated_at": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Updated At",
      "description": "Timestamp profile was last updated"
    }
  },
  "type": "object",
  "required": [
    "id",
    "email"
  ],
  "title": "UserProfileResponse"
}
```

### UserRead {#userread}

```json
{
  "properties": {
    "id": {
      "type": "string",
      "title": "Id"
    },
    "tenantId": {
      "type": "string",
      "title": "Tenantid"
    },
    "email": {
      "type": "string",
      "title": "Email"
    },
    "fullName": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "title": "Fullname"
    },
    "role": {
      "$ref": "#/components/schemas/Role"
    },
    "isActive": {
      "type": "boolean",
      "title": "Isactive"
    },
    "tenantStatus": {
      "$ref": "#/components/schemas/TenantStatus"
    },
    "createdAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Createdat"
    },
    "updatedAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time"
        },
        {
          "type": "string"
        }
      ],
      "title": "Updatedat"
    }
  },
  "type": "object",
  "required": [
    "id",
    "tenantId",
    "email",
    "role",
    "isActive",
    "tenantStatus",
    "createdAt",
    "updatedAt"
  ],
  "title": "UserRead"
}
```

### UserRegisterRequest {#userregisterrequest}

```json
{
  "properties": {
    "email": {
      "type": "string",
      "maxLength": 254,
      "pattern": "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$",
      "title": "Email",
      "description": "User's email address"
    },
    "password": {
      "type": "string",
      "maxLength": 128,
      "minLength": 8,
      "title": "Password",
      "description": "User password (min 8 characters)"
    },
    "full_name": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 150
        },
        {
          "type": "null"
        }
      ],
      "title": "Full Name",
      "description": "Full name of the user"
    }
  },
  "type": "object",
  "required": [
    "email",
    "password"
  ],
  "title": "UserRegisterRequest"
}
```

### UserUpdate {#userupdate}

```json
{
  "properties": {
    "fullName": {
      "anyOf": [
        {
          "type": "string",
          "maxLength": 150
        },
        {
          "type": "null"
        }
      ],
      "title": "Fullname"
    },
    "isActive": {
      "anyOf": [
        {
          "type": "boolean"
        },
        {
          "type": "null"
        }
      ],
      "title": "Isactive"
    }
  },
  "additionalProperties": false,
  "type": "object",
  "title": "UserUpdate"
}
```

### ValidationError {#validationerror}

```json
{
  "properties": {
    "loc": {
      "items": {
        "anyOf": [
          {
            "type": "string"
          },
          {
            "type": "integer"
          }
        ]
      },
      "type": "array",
      "title": "Location"
    },
    "msg": {
      "type": "string",
      "title": "Message"
    },
    "type": {
      "type": "string",
      "title": "Error Type"
    },
    "input": {
      "title": "Input"
    },
    "ctx": {
      "type": "object",
      "title": "Context"
    }
  },
  "type": "object",
  "required": [
    "loc",
    "msg",
    "type"
  ],
  "title": "ValidationError"
}
```
