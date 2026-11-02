import pytest
from fastapi import HTTPException

from src.modules.tenants.service import TenantService


def test_normalize_domain_cleans_email_domain():
    assert TenantService._normalize_domain(" @ApexGlobal.COM. ") == "apexglobal.com"


@pytest.mark.parametrize("domain", ["", "invalid", "two words.com"])
def test_normalize_domain_rejects_invalid_value(domain):
    with pytest.raises(HTTPException) as exc:
        TenantService._normalize_domain(domain)
    assert exc.value.status_code == 422
