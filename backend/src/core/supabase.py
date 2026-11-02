from functools import lru_cache
from supabase import Client, ClientOptions, create_client
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
def get_supabase_admin_client() -> Client:
    """
    Returns a privileged Supabase Client configured with the Service Role Key.
    Bypasses Row Level Security (RLS) - strictly for backend administrative operations.
    """
    return create_client(
        supabase_url=settings.SUPABASE_URL,
        supabase_key=settings.SUPABASE_SERVICE_ROLE_KEY,
        options=ClientOptions(
            auto_refresh_token=False,
            persist_session=False,
        ),
    )


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
