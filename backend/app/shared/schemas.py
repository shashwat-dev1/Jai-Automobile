"""
DSA OS — Common Pydantic Schemas

Defines the standard API response envelope, error schemas, and pagination types.
All API responses must use these envelopes for consistency.
"""

from datetime import datetime
from typing import Any, Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, Field

T = TypeVar("T")


# =============================================================================
# API Response Envelope
# =============================================================================


class ApiResponse(BaseModel, Generic[T]):
    """
    Standard API response envelope.

    All successful API responses are wrapped in this envelope.
    Example:
        {
            "success": true,
            "data": { ... },
            "meta": null
        }
    """

    success: bool = True
    data: T
    meta: dict[str, Any] | BaseModel | None = None


class ApiError(BaseModel):
    """
    Standard API error response.

    All error responses use this shape. Never expose internal details.
    Example:
        {
            "success": false,
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Validation failed",
                "details": [...]
            },
            "request_id": "req_abc123"
        }
    """

    success: bool = False
    error: "ErrorDetail"
    request_id: str | None = None


class ErrorDetail(BaseModel):
    """Structured error detail."""

    code: str
    message: str
    details: list[dict[str, Any]] | None = None


# =============================================================================
# Pagination
# =============================================================================


class PaginationMeta(BaseModel):
    """Pagination metadata included in list responses."""

    total: int
    page: int
    page_size: int
    has_next: bool
    has_prev: bool


class PaginatedResponse(BaseModel, Generic[T]):
    """
    Paginated list response.

    Example:
        {
            "success": true,
            "data": [...],
            "pagination": {
                "total": 100,
                "page": 1,
                "page_size": 25,
                "has_next": true,
                "has_prev": false
            }
        }
    """

    success: bool = True
    data: list[T]
    pagination: PaginationMeta


# =============================================================================
# Cursor-based Pagination (for large datasets)
# =============================================================================


class CursorPaginationMeta(BaseModel):
    """Cursor-based pagination metadata for large, sorted result sets."""

    next_cursor: str | None = None
    prev_cursor: str | None = None
    has_next: bool = False
    has_prev: bool = False
    page_size: int


class CursorPaginatedResponse(BaseModel, Generic[T]):
    """Cursor-paginated list response."""

    success: bool = True
    data: list[T]
    pagination: CursorPaginationMeta


# =============================================================================
# Common field schemas
# =============================================================================


class AuditMeta(BaseModel):
    """Common audit fields included in domain entity responses."""

    created_at: datetime
    updated_at: datetime
    created_by: UUID | None = None
    updated_by: UUID | None = None


class VersionedEntity(BaseModel):
    """Mixin for responses that include optimistic-locking version."""

    version: int = Field(description="Optimistic locking version. Include in update requests.")


# =============================================================================
# Health check schemas
# =============================================================================


class ServiceHealth(BaseModel):
    """Health status of a single dependency."""

    status: str  # "ok" | "degraded" | "down"
    latency_ms: float | None = None
    detail: str | None = None


class HealthResponse(BaseModel):
    """Response for GET /health and GET /health/ready."""

    status: str  # "ok" | "degraded" | "down"
    version: str
    environment: str
    database: ServiceHealth
    redis: ServiceHealth
    storage: ServiceHealth
    timestamp: datetime
