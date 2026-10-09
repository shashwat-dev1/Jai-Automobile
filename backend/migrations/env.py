"""
DSA OS — Alembic Environment Configuration (Async)

IMPORTANT:
- Migrations run as dsaos_migrator (table owner)
- Application runs as dsaos_app (non-owner, cannot bypass RLS)
- After creating tables, this env.py grants appropriate permissions to dsaos_app
"""

import asyncio
import os
from logging.config import fileConfig

from alembic import context

# Load all models so Alembic can detect schema changes
# Add new model imports here as modules are created
from app.database import Base
from app.modules.tenancy.models import Organization  # noqa: F401
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# Alembic Config object
config = context.config

# Set up Python logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadata for autogenerate support
target_metadata = Base.metadata


def get_migration_url() -> str:
    """
    Return the migration database URL (dsaos_migrator role).
    Prefer DATABASE_MIGRATION_URL env var over alembic.ini sqlalchemy.url.
    """
    url = os.environ.get("DATABASE_MIGRATION_URL")
    if url:
        return url
    return config.get_main_option("sqlalchemy.url", "")


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode (generates SQL without connecting).
    Useful for reviewing SQL before applying.
    """
    url = get_migration_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Execute migrations on a live connection."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations using an async engine."""
    url = get_migration_url()

    # Override the URL from environment
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = url

    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (connects to the database)."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
