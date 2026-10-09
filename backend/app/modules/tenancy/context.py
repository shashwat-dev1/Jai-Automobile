"""
DSA OS — Tenancy Context Management

Uses contextvars to maintain request-scoped tenant isolation context.
"""

import uuid
from contextvars import ContextVar

_current_org_id: ContextVar[uuid.UUID | None] = ContextVar("current_org_id", default=None)
_current_user_id: ContextVar[uuid.UUID | None] = ContextVar("current_user_id", default=None)
_current_user_role: ContextVar[str | None] = ContextVar("current_user_role", default=None)


def get_current_org_id() -> uuid.UUID | None:
    """Return the currently scoped organization ID for this async request context."""
    return _current_org_id.get()


def set_current_org_id(org_id: uuid.UUID | str | None) -> None:
    """Set the scoped organization ID."""
    if isinstance(org_id, str):
        org_id = uuid.UUID(org_id)
    _current_org_id.set(org_id)


def get_current_user_id() -> uuid.UUID | None:
    """Return the currently authenticated user ID."""
    return _current_user_id.get()


def set_current_user_id(user_id: uuid.UUID | str | None) -> None:
    """Set the current user ID."""
    if isinstance(user_id, str):
        user_id = uuid.UUID(user_id)
    _current_user_id.set(user_id)


def get_current_user_role() -> str | None:
    """Return the role of the currently authenticated user."""
    return _current_user_role.get()


def set_current_user_role(role: str | None) -> None:
    """Set the role of the current user."""
    _current_user_role.set(role)


def clear_tenant_context() -> None:
    """Reset all tenant context variables."""
    _current_org_id.set(None)
    _current_user_id.set(None)
    _current_user_role.set(None)
