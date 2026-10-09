"""
DSA OS — Audit Trail Endpoints
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.audit.schemas import AuditLogEntry
from app.modules.audit.service import AuditService
from app.modules.auth.dependencies import require_permission
from app.modules.auth.models import User
from app.modules.auth.permissions import PERM_AUDIT_READ
from app.shared.pagination import build_pagination_meta
from app.shared.schemas import ApiResponse

router = APIRouter(prefix="/audit", tags=["Audit Log"])


@router.get("", response_model=ApiResponse[list[AuditLogEntry]])
async def search_audit_log(
    actor_id: uuid.UUID | None = Query(None),
    action: str | None = Query(None),
    entity_type: str | None = Query(None),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    current_user: User = Depends(require_permission(PERM_AUDIT_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[AuditLogEntry]]:
    """Search and filter immutable audit records within the organization (Owner and Auditor)."""
    service = AuditService(session=session)
    entries, total = await service.search(
        org_id=current_user.org_id,
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        from_date=from_date,
        to_date=to_date,
        page=page,
        page_size=page_size,
    )
    meta = build_pagination_meta(total=total, page=page, page_size=page_size)
    return ApiResponse(
        data=[AuditLogEntry.model_validate(e) for e in entries],
        meta=meta.model_dump(),
    )


@router.get("/export")
async def export_audit_log_csv(
    actor_id: uuid.UUID | None = Query(None),
    action: str | None = Query(None),
    entity_type: str | None = Query(None),
    from_date: datetime | None = Query(None),
    to_date: datetime | None = Query(None),
    current_user: User = Depends(require_permission(PERM_AUDIT_READ)),
    session: AsyncSession = Depends(get_db),
) -> Response:
    """Export filtered audit trail as CSV for compliance and reporting."""
    service = AuditService(session=session)
    csv_content = await service.export_csv(
        org_id=current_user.org_id,
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        from_date=from_date,
        to_date=to_date,
    )
    filename = f"audit_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
