"""
DSA OS — Health Check Endpoints

GET /health — Liveness probe (is the process alive?)
GET /health/ready — Readiness probe (can the process serve traffic?)

These endpoints check all critical dependencies:
- PostgreSQL (database)
- Redis (cache/queue)
- MinIO (object storage)

IMPORTANT: Never include sensitive information in health responses.
These endpoints should be accessible without authentication
(monitoring systems need them), but they must not leak internal details.
"""

import logging
import time
from datetime import UTC, datetime

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.shared.schemas import HealthResponse, ServiceHealth

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Liveness probe",
    description="Returns 200 if the application process is running. Does not check dependencies.",
)
async def health_liveness() -> HealthResponse:
    """Liveness probe — returns 200 if the process is alive."""
    settings = get_settings()
    return HealthResponse(
        status="ok",
        version=settings.app_version,
        environment=settings.app_env,
        database=ServiceHealth(status="unknown"),
        redis=ServiceHealth(status="unknown"),
        storage=ServiceHealth(status="unknown"),
        timestamp=datetime.now(UTC),
    )


@router.get(
    "/health/ready",
    response_model=HealthResponse,
    summary="Readiness probe",
    description="Returns 200 if the application can serve traffic (all dependencies healthy).",
)
async def health_readiness() -> JSONResponse:
    """
    Readiness probe — checks database, Redis, and storage connectivity.
    Returns 200 if all critical dependencies are available.
    Returns 503 if any dependency is unavailable.
    """
    settings = get_settings()
    results: dict[str, ServiceHealth] = {}
    overall_ok = True

    # --- Check PostgreSQL ---
    db_health = await _check_database()
    results["database"] = db_health
    if db_health.status != "ok":
        overall_ok = False

    # --- Check Redis ---
    redis_health = await _check_redis()
    results["redis"] = redis_health
    if redis_health.status != "ok":
        overall_ok = False

    # --- Check MinIO ---
    storage_health = await _check_storage()
    results["storage"] = storage_health
    if storage_health.status != "ok":
        overall_ok = False

    response_data = HealthResponse(
        status="ok" if overall_ok else "degraded",
        version=settings.app_version,
        environment=settings.app_env,
        database=results["database"],
        redis=results["redis"],
        storage=results["storage"],
        timestamp=datetime.now(UTC),
    )

    status_code = 200 if overall_ok else 503
    return JSONResponse(
        status_code=status_code,
        content=response_data.model_dump(mode="json"),
    )


async def _check_database() -> ServiceHealth:
    """Check PostgreSQL connectivity."""
    import asyncio

    from sqlalchemy import text

    from app.database import get_engine

    start = time.monotonic()
    try:
        async with asyncio.timeout(0.5):
            engine = get_engine()
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
        latency_ms = (time.monotonic() - start) * 1000
        return ServiceHealth(status="ok", latency_ms=round(latency_ms, 2))
    except Exception as e:
        logger.warning("Database health check failed: %s", type(e).__name__)
        return ServiceHealth(status="down", detail="Database connection failed")


async def _check_redis() -> ServiceHealth:
    """Check Redis connectivity."""
    import asyncio

    start = time.monotonic()
    try:
        async with asyncio.timeout(0.5):
            from app.main import get_redis

            redis = get_redis()
            if redis is None:
                return ServiceHealth(status="degraded", detail="Redis not configured or offline")
            await redis.ping()
        latency_ms = (time.monotonic() - start) * 1000
        return ServiceHealth(status="ok", latency_ms=round(latency_ms, 2))
    except Exception as e:
        logger.warning("Redis health check failed: %s", type(e).__name__)
        return ServiceHealth(status="down", detail="Redis connection failed")


async def _check_storage() -> ServiceHealth:
    """Check MinIO/object storage connectivity."""
    import asyncio

    import urllib3

    start = time.monotonic()
    try:
        async with asyncio.timeout(0.5):
            from minio import Minio

            settings = get_settings()
            http_client = urllib3.PoolManager(
                timeout=urllib3.Timeout(connect=0.5, read=0.5), retries=False
            )
            client = Minio(
                settings.minio_endpoint,
                access_key=settings.minio_access_key,
                secret_key=settings.minio_secret_key,
                secure=settings.minio_secure,
                http_client=http_client,
            )
            # list_buckets() is a lightweight connectivity check
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, client.list_buckets)
        latency_ms = (time.monotonic() - start) * 1000
        return ServiceHealth(status="ok", latency_ms=round(latency_ms, 2))
    except Exception as e:
        logger.warning("Storage health check failed: %s", type(e).__name__)
        return ServiceHealth(status="down", detail="Object storage connection failed")
