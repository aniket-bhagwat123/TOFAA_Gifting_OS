# Backend tests

Run the full test suite from `backend/`:

```powershell
uv run pytest
```

Run unit tests only:

```powershell
uv run pytest tests/unit
```

Run API end-to-end tests only:

```powershell
uv run pytest -m e2e
```

Unit tests are grouped by module under `tests/unit/`. The `e2e` tests send HTTP
requests through the FastAPI ASGI app and verify authentication, request
validation, status codes, and response envelopes. Supabase and Resend calls are
stubbed at the service boundary so these tests need no live credentials and
cannot change external data. Use a dedicated Supabase test project for any
future tests that exercise real database migrations or email delivery.
