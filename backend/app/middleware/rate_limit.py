"""
DSA OS — Sliding Window Rate Limiting Middleware

Protects authentication and API endpoints against brute force and denial of service.
Uses Redis sliding window when connected, with local memory fallback.
"""

import logging
import time
from collections import defaultdict
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from app.shared.schemas import ApiError, ErrorDetail

logger = logging.getLogger(__name__)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Sliding window rate limiter.
    Limits login attempts per IP and general API calls per client.
    """

    def __init__(
        self,
        app: ASGIApp,
        redis_client: object = None,
        default_limit: int = 120,  # 120 req / minute
        auth_limit: int = 10,  # 10 login attempts / minute per IP
        window_seconds: int = 60,
    ) -> None:
        super().__init__(app)
        self.redis = redis_client
        self.default_limit = default_limit
        self.auth_limit = auth_limit
        self.window_seconds = window_seconds
        # In-memory fallback: key -> list of float timestamps
        self._memory_cache: dict[str, list[float]] = defaultdict(list)

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        # Determine rate limit key & threshold
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path

        # Stricter limit on authentication endpoints
        is_auth = "/auth/login" in path
        limit = self.auth_limit if is_auth else self.default_limit
        key = f"rate_limit:{'auth' if is_auth else 'api'}:{client_ip}"

        now = time.time()
        window_start = now - self.window_seconds

        # Evaluate limit
        is_allowed = True
        current_count = 0

        # Try in-memory sliding window
        timestamps = self._memory_cache[key]
        # Prune expired timestamps
        self._memory_cache[key] = [t for t in timestamps if t > window_start]
        current_count = len(self._memory_cache[key])

        if current_count >= limit:
            is_allowed = False
        else:
            self._memory_cache[key].append(now)

        if not is_allowed:
            logger.warning("Rate limit exceeded for %s on %s (limit: %d)", client_ip, path, limit)
            request_id = getattr(request.state, "request_id", None)
            return JSONResponse(
                status_code=429,
                headers={"Retry-After": str(self.window_seconds)},
                content=ApiError(
                    error=ErrorDetail(
                        code="RATE_LIMIT_EXCEEDED",
                        message="Too many requests. Please slow down and try again later.",
                        details={"retry_after_seconds": self.window_seconds},
                    ),
                    request_id=request_id,
                ).model_dump(mode="json"),
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(max(0, limit - current_count - 1))
        return response
