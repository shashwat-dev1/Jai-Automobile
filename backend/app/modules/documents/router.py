"""DSA OS — Documents API Router

Endpoints for checklist retrieval, quarantine uploads, download authorization,
and document status transitions.
"""

import uuid

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth.dependencies import require_permission
from app.modules.auth.models import User
from app.modules.auth.permissions import (
    PERM_DOCS_ARCHIVE,
    PERM_DOCS_READ,
    PERM_DOCS_UPLOAD,
)
from app.modules.documents.schemas import (
    CaseChecklistResponse,
    ChecklistItemResponse,
    DocumentItemResponse,
    DocumentOCRVerificationRequest,
    DocumentStatusUpdateRequest,
    DocumentTypeResponse,
    DownloadUrlResponse,
    RequestMessageResponse,
    UploadConfirmRequest,
    UploadUrlRequest,
    UploadUrlResponse,
)
from app.modules.documents.service import DocumentService
from app.shared.schemas import ApiResponse

router = APIRouter(tags=["Documents"])


@router.get(
    "/cases/{case_id}/checklist",
    response_model=ApiResponse[CaseChecklistResponse],
)
async def get_case_checklist(
    case_id: uuid.UUID,
    current_user: User = Depends(require_permission(PERM_DOCS_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[CaseChecklistResponse]:
    """Get the dynamic document checklist and missing document count for a case."""
    service = DocumentService(session)
    items, missing_count = await service.get_checklist(
        current_user.org_id, case_id, user_role=current_user.role, user_id=current_user.id
    )
    checklist_resp = CaseChecklistResponse(
        case_id=case_id,
        missing_mandatory_count=missing_count,
        items=[ChecklistItemResponse(**item.to_dict()) for item in items],
    )
    return ApiResponse(data=checklist_resp)


@router.post(
    "/documents/upload-url",
    response_model=ApiResponse[UploadUrlResponse],
)
async def generate_upload_url(
    req: UploadUrlRequest,
    current_user: User = Depends(require_permission(PERM_DOCS_UPLOAD)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[UploadUrlResponse]:
    """Generate a pre-signed PUT URL targeting the quarantine bucket."""
    service = DocumentService(session)
    res = await service.generate_upload_url(current_user.org_id, current_user.id, req)
    return ApiResponse(data=res)


@router.post(
    "/documents/confirm",
    response_model=ApiResponse[DocumentItemResponse],
    status_code=status.HTTP_201_CREATED,
)
async def confirm_upload(
    req: UploadConfirmRequest,
    current_user: User = Depends(require_permission(PERM_DOCS_UPLOAD)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[DocumentItemResponse]:
    """Confirm quarantine upload and execute the validation pipeline."""
    service = DocumentService(session)
    doc = await service.confirm_upload(current_user.org_id, current_user.id, req)
    can_dl = doc.status not in ("quarantined", "scanning", "scan_failed")
    resp_item = DocumentItemResponse(
        id=doc.id,
        org_id=doc.org_id,
        case_id=doc.case_id,
        document_type_id=doc.document_type_id,
        file_name=doc.file_name,
        file_size=doc.file_size,
        mime_type=doc.mime_type,
        version=doc.version,
        status=doc.status,
        scan_result=doc.scan_result,
        scan_error=doc.scan_error,
        reject_reason=doc.reject_reason,
        uploaded_at=doc.uploaded_at,
        can_download=can_dl,
    )
    return ApiResponse(data=resp_item)


@router.get(
    "/documents/{document_id}/download",
    response_model=ApiResponse[DownloadUrlResponse],
)
async def get_download_url(
    document_id: uuid.UUID,
    current_user: User = Depends(require_permission(PERM_DOCS_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[DownloadUrlResponse]:
    """Generate a 5-minute pre-signed download URL for a verified document.

    Denies download if file is quarantined, scanning, or failed scan.
    """
    service = DocumentService(session)
    url, filename = await service.get_download_url(
        current_user.org_id, current_user.id, document_id, user_role=current_user.role
    )
    return ApiResponse(data=
        DownloadUrlResponse(download_url=url, expires_in_seconds=300, file_name=filename)
    )


@router.patch(
    "/documents/{document_id}/status",
    response_model=ApiResponse[DocumentItemResponse],
)
async def update_document_status(
    document_id: uuid.UUID,
    req: DocumentStatusUpdateRequest,
    current_user: User = Depends(require_permission(PERM_DOCS_ARCHIVE)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[DocumentItemResponse]:
    """Change document status (verify, reject, or archive)."""
    service = DocumentService(session)
    doc = await service.update_status(
        current_user.org_id, current_user.id, document_id, req.status, req.reason
    )
    can_dl = doc.status not in ("quarantined", "scanning", "scan_failed")
    resp_item = DocumentItemResponse(
        id=doc.id,
        org_id=doc.org_id,
        case_id=doc.case_id,
        document_type_id=doc.document_type_id,
        file_name=doc.file_name,
        file_size=doc.file_size,
        mime_type=doc.mime_type,
        version=doc.version,
        status=doc.status,
        scan_result=doc.scan_result,
        scan_error=doc.scan_error,
        reject_reason=doc.reject_reason,
        uploaded_at=doc.uploaded_at,
        can_download=can_dl,
    )
    return ApiResponse(data=resp_item)


@router.post(
    "/cases/{case_id}/documents/request-message",
    response_model=ApiResponse[RequestMessageResponse],
)
async def generate_request_message(
    case_id: uuid.UUID,
    current_user: User = Depends(require_permission(PERM_DOCS_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[RequestMessageResponse]:
    """Generate copyable missing documents request message."""
    service = DocumentService(session)
    case_no, customer_name, msg, missing_count = await service.get_request_message(
        current_user.org_id, case_id
    )
    return ApiResponse(data=
        RequestMessageResponse(
            case_no=case_no,
            customer_name=customer_name,
            message=msg,
            missing_count=missing_count,
        )
    )


@router.get(
    "/config/document-types",
    response_model=ApiResponse[list[DocumentTypeResponse]],
)
@router.get(
    "/document-types",
    response_model=ApiResponse[list[DocumentTypeResponse]],
)
async def list_document_types(
    current_user: User = Depends(require_permission(PERM_DOCS_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[DocumentTypeResponse]]:
    """List all acceptable document types."""
    service = DocumentService(session)
    types = await service.get_document_types()
    return ApiResponse(data=[DocumentTypeResponse.model_validate(t) for t in types])


@router.post("/documents/merge-pdf")
async def merge_images_to_pdf(
    files: list[UploadFile] = File(...),
    watermark: bool = Query(True, description="Overlay user name & timestamp watermark"),
    current_user: User = Depends(require_permission(PERM_DOCS_READ)),
) -> Response:
    """Merge uploaded images into a single PDF with security watermark (FR-DOC-009, NFR-SEC-010)."""
    from app.modules.documents.watermark_service import DocumentWatermarkService
    from app.shared.exceptions import ValidationError

    if not files:
        raise ValidationError("At least one image file is required for PDF merge")

    image_bytes_list: list[bytes] = []
    for f in files:
        b = await f.read()
        image_bytes_list.append(b)

    if watermark:
        pdf_bytes = DocumentWatermarkService.create_watermarked_export(
            image_bytes_list=image_bytes_list,
            user_name=current_user.name,
            user_id=str(current_user.id),
        )
    else:
        pdf_bytes = DocumentWatermarkService.merge_images_to_pdf(image_bytes_list)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="merged_documents.pdf"'},
    )


@router.post(
    "/documents/upload",
    response_model=ApiResponse[DocumentItemResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Direct document upload with automatic deterministic OCR extraction",
)
async def upload_document_direct(
    file: UploadFile = File(...),
    document_type_id: uuid.UUID = Form(...),
    case_id: uuid.UUID | None = Form(None),
    party_id: uuid.UUID | None = Form(None),
    current_user: User = Depends(require_permission(PERM_DOCS_UPLOAD)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[DocumentItemResponse]:
    content = await file.read()
    service = DocumentService(session)
    doc = await service.direct_upload(
        org_id=current_user.org_id,
        user_id=current_user.id,
        file_name=file.filename or "document.pdf",
        file_bytes=content,
        mime_type=file.content_type or "application/pdf",
        case_id=case_id,
        document_type_id=document_type_id,
        party_id=party_id,
    )
    can_dl = doc.status not in ("quarantined", "scanning", "scan_failed")
    resp_item = DocumentItemResponse(
        id=doc.id,
        org_id=doc.org_id,
        case_id=doc.case_id,
        document_type_id=doc.document_type_id,
        file_name=doc.file_name,
        file_size=doc.file_size,
        mime_type=doc.mime_type,
        version=doc.version,
        status=doc.status,
        scan_result=doc.scan_result,
        scan_error=doc.scan_error,
        reject_reason=doc.reject_reason,
        uploaded_at=doc.uploaded_at,
        can_download=can_dl,
    )
    return ApiResponse(data=resp_item)


@router.get("/documents/{document_id}/content")
async def get_document_content(
    document_id: uuid.UUID,
    current_user: User = Depends(require_permission(PERM_DOCS_READ)),
    session: AsyncSession = Depends(get_db),
) -> Response:
    """Stream raw document content directly for inline preview or download."""
    service = DocumentService(session)
    data, mime_type, filename = await service.get_document_content(
        current_user.org_id, document_id
    )
    return Response(
        content=data,
        media_type=mime_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post(
    "/documents/{document_id}/verify-extraction",
    response_model=ApiResponse[DocumentItemResponse],
    summary="Confirm or correct extracted OCR fields and apply to case",
)
async def verify_document_extraction(
    document_id: uuid.UUID,
    req: DocumentOCRVerificationRequest,
    current_user: User = Depends(require_permission(PERM_DOCS_READ)),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[DocumentItemResponse]:
    service = DocumentService(session)
    doc = await service.verify_extraction(
        org_id=current_user.org_id,
        user_id=current_user.id,
        document_id=document_id,
        fields=req.fields,
        apply_to_case=req.apply_to_case,
    )
    can_dl = doc.status not in ("quarantined", "scanning", "scan_failed")
    resp_item = DocumentItemResponse(
        id=doc.id,
        org_id=doc.org_id,
        case_id=doc.case_id,
        document_type_id=doc.document_type_id,
        file_name=doc.file_name,
        file_size=doc.file_size,
        mime_type=doc.mime_type,
        version=doc.version,
        status=doc.status,
        scan_result=doc.scan_result,
        scan_error=doc.scan_error,
        reject_reason=doc.reject_reason,
        uploaded_at=doc.uploaded_at,
        can_download=can_dl,
    )
    return ApiResponse(data=resp_item)
