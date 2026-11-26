"""On Vercel the CRM's change notice finishes the sync before replying; elsewhere it runs in the background."""
import pytest

from src.core.config import settings
from src.modules.crm_people import router

KEY = "k" * 40


@pytest.mark.parametrize("vercel,expected", [("1", "now"), (None, "background")])
def test_how_the_notice_syncs(monkeypatch, vercel, expected):
    ran = []
    monkeypatch.setattr(settings, "CRM_API_KEY", KEY)
    monkeypatch.setattr(router.people_mirror, "catch_up_safely", lambda: ran.append("now"))
    monkeypatch.setattr(router.people_mirror, "catch_up_in_background", lambda: ran.append("background"))
    if vercel:
        monkeypatch.setenv("VERCEL", vercel)
    else:
        monkeypatch.delenv("VERCEL", raising=False)
    router.people_changed(KEY)
    assert ran == [expected]
