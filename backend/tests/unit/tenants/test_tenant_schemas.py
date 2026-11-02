import pytest
from pydantic import ValidationError

from src.modules.tenants.schemas import TenantCreate, TenantUpdate


def test_tenant_create_accepts_valid_tenant():
    tenant = TenantCreate(tenantType="ORGANIZATION", name="Apex Global")
    assert tenant.name == "Apex Global"


def test_tenant_update_requires_non_empty_patch():
    with pytest.raises(ValidationError):
        TenantUpdate()


def test_tenant_update_does_not_allow_null_name():
    with pytest.raises(ValidationError):
        TenantUpdate(name=None)
