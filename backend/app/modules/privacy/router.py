"""
DSA OS — Privacy, Compliance & 2FA Router
"""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.dependencies import get_current_user, require_role
from app.modules.auth.models import User
from app.modules.privacy.schemas import (
    BreachCreateRequest,
    BreachResponse,
    BreachUpdateRequest,
    DSARCreateRequest,
    DSARResponse,
    DSARUpdateRequest,
    RetentionScheduleResponse,
    RetentionScheduleUpdate,
    TOTPSetupResponse,
    TOTPStatusResponse,
    TOTPVerifyRequest,
)
from app.modules.privacy.service import PrivacyService
from app.shared.schemas import ApiResponse

router = APIRouter(tags=["Privacy & Security Hardening"])


# -----------------------------------------------------------------------------
# 2FA (FR-AUTH-004)
# -----------------------------------------------------------------------------
@router.get("/auth/2fa/status", response_model=ApiResponse[TOTPStatusResponse])
async def get_2fa_status(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[TOTPStatusResponse]:
    """Check 2FA configuration and role requirement for current user."""
    service = PrivacyService(session)
    status = await service.get_totp_status(current_user.org_id, current_user)
    return ApiResponse(data=status)


@router.post("/auth/2fa/setup", response_model=ApiResponse[TOTPSetupResponse])
async def setup_2fa(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[TOTPSetupResponse]:
    """Generate new TOTP secret and recovery codes."""
    service = PrivacyService(session)
    data = await service.setup_totp(current_user.org_id, current_user)
    await session.commit()
    return ApiResponse(data=data)


@router.post("/auth/2fa/verify", response_model=ApiResponse[dict[str, str]])
async def verify_2fa(
    payload: TOTPVerifyRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict[str, str]]:
    """Verify 6-digit TOTP code to activate 2FA."""
    service = PrivacyService(session)
    await service.verify_and_enable_totp(current_user.org_id, current_user.id, payload.code)
    await session.commit()
    return ApiResponse(data={"message": "Two-factor authentication successfully enabled."})


# -----------------------------------------------------------------------------
# DSAR & Consent Withdrawal (FR-PRV-003)
# -----------------------------------------------------------------------------
@router.post("/privacy/dsar", response_model=ApiResponse[DSARResponse])
async def create_dsar(
    payload: DSARCreateRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[DSARResponse]:
    """Log a Data Subject Access Request or consent withdrawal with 30d deadline."""
    service = PrivacyService(session)
    dsar = await service.create_dsar(current_user.org_id, current_user.id, payload)
    await session.commit()
    return ApiResponse(data=DSARResponse.model_validate(dsar))


@router.get("/privacy/dsar", response_model=ApiResponse[list[DSARResponse]])
async def list_dsars(
    status: str | None = Query(None, description="Filter by pending/completed/rejected"),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[DSARResponse]]:
    """List Data Subject Requests for tenant."""
    service = PrivacyService(session)
    dsars = await service.list_dsars(current_user.org_id, status=status, limit=limit)
    return ApiResponse(data=[DSARResponse.model_validate(d) for d in dsars])


@router.patch("/privacy/dsar/{dsar_id}", response_model=ApiResponse[DSARResponse])
async def update_dsar(
    dsar_id: uuid.UUID,
    payload: DSARUpdateRequest,
    current_user: User = Depends(require_role("owner", "admin")),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[DSARResponse]:
    """Update DSAR resolution or status."""
    service = PrivacyService(session)
    dsar = await service.update_dsar(current_user.org_id, dsar_id, payload)
    await session.commit()
    return ApiResponse(data=DSARResponse.model_validate(dsar))


# -----------------------------------------------------------------------------
# Breach Register (FR-PRV-005)
# -----------------------------------------------------------------------------
@router.post("/privacy/breach", response_model=ApiResponse[BreachResponse])
async def create_breach(
    payload: BreachCreateRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[BreachResponse]:
    """Report and register a potential data incident."""
    service = PrivacyService(session)
    breach = await service.create_breach(current_user.org_id, current_user.id, payload)
    await session.commit()
    return ApiResponse(data=BreachResponse.model_validate(breach))


@router.get("/privacy/breach", response_model=ApiResponse[list[BreachResponse]])
async def list_breaches(
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(require_role("owner", "admin", "auditor")),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[BreachResponse]]:
    """List reported incidents (Owner/Admin/Auditor)."""
    service = PrivacyService(session)
    breaches = await service.list_breaches(current_user.org_id, status=status, limit=limit)
    return ApiResponse(data=[BreachResponse.model_validate(b) for b in breaches])


@router.patch("/privacy/breach/{breach_id}", response_model=ApiResponse[BreachResponse])
async def update_breach(
    breach_id: uuid.UUID,
    payload: BreachUpdateRequest,
    current_user: User = Depends(require_role("owner", "admin")),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[BreachResponse]:
    """Update incident containment and status."""
    service = PrivacyService(session)
    breach = await service.update_breach(current_user.org_id, breach_id, payload)
    await session.commit()
    return ApiResponse(data=BreachResponse.model_validate(breach))


# -----------------------------------------------------------------------------
# Retention Schedules (FR-PRV-004)
# -----------------------------------------------------------------------------
@router.get("/privacy/retention/{entity_type}", response_model=ApiResponse[RetentionScheduleResponse])
async def get_retention_schedule(
    entity_type: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[RetentionScheduleResponse]:
    """Fetch retention schedule and legal-hold status for an entity."""
    service = PrivacyService(session)
    schedule = await service.get_or_create_retention_schedule(current_user.org_id, entity_type)
    return ApiResponse(data=RetentionScheduleResponse.model_validate(schedule))


@router.put("/privacy/retention/{entity_type}", response_model=ApiResponse[RetentionScheduleResponse])
async def update_retention_schedule(
    entity_type: str,
    payload: RetentionScheduleUpdate,
    current_user: User = Depends(require_role("owner", "admin")),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[RetentionScheduleResponse]:
    """Configure retention period or toggle legal hold."""
    service = PrivacyService(session)
    schedule = await service.update_retention_schedule(current_user.org_id, entity_type, payload)
    await session.commit()
    return ApiResponse(data=RetentionScheduleResponse.model_validate(schedule))
