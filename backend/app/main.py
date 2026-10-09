"""
DSA OS — FastAPI Application Factory

Assembles the full application: middleware stack, routers, lifespan, error handlers.
All API routes are versioned under /api/v1/.
"""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import get_engine, get_session_factory
from app.middleware.request_id import RequestIDMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.shared.exceptions import (
    AuthenticationError,
    BusinessRuleViolationError,
    ConflictError,
    DsaOsError,
    NotFoundError,
    PermissionDeniedError,
    StateTransitionError,
    ValidationError,
)
from app.shared.schemas import ApiError, ErrorDetail

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Application state (set during lifespan)
# ---------------------------------------------------------------------------
_redis_client: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis | None:
    """Return the application Redis client if initialized."""
    return _redis_client


# ---------------------------------------------------------------------------
# Lifespan: startup and shutdown
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application startup and graceful shutdown."""
    global _redis_client

    settings = get_settings()
    logger.info("Starting DSA OS backend (env=%s)", settings.app_env)

    # Initialize database engine (validates connection pool)
    engine = get_engine()
    get_session_factory()  # Warm up session factory

    # Initialize Redis (graceful degradation if not available)
    try:
        client = aioredis.from_url(  # type: ignore[no-untyped-call]
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            max_connections=20,
        )
        await client.ping()
        _redis_client = client
        app.state.redis = client
        logger.info("Redis connected")
    except Exception as exc:
        logger.warning("Redis connection failed (%s); operating with direct database queries", exc)
        _redis_client = None
        app.state.redis = None

    logger.info("DSA OS backend ready")
    yield

    # Shutdown
    logger.info("Shutting down DSA OS backend")
    if _redis_client:
        await _redis_client.aclose()
    await engine.dispose()
    logger.info("DSA OS backend stopped")


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="DSA OS API",
        description=(
            "Multi-tenant vehicle-loan operations platform for DSAs in India. "
            "Manages the full lifecycle: Lead → Case → Lender Applications → "
            "Disbursement → PDD → Payout → Reconciliation."
        ),
        version=settings.app_version,
        docs_url="/api/docs" if settings.app_env != "production" else None,
        redoc_url="/api/redoc" if settings.app_env != "production" else None,
        openapi_url="/api/openapi.json" if settings.app_env != "production" else None,
        lifespan=lifespan,
    )

    # -------------------------------------------------------------------------
    # Middleware (order matters — outermost runs first on request, last on response)
    # -------------------------------------------------------------------------

    # 1. Request ID (outermost — must be first to propagate through all layers)
    app.add_middleware(RequestIDMiddleware)

    # 2. Security headers
    app.add_middleware(
        SecurityHeadersMiddleware,
        is_production=(settings.app_env == "production"),
    )

    # 3. CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )

    # -------------------------------------------------------------------------
    # Exception handlers
    # -------------------------------------------------------------------------
    _register_exception_handlers(app)

    # -------------------------------------------------------------------------
    # Routers
    # -------------------------------------------------------------------------
    from app.modules.audit.router import router as audit_router
    from app.modules.auth.router import router as auth_router
    from app.modules.cases.router import router as cases_router
    from app.modules.documents.router import router as documents_router
    from app.modules.import_export.router import router as import_router
    from app.modules.lenders.router import router as lenders_router
    from app.modules.notifications.engine import register_notification_handlers
    from app.modules.notifications.router import router as notifications_router
    from app.modules.parties.router import router as parties_router
    from app.modules.payout.reconciliation.router import router as reconciliation_router
    from app.modules.payout.router import router as payout_router
    from app.modules.pdd.router import router as pdd_router
    from app.modules.privacy.router import router as privacy_router
    from app.modules.reports.router import router as reports_router
    from app.modules.sources.router import router as sources_router
    from app.modules.workflow.router import router as workflow_router
    from app.routers.api_root import router as api_root_router
    from app.routers.health import router as health_router

    register_notification_handlers()

    app.include_router(health_router)
    app.include_router(api_root_router, prefix="/api/v1")
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(audit_router, prefix="/api/v1")
    app.include_router(reports_router, prefix="/api/v1")
    app.include_router(parties_router, prefix="/api/v1")
    app.include_router(sources_router, prefix="/api/v1")
    app.include_router(cases_router, prefix="/api/v1")
    app.include_router(documents_router, prefix="/api/v1")
    app.include_router(lenders_router, prefix="/api/v1")
    app.include_router(workflow_router, prefix="/api/v1")
    app.include_router(pdd_router, prefix="/api/v1")
    app.include_router(payout_router, prefix="/api/v1")
    app.include_router(reconciliation_router, prefix="/api/v1")
    app.include_router(notifications_router, prefix="/api/v1")
    app.include_router(privacy_router, prefix="/api/v1")
    app.include_router(import_router, prefix="/api/v1")

    return app


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------


def _register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers that translate domain exceptions to HTTP responses."""

    @app.exception_handler(NotFoundError)
    async def not_found_handler(request: Request, exc: NotFoundError) -> JSONResponse:
        return _error_response(request, status.HTTP_404_NOT_FOUND, exc)

    @app.exception_handler(PermissionDeniedError)
    async def permission_denied_handler(
        request: Request, exc: PermissionDeniedError
    ) -> JSONResponse:
        return _error_response(request, status.HTTP_403_FORBIDDEN, exc)

    @app.exception_handler(AuthenticationError)
    async def authentication_handler(request: Request, exc: AuthenticationError) -> JSONResponse:
        return _error_response(request, status.HTTP_401_UNAUTHORIZED, exc)

    @app.exception_handler(ConflictError)
    async def conflict_handler(request: Request, exc: ConflictError) -> JSONResponse:
        return _error_response(request, status.HTTP_409_CONFLICT, exc)

    from pydantic import ValidationError as PydanticValidationError

    @app.exception_handler(PydanticValidationError)
    async def pydantic_validation_handler(request: Request, exc: PydanticValidationError) -> JSONResponse:
        req_id = getattr(request.state, "request_id", "unknown")
        errors = exc.errors()
        first_err = errors[0] if errors else {}
        field = ".".join(str(loc) for loc in first_err.get("loc", []))
        msg = first_err.get("msg", "Validation error")
        formatted_msg = f"{field}: {msg}" if field else msg
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=ApiError(
                error=ErrorDetail(
                    code="VALIDATION_ERROR",
                    message=formatted_msg,
                    details=[{"field": ".".join(str(l) for l in e.get("loc", [])), "message": e.get("msg")} for e in errors],
                ),
                request_id=req_id,
            ).model_dump(mode="json"),
        )

    @app.exception_handler(ValidationError)
    async def validation_handler(request: Request, exc: ValidationError) -> JSONResponse:
        return _error_response(request, status.HTTP_422_UNPROCESSABLE_ENTITY, exc)

    @app.exception_handler(BusinessRuleViolationError)
    async def business_rule_handler(
        request: Request, exc: BusinessRuleViolationError
    ) -> JSONResponse:
        return _error_response(request, status.HTTP_422_UNPROCESSABLE_ENTITY, exc)

    @app.exception_handler(StateTransitionError)
    async def state_transition_handler(request: Request, exc: StateTransitionError) -> JSONResponse:
        return _error_response(request, status.HTTP_422_UNPROCESSABLE_ENTITY, exc)

    @app.exception_handler(DsaOsError)
    async def dsaos_error_handler(request: Request, exc: DsaOsError) -> JSONResponse:
        """Catch-all for unhandled domain errors."""
        req_id = getattr(request.state, "request_id", "unknown")
        logger.exception("Unhandled domain error for request %s", req_id)
        return _error_response(request, status.HTTP_500_INTERNAL_SERVER_ERROR, exc)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        """
        Final safety net. Never expose internal details to the caller.
        All exceptions are logged with request ID for correlation.
        """
        request_id = getattr(request.state, "request_id", "unknown")
        logger.exception("Unhandled exception for request_id=%s", request_id)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ApiError(
                error=ErrorDetail(
                    code="INTERNAL_ERROR",
                    message="An unexpected error occurred. Contact support with your request ID.",
                ),
                request_id=request_id,
            ).model_dump(mode="json"),
        )


def _error_response(request: Request, status_code: int, exc: DsaOsError) -> JSONResponse:
    """Build a standardized error JSON response."""
    request_id = getattr(request.state, "request_id", None)
    return JSONResponse(
        status_code=status_code,
        content=ApiError(
            error=ErrorDetail(
                code=exc.code,
                message=exc.message,
                details=[exc.details] if exc.details else None,
            ),
            request_id=request_id,
        ).model_dump(mode="json"),
    )


# ---------------------------------------------------------------------------
# Application instance
# ---------------------------------------------------------------------------
app = create_app()
