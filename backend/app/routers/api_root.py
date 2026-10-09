"""
DSA OS — API Root Router

GET /api/v1/ — Version information and API root.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from app.config import get_settings

router = APIRouter(tags=["API Root"])


class ApiRootResponse(BaseModel):
    """API root response with version and links."""

    name: str
    version: str
    environment: str
    description: str
    docs_url: str | None


@router.get(
    "/",
    response_model=ApiRootResponse,
    summary="API root",
    description="Returns API version and metadata.",
)
async def api_root() -> ApiRootResponse:
    """Return API version information."""
    settings = get_settings()
    return ApiRootResponse(
        name="DSA OS API",
        version=settings.app_version,
        environment=settings.app_env,
        description="Vehicle loan DSA operations platform — Release 1",
        docs_url="/api/docs" if settings.app_env != "production" else None,
    )
