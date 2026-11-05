"""Per-request counters: how many Supabase calls a request made and how long they took.

The shared HTTP client reports every call here. The middleware reads the totals to log them and to
send a ``Server-Timing`` header, so any screen's speed can be read straight from the browser.
"""

import time
from contextvars import ContextVar
from typing import Any

# A mutable dict, not numbers, so worker threads that copy the context still add to the same totals.
_current: ContextVar[dict[str, Any] | None] = ContextVar("request_timing", default=None)


def begin() -> dict[str, Any]:
    stats: dict[str, Any] = {"calls": 0, "db_seconds": 0.0, "started": time.perf_counter()}
    _current.set(stats)
    return stats


def on_request(request: Any) -> None:
    request.extensions["started"] = time.perf_counter()


def on_response(response: Any) -> None:
    stats = _current.get()
    started = response.request.extensions.get("started")
    if stats is not None and started is not None:
        stats["calls"] += 1  # += on a dict value is not atomic, but a lost count is harmless here
        stats["db_seconds"] += time.perf_counter() - started


def summarize(stats: dict[str, Any]) -> tuple[int, float, float]:
    """(Supabase calls, milliseconds waiting on them added up, total request milliseconds)."""
    return stats["calls"], stats["db_seconds"] * 1000, (time.perf_counter() - stats["started"]) * 1000
