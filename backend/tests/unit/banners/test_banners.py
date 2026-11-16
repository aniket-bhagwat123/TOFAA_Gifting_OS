from datetime import date
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from src.modules.banners.schemas import BannerCreate, BannerUpdate
from src.modules.banners.service import audience_allows, is_live
from src.modules.auth.rbac import Role


def actor(role):
    return SimpleNamespace(role=role)


def test_links_must_be_in_app_paths_or_https():
    assert BannerCreate(title="t", cta_url="/occasions").cta_url == "/occasions"
    assert BannerCreate(title="t", ctaUrl="https://example.com/x").cta_url == "https://example.com/x"
    assert BannerCreate(title="t", cta_url="  ").cta_url is None
    for bad in ("javascript:alert(1)", "//evil.com", "http://example.com", "data:text/html,x"):
        with pytest.raises(ValidationError):
            BannerCreate(title="t", cta_url=bad)
    with pytest.raises(ValidationError):
        BannerCreate(title="t", image_url="/local.png")  # pictures must be https


def test_end_date_cannot_precede_start_and_patch_needs_a_field():
    with pytest.raises(ValidationError):
        BannerCreate(title="t", starts_on=date(2026, 11, 10), ends_on=date(2026, 11, 1))
    with pytest.raises(ValidationError):
        BannerUpdate()
    with pytest.raises(ValidationError):
        BannerUpdate(title=None)  # title cannot be blanked


def test_is_live_respects_active_flag_and_schedule():
    today = date(2026, 11, 16)
    assert is_live({"is_active": True}, today)
    assert not is_live({"is_active": False}, today)
    assert not is_live({"is_active": True, "starts_on": "2026-11-17"}, today)
    assert not is_live({"is_active": True, "ends_on": "2026-11-15"}, today)
    assert is_live({"is_active": True, "starts_on": "2026-11-16", "ends_on": "2026-11-16"}, today)


def test_audience_targets_clients_or_staff():
    assert audience_allows("ALL", actor(Role.CLIENT)) and audience_allows("ALL", actor(Role.KAM))
    assert audience_allows("CLIENT", actor(Role.CLIENT)) and not audience_allows("CLIENT", actor(Role.KAM))
    assert audience_allows("STAFF", actor(Role.SUPER_ADMIN)) and not audience_allows("STAFF", actor(Role.CLIENT))
