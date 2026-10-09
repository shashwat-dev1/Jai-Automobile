"""
DSA OS — Database Engine, Session Factory, and Base Model
All application queries run as dsaos_app (non-owner, RLS enforced).
Migrations run as dsaos_migrator.
"""

import logging
from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)


def create_engine(settings: Settings | None = None) -> AsyncEngine:
    """Create the SQLAlchemy async engine for the application (dsaos_app role)."""
    if settings is None:
        settings = get_settings()

    engine = create_async_engine(
        settings.database_url,
        pool_size=settings.database_pool_size,
        max_overflow=settings.database_max_overflow,
        pool_timeout=settings.database_pool_timeout,
        pool_pre_ping=True,  # Detect stale connections
        echo=settings.app_debug,
        # JSON serializer — orjson for performance
        json_serializer=_json_serializer,
        json_deserializer=_json_deserializer,
    )
    return engine


def _json_serializer(obj: Any) -> str:
    """Use orjson for fast JSON serialization."""
    import orjson

    return orjson.dumps(obj).decode("utf-8")


def _json_deserializer(s: str) -> Any:
    """Use orjson for fast JSON deserialization."""
    import orjson

    return orjson.loads(s)


# Module-level engine and session factory
# Initialized lazily by the app startup lifespan
_engine: AsyncEngine | None = None
_async_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    """Return the application-level async engine."""
    global _engine
    if _engine is None:
        _engine = create_engine()
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the session factory."""
    global _async_session_factory
    if _async_session_factory is None:
        _async_session_factory = async_sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
            autocommit=False,
        )
    return _async_session_factory


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency: yields an AsyncSession per request.

    IMPORTANT: The org context (for RLS) is set by the TenantContextMiddleware
    BEFORE this session is used. Every tenant-scoped query is automatically
    filtered by the RLS policy.

    Do NOT call this directly for background tasks — use get_task_session() instead.
    """
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            try:
                await session.execute(text("SELECT set_config('app.current_org_id', '', false)"))
            except Exception:
                pass
            await session.close()


get_db = get_db_session


async def set_tenant_context(session: AsyncSession, org_id: str) -> None:
    """
    Set the PostgreSQL session-local org_id for RLS policy evaluation.

    Must be called before any tenant-scoped query in a transaction.
    RLS policies read: current_setting('app.current_org_id', true)

    Args:
        session: The active async session
        org_id: The organization UUID string
    """
    # Validate UUID format to prevent injection and use set_config which supports parameters
    import uuid as _uuid
    valid_org_id = str(_uuid.UUID(str(org_id)))
    await session.execute(
        text("SELECT set_config('app.current_org_id', :org_id, false)"),
        {"org_id": valid_org_id},
    )


# =============================================================================
# SQLAlchemy Declarative Base
# =============================================================================


class Base(DeclarativeBase):
    """SQLAlchemy declarative base for all DSA OS models."""

    pass
