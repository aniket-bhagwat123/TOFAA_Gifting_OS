"""Shared Pydantic schema conventions."""

from typing import Generic, TypeVar

from pydantic import BaseModel


ResponseData = TypeVar("ResponseData")


class ApiResponse(BaseModel, Generic[ResponseData]):
    """Standard envelope for API mutations."""

    data: ResponseData
    message: str


def to_camel(value: str) -> str:
    """Convert a Python snake_case field to the public camelCase API form."""
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)
