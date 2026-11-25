"""Dashboard banners read from TOFAA CRM: the key is sent server side, bad data is dropped, failures show no banners."""
import httpx
import pytest

from src.core.config import settings
from src.modules.crm_banners import service
from src.modules.crm_banners.service import CrmBannerSource

KEY = "k" * 40


@pytest.fixture
def crm(monkeypatch):
    monkeypatch.setattr(settings, "CRM_API_URL", "https://crm.example.com/")
    monkeypatch.setattr(settings, "CRM_API_KEY", KEY)
    calls = []

    def answer(status=200, body=None, error=None):
        def fake_get(url, **kwargs):
            calls.append((url, kwargs))
            if error:
                raise error
            return httpx.Response(status, json=body, request=httpx.Request("GET", url))
        monkeypatch.setattr(service.httpx, "get", fake_get)

    return answer, calls


def test_sends_the_key_in_a_header_and_never_follows_redirects(crm):
    answer, calls = crm
    answer(body={"data": [{"id": "1", "title": "Diwali", "sortOrder": 0, "imageUrl": "https://x.supabase.co/a?token=t"}]})
    banners = CrmBannerSource().live()
    assert [(b.id, b.title, b.image_url) for b in banners] == [("1", "Diwali", "https://x.supabase.co/a?token=t")]
    url, kwargs = calls[0]
    assert url == "https://crm.example.com/api/v1/integrations/banners"
    assert kwargs["headers"]["X-API-Key"] == KEY
    assert kwargs["follow_redirects"] is False
    assert KEY not in url


def test_drops_unsafe_or_broken_items(crm):
    answer, _ = crm
    answer(body={"data": [
        {"id": "1", "imageUrl": "javascript:alert(1)"},
        {"id": "2", "imageUrl": "data:image/png;base64,AAAA"},
        {"id": "3"},
        "not an object",
        {"id": "4", "imageUrl": "https://x.supabase.co/ok"},
    ]})
    assert [b.id for b in CrmBannerSource().live()] == ["4"]


@pytest.mark.parametrize("kwargs", [
    {"status": 401, "body": {"data": None, "message": "A valid API key is required."}},
    {"status": 500, "body": {}},
    {"error": httpx.ConnectError("refused")},
    {"error": httpx.ReadTimeout("slow")},
    {"status": 200, "body": {"data": "oops"}},
])
def test_any_crm_failure_means_no_banners_not_an_error(crm, kwargs):
    answer, _ = crm
    answer(**kwargs)
    assert CrmBannerSource().live() == []


def test_not_configured_makes_no_call(crm, monkeypatch):
    answer, calls = crm
    answer(body={"data": []})
    monkeypatch.setattr(settings, "CRM_API_KEY", None)
    assert CrmBannerSource().live() == [] and calls == []


def test_by_default_every_load_asks_the_crm(crm):
    """A banner uploaded or deleted in the CRM must show on the very next dashboard load."""
    answer, calls = crm
    answer(body={"data": [{"id": "1", "imageUrl": "https://x.supabase.co/a"}]})
    source = CrmBannerSource()
    assert settings.CRM_BANNERS_CACHE_SECONDS == 0
    assert [b.id for b in source.live()] == ["1"]
    answer(body={"data": []})  # deleted in the CRM
    assert source.live() == []
    assert len(calls) == 2


def test_answer_is_remembered_when_a_cache_time_is_set(crm, monkeypatch):
    answer, calls = crm
    monkeypatch.setattr(settings, "CRM_BANNERS_CACHE_SECONDS", 10)
    answer(body={"data": [{"id": "1", "imageUrl": "https://x.supabase.co/a"}]})
    source = CrmBannerSource()
    source.live()
    source.live()
    assert len(calls) == 1
    source.clear()
    source.live()
    assert len(calls) == 2


def test_production_refuses_plain_http_or_a_weak_key(monkeypatch):
    from src.core.config import Settings

    good = dict(
        ENVIRONMENT="production", SUPABASE_URL="https://p.supabase.co", SUPABASE_ANON_KEY="a", SUPABASE_SERVICE_ROLE_KEY="s",
        SUPABASE_JWT_SECRET="j" * 40, FRONTEND_URL="https://app.example.com", BACKEND_CORS_ORIGINS=["https://app.example.com"],
    )
    Settings(**good, CRM_API_URL="https://crm.example.com", CRM_API_KEY=KEY)
    with pytest.raises(ValueError, match="CRM_API_URL must use https"):
        Settings(**good, CRM_API_URL="http://crm.example.com", CRM_API_KEY=KEY)
    with pytest.raises(ValueError, match="CRM_API_KEY"):
        Settings(**good, CRM_API_URL="https://crm.example.com", CRM_API_KEY="short")
