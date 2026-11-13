"""Errors that carry data for the client, such as the record someone else just saved."""

from typing import Any

from fastapi import HTTPException


class ApiError(HTTPException):
    """An HTTP error whose ``data`` goes into the standard response envelope next to the message."""

    def __init__(self, status_code: int, message: str, data: dict[str, Any] | None = None) -> None:
        super().__init__(status_code=status_code, detail=message)
        self.data = data or {}
