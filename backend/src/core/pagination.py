"""Opaque cursor helpers shared by list APIs."""

from pydantic import BaseModel, ConfigDict, Field

from src.core.schema import to_camel


class PaginationMeta(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    page: int = Field(ge=1)
    limit: int = Field(ge=1)
    total_records: int = Field(alias="total_records", ge=0)


def next_page_cursor(page: int, limit: int, total_records: int) -> str | None:
    """Return the query values for the next page, or None when this is the last page."""
    if page * limit >= total_records:
        return None
    return f"page={page + 1}&limit={limit}"
