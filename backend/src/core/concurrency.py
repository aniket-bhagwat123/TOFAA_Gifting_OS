"""Run independent blocking calls (database queries) at the same time.

The Supabase client is synchronous. A route that needs several unrelated queries would wait for
each one in turn; this runs them side by side so the request takes as long as the slowest one.
"""

import contextvars
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

_pool = ThreadPoolExecutor(max_workers=32, thread_name_prefix="db-parallel")


def run_parallel(*calls: Callable[[], Any]) -> list[Any]:
    """Call every function at once and return the results in the same order. The first error is raised."""
    if len(calls) == 1:
        return [calls[0]()]
    # Each call runs in a copy of this request's context, so per-request timing and audit still see it.
    futures = [_pool.submit(contextvars.copy_context().run, call) for call in calls]
    return [future.result() for future in futures]
