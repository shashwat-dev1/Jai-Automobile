"""
DSA OS — Pagination Utilities

Provides offset-based and cursor-based pagination helpers.
"""

import base64
import json
from datetime import datetime
from typing import Any, TypeVar, cast
from uuid import UUID

from app.shared.schemas import CursorPaginationMeta, PaginationMeta

T = TypeVar("T")

DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 100
MIN_PAGE_SIZE = 1


def validate_page_params(page: int, page_size: int) -> tuple[int, int]:
    """Validate and clamp pagination parameters."""
    page = max(1, page)
    page_size = max(MIN_PAGE_SIZE, min(MAX_PAGE_SIZE, page_size))
    return page, page_size


def compute_offset(page: int, page_size: int) -> int:
    """Convert page/page_size to SQL OFFSET."""
    return (page - 1) * page_size


def build_pagination_meta(total: int, page: int, page_size: int) -> PaginationMeta:
    """Build pagination metadata from total count and current page."""
    return PaginationMeta(
        total=total,
        page=page,
        page_size=page_size,
        has_next=(page * page_size) < total,
        has_prev=page > 1,
    )


# =============================================================================
# Cursor-based pagination
# Cursor encodes: { "id": "<uuid>", "created_at": "<iso8601>" }
# =============================================================================


def encode_cursor(record_id: UUID | str, created_at: datetime) -> str:
    """Encode a pagination cursor from a record's id and created_at."""
    payload = {
        "id": str(record_id),
        "created_at": created_at.isoformat(),
    }
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()


def decode_cursor(cursor: str) -> dict[str, Any]:
    """
    Decode a pagination cursor.
    Returns dict with 'id' and 'created_at' keys.
    Raises ValueError if cursor is malformed.
    """
    try:
        decoded = base64.urlsafe_b64decode(cursor.encode()).decode()
        payload = json.loads(decoded)
        if not isinstance(payload, dict) or "id" not in payload or "created_at" not in payload:
            raise ValueError("Invalid cursor structure")
        return cast(dict[str, Any], payload)
    except Exception as e:
        raise ValueError(f"Invalid pagination cursor: {e}") from e


def build_cursor_meta(
    items: list[Any],
    page_size: int,
    next_cursor: str | None,
    prev_cursor: str | None,
) -> CursorPaginationMeta:
    """Build cursor pagination metadata."""
    return CursorPaginationMeta(
        next_cursor=next_cursor,
        prev_cursor=prev_cursor,
        has_next=next_cursor is not None,
        has_prev=prev_cursor is not None,
        page_size=page_size,
    )
