"""
DSA OS — pytest configuration and shared fixtures

All tests use an isolated in-memory or test database.
Never use real customer data. All test data is obviously synthetic.
"""

import asyncio
import os
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Force test environment settings
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://dsaos_app:dev_app_pg_password_change_me@localhost:5432/dsaos_test",
)
os.environ.setdefault(
    "DATABASE_MIGRATION_URL",
    "postgresql+asyncpg://dsaos_migrator:dev_pg_password_change_me@localhost:5432/dsaos_test",
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")  # DB 1 for tests
os.environ.setdefault("MINIO_ENDPOINT", "localhost:9000")
os.environ.setdefault("MINIO_ACCESS_KEY", "dev_minio_access_key")
os.environ.setdefault("MINIO_SECRET_KEY", "dev_minio_secret_key")
os.environ.setdefault("JWT_PRIVATE_KEY_PATH", "./keys/jwt_private.pem")
os.environ.setdefault("JWT_PUBLIC_KEY_PATH", "./keys/jwt_public.pem")

# Ensure all SQLAlchemy declarative models are imported and registered
import app.modules.audit.models  # noqa: E402, F401
import app.modules.auth.models  # noqa: E402, F401
import app.modules.cases.models  # noqa: E402, F401
import app.modules.documents.models  # noqa: E402, F401
import app.modules.lenders.models  # noqa: E402, F401
import app.modules.parties.models  # noqa: E402, F401
import app.modules.payout.models  # noqa: E402, F401
import app.modules.payout.reconciliation.models  # noqa: E402, F401
import app.modules.pdd.models  # noqa: E402, F401
import app.modules.sources.models  # noqa: E402, F401
import app.modules.tenancy.models  # noqa: E402, F401
import app.modules.workflow.models  # noqa: E402, F401


@pytest.fixture(scope="session")
def event_loop_policy():
    """Use the default asyncio event loop policy."""
    return asyncio.DefaultEventLoopPolicy()


@pytest_asyncio.fixture(scope="session")
async def test_app():
    """Create the FastAPI test application."""
    from app.main import create_app

    app = create_app()
    return app


@pytest_asyncio.fixture(scope="function")
async def client(test_app) -> AsyncGenerator[AsyncClient, None]:
    """
    Async HTTP test client for FastAPI endpoints.
    Each test function gets a fresh client with its own lifespan context.
    """
    async with AsyncClient(
        transport=ASGITransport(app=test_app),
        base_url="http://testserver",
        headers={"X-Request-ID": "test-request-id-12345"},
    ) as ac:
        yield ac
