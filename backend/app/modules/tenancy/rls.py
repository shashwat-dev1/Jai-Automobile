"""
DSA OS — PostgreSQL Row-Level Security Integration

Provides database session-level tenant isolation binding via `app.current_org_id`.
"""

import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def set_session_tenant_context(session: AsyncSession, org_id: uuid.UUID | str) -> None:
    """
    Set PostgreSQL session variable `app.current_org_id`.
    This activates PostgreSQL Row Level Security (RLS) policies for tenant isolation.
    Uses set_config(..., false) so the setting persists across commits within the session.
    """
    org_uuid_str = str(org_id)
    # Validate UUID format to prevent SQL injection
    uuid.UUID(org_uuid_str)

    await session.execute(
        text("SELECT set_config('app.current_org_id', :org_id, false)"),
        {"org_id": org_uuid_str},
    )


async def clear_session_tenant_context(session: AsyncSession) -> None:
    """Clear app.current_org_id in PostgreSQL session."""
    await session.execute(
        text("SELECT set_config('app.current_org_id', '', false)")
    )

