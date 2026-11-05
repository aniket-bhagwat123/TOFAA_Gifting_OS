import time

import pytest

from src.core.concurrency import run_parallel
from src.modules.auth.service import AuthService


def test_run_parallel_keeps_order_and_overlaps_work():
    started = time.perf_counter()
    results = run_parallel(lambda: (time.sleep(0.2), "a")[1], lambda: (time.sleep(0.2), "b")[1], lambda: "c")
    assert results == ["a", "b", "c"]
    assert time.perf_counter() - started < 0.35  # one 0.2s wait, not two


def test_run_parallel_raises_the_first_error():
    def boom():
        raise ValueError("bad")

    with pytest.raises(ValueError):
        run_parallel(lambda: 1, boom)


@pytest.mark.parametrize(
    ("memberships", "expected"),
    [
        ({"tenant_id": "t1", "status": "ACTIVE", "tenants": {"status": "ACTIVE"}}, "t1"),
        ([{"tenant_id": "t1", "status": "ACTIVE", "tenants": {"status": "DEACTIVATED"}}], None),
        ([{"tenant_id": "t1", "status": "INVITED", "tenants": {"status": "ACTIVE"}}], None),
        (None, None),
        ([], None),
    ],
)
def test_active_tenant_needs_active_membership_and_active_tenant(memberships, expected):
    assert AuthService._active_tenant_from(memberships) == expected
