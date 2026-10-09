"""
DSA OS — Cases Router
"""

import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.dependencies import require_permission
from app.modules.auth.models import User
from app.modules.auth.permissions import (
    PERM_CASES_CREATE,
    PERM_CASES_READ,
    PERM_CASES_UPDATE,
)
from app.modules.cases.schemas import (
    CaseCreate,
    CaseCreateResponse,
    CaseDetailResponse,
    CaseListItemResponse,
    CaseStatusUpdate,
    CaseUpdate,
    ConsentCreate,
    ConsentResponse,
    StatusHistoryResponse,
    VehicleCreateUpdate,
    VehicleResponse,
)
from app.modules.cases.service import CaseService
from app.shared.pagination import build_pagination_meta
from app.shared.schemas import ApiResponse

router = APIRouter(prefix="/cases", tags=["Case Lifecycle"])


@router.get("", response_model=ApiResponse[list[CaseListItemResponse]])
async def list_cases(
    status: str | None = Query(None),
    product_type: str | None = Query(None),
    source_id: uuid.UUID | None = Query(None),
    owner_id: uuid.UUID | None = Query(None),
    party_id: uuid.UUID | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    current_user: User = Depends(require_permission(PERM_CASES_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[CaseListItemResponse]]:
    """List operational cases with filters and role-scoped permissions."""
    service = CaseService(session=session)
    items, total = await service.list_cases(
        org_id=current_user.org_id,
        status=status,
        product_type=product_type,
        source_id=source_id,
        owner_id=owner_id,
        party_id=party_id,
        search=search,
        page=page,
        page_size=page_size,
        actor_role=current_user.role,
        actor_id=current_user.id,
    )
    meta = build_pagination_meta(total=total, page=page, page_size=page_size)
    return ApiResponse(data=items, meta=meta.model_dump())


@router.post(
    "", response_model=ApiResponse[CaseCreateResponse], status_code=status.HTTP_201_CREATED
)
async def create_case(
    payload: CaseCreate,
    current_user: User = Depends(require_permission(PERM_CASES_CREATE)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[CaseCreateResponse]:
    """Rapid case creation (IF-2) with auto-numbering, applicant linking, and vehicle creation."""
    service = CaseService(session=session)
    case_detail, warnings = await service.create_case(
        org_id=current_user.org_id,
        payload=payload,
        actor_id=current_user.id,
        actor_role=current_user.role,
    )
    return ApiResponse(data=CaseCreateResponse(case=case_detail, duplicate_warnings=warnings))


@router.get("/{case_id}", response_model=ApiResponse[CaseDetailResponse])
async def get_case(
    case_id: uuid.UUID,
    current_user: User = Depends(require_permission(PERM_CASES_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[CaseDetailResponse]:
    """Get full case dossier, applicant, vehicle, source, and timeline."""
    service = CaseService(session=session)
    detail = await service.get_case_detail(org_id=current_user.org_id, case_id=case_id)
    return ApiResponse(data=detail)


@router.patch("/{case_id}", response_model=ApiResponse[CaseDetailResponse])
async def update_case(
    case_id: uuid.UUID,
    payload: CaseUpdate,
    current_user: User = Depends(require_permission(PERM_CASES_UPDATE)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[CaseDetailResponse]:
    """Update case details with optimistic locking."""
    service = CaseService(session=session)
    detail = await service.update_case(
        org_id=current_user.org_id,
        case_id=case_id,
        payload=payload,
        actor_id=current_user.id,
        actor_role=current_user.role,
    )
    return ApiResponse(data=detail)


@router.post("/{case_id}/status", response_model=ApiResponse[CaseDetailResponse])
async def change_case_status(
    case_id: uuid.UUID,
    payload: CaseStatusUpdate,
    current_user: User = Depends(require_permission(PERM_CASES_UPDATE)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[CaseDetailResponse]:
    """Enforce state machine transition, optimistic locking, and audit status history."""
    service = CaseService(session=session)
    detail = await service.change_status(
        org_id=current_user.org_id,
        case_id=case_id,
        payload=payload,
        actor_id=current_user.id,
        actor_role=current_user.role,
    )
    return ApiResponse(data=detail)


@router.get("/{case_id}/timeline", response_model=ApiResponse[list[StatusHistoryResponse]])
async def get_case_timeline(
    case_id: uuid.UUID,
    current_user: User = Depends(require_permission(PERM_CASES_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[StatusHistoryResponse]]:
    """Get chronological status timeline for a case."""
    service = CaseService(session=session)
    detail = await service.get_case_detail(org_id=current_user.org_id, case_id=case_id)
    return ApiResponse(data=detail.status_history)


@router.put("/{case_id}/vehicle", response_model=ApiResponse[VehicleResponse])
async def upsert_case_vehicle(
    case_id: uuid.UUID,
    payload: VehicleCreateUpdate,
    current_user: User = Depends(require_permission(PERM_CASES_UPDATE)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[VehicleResponse]:
    """Create or update vehicle asset tied to the loan file."""
    service = CaseService(session=session)
    vehicle = await service.upsert_vehicle(
        org_id=current_user.org_id,
        case_id=case_id,
        payload=payload,
        actor_id=current_user.id,
        actor_role=current_user.role,
    )
    return ApiResponse(data=vehicle)


@router.post("/{case_id}/consent", response_model=ApiResponse[ConsentResponse])
async def record_case_consent(
    case_id: uuid.UUID,
    payload: ConsentCreate,
    request: Request,
    current_user: User = Depends(require_permission(PERM_CASES_UPDATE)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ConsentResponse]:
    """Record customer DPDP consent for this case."""
    service = CaseService(session=session)
    payload.case_id = case_id
    ip_address = request.client.host if request.client else None
    consent = await service.record_consent(
        org_id=current_user.org_id,
        payload=payload,
        actor_id=current_user.id,
        actor_role=current_user.role,
        ip_address=ip_address,
    )
    return ApiResponse(data=consent)
