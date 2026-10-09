"""
DSA OS — Security Headers Middleware

Adds HTTP security headers to every response.
These headers are a baseline defense layer; Nginx also adds them in production.

Headers set:
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY
  - X-XSS-Protection: 0 (disabled, browsers use CSP now)
  - Referrer-Policy: strict-origin-when-cross-origin
  - Content-Security-Policy: restrictive CSP for the API
  - Permissions-Policy: disable unused browser features
  - Cache-Control: no-store for API responses (prevent caching sensitive data)
  - Strict-Transport-Security: HSTS (production only)
"""

from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds security headers to all API responses."""

    def __init__(self, app: ASGIApp, is_production: bool = False) -> None:
        super().__init__(app)
        self._is_production = is_production

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response: Response = await call_next(request)

        # Prevent MIME-type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Deny framing (clickjacking protection)
        response.headers["X-Frame-Options"] = "DENY"

        # Legacy XSS protection disabled (CSP is the modern approach)
        response.headers["X-XSS-Protection"] = "0"

        # Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # CSP: API responses should not load resources
        # Frontend HTML is served separately and has its own CSP
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; " "frame-ancestors 'none';"
        )

        # Permissions policy: disable access to sensitive browser features
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), " "payment=(), usb=(), midi=(), bluetooth=()"
        )

        # Prevent caching of API responses (they contain sensitive financial data)
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"

        # HSTS — only in production (dev may use plain HTTP)
        if self._is_production:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )

        return response
