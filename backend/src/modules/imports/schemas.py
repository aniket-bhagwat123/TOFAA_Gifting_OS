"""Import history: one batch per file imported, and what it created."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.core.pagination import PaginationMeta
from src.core.schema import to_camel


class _Body(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid", str_strip_whitespace=True)


class ImportBatchStart(_Body):
    file_name: str | None = Field(default=None, max_length=255)
    total_rows: int = Field(default=0, ge=0, le=100_000)


class ImportBatchFinish(_Body):
    created_count: int = Field(ge=0, le=100_000)
    failed_count: int = Field(default=0, ge=0, le=100_000)
    groups_created: list[UUID] = Field(default_factory=list, max_length=500)
    groups_updated: int = Field(default=0, ge=0, le=100_000)


class ImportBatchRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    kind: str = "RECIPIENTS"
    file_name: str | None = None
    total_rows: int = 0
    created_count: int = 0
    failed_count: int = 0
    groups_created: list[str] = Field(default_factory=list)
    groups_updated: int = 0
    status: Literal["ACTIVE", "REVERTED"] = "ACTIVE"
    created_by_name: str | None = None
    created_at: datetime | None = None
    reverted_at: datetime | None = None
    reverted_by_name: str | None = None


class ImportBatchList(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[ImportBatchRead]
    pagination: PaginationMeta
    next_cursor: str | None = None


class RevertResult(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    recipients_removed: int
    groups_removed: int
