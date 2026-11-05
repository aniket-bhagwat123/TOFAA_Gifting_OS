"""A tiny in-process cache whose entries expire after a few seconds.

Used for facts every request needs (who the user is, which clients a KAM may open, a tenant's
status). Entries are dropped after any successful write and also expire on their own, so a change
made through another server process shows up within ``ttl`` seconds.
"""

import threading
import time
from typing import Any

_MISSING = object()


class TTLCache:
    def __init__(self, max_entries: int = 2048) -> None:
        self._data: dict[Any, tuple[float, Any]] = {}
        self._lock = threading.Lock()
        self._max = max_entries

    def get(self, key: Any, ttl: float) -> Any:
        """The cached value, or the ``MISSING`` marker when absent or older than ``ttl``."""
        if ttl <= 0:
            return _MISSING
        entry = self._data.get(key)
        if entry is None or time.monotonic() - entry[0] > ttl:
            return _MISSING
        return entry[1]

    def set(self, key: Any, value: Any) -> None:
        with self._lock:
            if len(self._data) >= self._max:
                self._data.clear()  # simplest bound: start over rather than track recency
            self._data[key] = (time.monotonic(), value)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


MISSING = _MISSING
# One cache shared by the auth, tenant and credit checks; cleared together after any write.
lookups = TTLCache()
