"""
DSA OS — Request ID Middleware

Assigns a unique request ID to every incoming HTTP request.
The request ID is:
  1. Taken from X-Request-ID header if provided by the caller (useful for tracing)
  2. Generated as a UUID4 if not provided
  3. Stored in request.state.request_id for use by all handlers
  4. Added to every response as X-Request-ID header

This enables correlating log lines from a single request across services.
NEVER log sensitive data (tokens, PAN, passwords) using this or any logger.
"""

import uuid
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attaches a correlation request ID to every request and response."""

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        # Use caller-provided request ID if it's a valid UUID; otherwise generate a new one
        raw_id = request.headers.get("X-Request-ID", "")
        try:
            request_id = str(uuid.UUID(raw_id)) if raw_id else str(uuid.uuid4())
        except ValueError:
            request_id = str(uuid.uuid4())

        request.state.request_id = request_id

        response: Response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
