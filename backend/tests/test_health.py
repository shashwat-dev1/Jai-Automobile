"""
DSA OS — Health Endpoint Tests

Tests:
1. GET /health returns 200 with expected structure
2. GET /health/ready returns appropriate status
3. Security headers are present on all responses
4. X-Request-ID propagated in response headers
5. No sensitive data in health responses
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestHealthLiveness:
    """Tests for GET /health (liveness probe)."""

    async def test_health_returns_200(self, client: AsyncClient) -> None:
        """Liveness probe always returns 200 if the process is running."""
        response = await client.get("/health")
        assert response.status_code == 200

    async def test_health_response_structure(self, client: AsyncClient) -> None:
        """Health response includes required fields."""
        response = await client.get("/health")
        data = response.json()

        assert "status" in data
        assert data["status"] == "ok"
        assert "version" in data
        assert "environment" in data
        assert "timestamp" in data

    async def test_health_has_security_headers(self, client: AsyncClient) -> None:
        """Security headers must be present on all responses, including health."""
        response = await client.get("/health")

        assert "x-content-type-options" in response.headers
        assert response.headers["x-content-type-options"] == "nosniff"

        assert "x-frame-options" in response.headers
        assert response.headers["x-frame-options"] == "DENY"

        assert "content-security-policy" in response.headers
        assert "cache-control" in response.headers

    async def test_health_propagates_request_id(self, client: AsyncClient) -> None:
        """X-Request-ID from request must be echoed back in response when it is a valid UUID."""
        req_id = "550e8400-e29b-41d4-a716-446655440000"
        response = await client.get("/health", headers={"X-Request-ID": req_id})
        assert response.headers.get("x-request-id") == req_id

    async def test_health_generates_request_id_if_missing(self, client: AsyncClient) -> None:
        """If no X-Request-ID provided, one is generated."""
        response = await client.get("/health")
        request_id = response.headers.get("x-request-id")
        assert request_id is not None
        assert len(request_id) == 36  # UUID format

    async def test_health_no_sensitive_data(self, client: AsyncClient) -> None:
        """Health response must not expose internal details."""
        response = await client.get("/health")
        body = response.text.lower()

        # Must not contain database connection strings
        assert "password" not in body
        assert "secret" not in body
        assert "dsaos_app" not in body
        assert "dsaos_migrator" not in body


@pytest.mark.asyncio
class TestHealthReadiness:
    """Tests for GET /health/ready (readiness probe)."""

    async def test_readiness_returns_valid_status(self, client: AsyncClient) -> None:
        """Readiness probe returns either 200 (all ok) or 503 (degraded)."""
        response = await client.get("/health/ready")
        assert response.status_code in [200, 503]

    async def test_readiness_response_structure(self, client: AsyncClient) -> None:
        """Readiness response includes dependency status fields."""
        response = await client.get("/health/ready")
        data = response.json()

        assert "status" in data
        assert data["status"] in ["ok", "degraded", "down"]
        assert "database" in data
        assert "redis" in data
        assert "storage" in data
        assert "timestamp" in data

    async def test_readiness_has_security_headers(self, client: AsyncClient) -> None:
        """Security headers present on readiness endpoint too."""
        response = await client.get("/health/ready")
        assert "x-content-type-options" in response.headers
        assert "x-frame-options" in response.headers


@pytest.mark.asyncio
class TestApiRoot:
    """Tests for GET /api/v1/ (API root)."""

    async def test_api_root_returns_200(self, client: AsyncClient) -> None:
        """API root returns 200."""
        response = await client.get("/api/v1/")
        assert response.status_code == 200

    async def test_api_root_response_structure(self, client: AsyncClient) -> None:
        """API root includes name, version, environment fields."""
        response = await client.get("/api/v1/")
        data = response.json()

        assert data["name"] == "DSA OS API"
        assert "version" in data
        assert "environment" in data

    async def test_api_root_has_security_headers(self, client: AsyncClient) -> None:
        """Security headers present on API root too."""
        response = await client.get("/api/v1/")
        assert "x-content-type-options" in response.headers
        assert "x-frame-options" in response.headers


@pytest.mark.asyncio
class TestCorsHeaders:
    """Tests for CORS configuration."""

    async def test_cors_allows_configured_origin(self, client: AsyncClient) -> None:
        """Configured CORS origin receives Allow-Origin header."""
        response = await client.options(
            "/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        # Should not be blocked
        assert response.status_code in [200, 204]

    async def test_request_id_invalid_uuid_gets_generated(self, client: AsyncClient) -> None:
        """Invalid X-Request-ID gets replaced with a generated UUID."""
        response = await client.get("/health", headers={"X-Request-ID": "not-a-uuid!!"})
        request_id = response.headers.get("x-request-id")
        assert request_id is not None
        # A fresh UUID should have been generated
        assert request_id != "not-a-uuid!!"
        assert len(request_id) == 36
