"""
DSA OS — Data Import & Reversal Router
"""

import uuid

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.dependencies import get_current_user, require_role
from app.modules.auth.models import User
from app.modules.import_export.schemas import (
    ImportBatchResponse,
    ImportCommitRequest,
    ImportDryRunResponse,
)
from app.modules.import_export.service import ImportExportService
from app.shared.exceptions import ValidationError
from app.shared.schemas import ApiResponse

router = APIRouter(tags=["Data Import & Reversal"])


@router.post("/import/dry-run", response_model=ApiResponse[ImportDryRunResponse])
async def dry_run_import(
    entity_type: str = Form(..., description="parties, sources, lenders"),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ImportDryRunResponse]:
    """Upload CSV for validation dry-run without writing to database."""
    content = await file.read()
    try:
        csv_text = content.decode("utf-8")
    except UnicodeDecodeError as err:
        raise ValidationError("Uploaded file must be UTF-8 encoded CSV") from err

    service = ImportExportService(session)
    report = service.dry_run_csv(entity_type=entity_type, csv_content=csv_text)
    return ApiResponse(data=report)


@router.post("/import/commit", response_model=ApiResponse[ImportBatchResponse])
async def commit_import(
    payload: ImportCommitRequest,
    current_user: User = Depends(require_role("owner", "admin", "case_officer")),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ImportBatchResponse]:
    """Commit validated records and initiate 24-hour rollback reversal window."""
    service = ImportExportService(session)
    batch = await service.commit_import(
        org_id=current_user.org_id,
        user_id=current_user.id,
        entity_type=payload.entity_type,
        filename=payload.filename,
        records=payload.records,
    )
    await session.commit()
    return ApiResponse(data=ImportBatchResponse.model_validate(batch))


@router.post("/import/batches/{batch_id}/reverse", response_model=ApiResponse[ImportBatchResponse])
async def reverse_import(
    batch_id: uuid.UUID,
    current_user: User = Depends(require_role("owner", "admin")),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ImportBatchResponse]:
    """Roll back an imported batch within the 24-hour window (FR-IMP-003)."""
    service = ImportExportService(session)
    batch = await service.reverse_import(org_id=current_user.org_id, batch_id=batch_id)
    await session.commit()
    return ApiResponse(data=ImportBatchResponse.model_validate(batch))


@router.get("/import/batches", response_model=ApiResponse[list[ImportBatchResponse]])
async def list_import_batches(
    entity_type: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[ImportBatchResponse]]:
    """List historical import batches for the organization."""
    service = ImportExportService(session)
    batches = await service.list_batches(org_id=current_user.org_id, entity_type=entity_type, limit=limit)
    return ApiResponse(data=[ImportBatchResponse.model_validate(b) for b in batches])
