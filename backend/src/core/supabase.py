from functools import lru_cache

import httpx
from supabase import Client, ClientOptions, create_client

from src.core import telemetry
from src.core.config import settings


@lru_cache
def get_supabase_client() -> Client:
    """
    Returns a shared Supabase Client configured with the public Anon Key.
    Used for standard user operations and public access.
    """
    return create_client(
        supabase_url=settings.SUPABASE_URL,
        supabase_key=settings.SUPABASE_ANON_KEY,
    )


@lru_cache
def _shared_http_client() -> httpx.Client:
    """One connection pool for every database call: HTTP/2 (calls share a connection), connections
    kept open between requests (no new TLS handshake each time), and room for parallel queries."""
    return httpx.Client(
        http2=True,
        limits=httpx.Limits(max_connections=64, max_keepalive_connections=32, keepalive_expiry=120),
        timeout=httpx.Timeout(20.0, connect=5.0),
        follow_redirects=True,
        event_hooks={"request": [telemetry.on_request], "response": [telemetry.on_response]},
    )


@lru_cache
def get_supabase_admin_client() -> Client:
    """
    Returns a privileged Supabase Client configured with the Service Role Key.
    Bypasses Row Level Security (RLS) - strictly for backend administrative operations.
    Database (PostgREST) calls go through the shared, tuned connection pool; sign-in and storage
    keep the library's own clients, so only the hot path changes.
    """
    client = create_client(
        supabase_url=settings.SUPABASE_URL,
        supabase_key=settings.SUPABASE_SERVICE_ROLE_KEY,
        options=ClientOptions(
            auto_refresh_token=False,
            persist_session=False,
        ),
    )
    client.postgrest.session = _shared_http_client()
    return client


def get_user_supabase_client(access_token: str) -> Client:
    """
    Returns a scoped Supabase Client authenticated with the end-user's access token,
    ensuring all database operations strictly enforce Row Level Security (RLS) for that user.
    """
    client = create_client(
        supabase_url=settings.SUPABASE_URL,
        supabase_key=settings.SUPABASE_ANON_KEY,
    )
    client.postgrest.auth(access_token)
    return client
