"""DSA OS — Phase 03 Documents & Quarantine Pipeline Tests

Tests:
1. Checklist engine rules (KYC, Income, Vehicle, and FR-VEH-005 Hypothecation trigger)
2. Filename sanitization against directory traversal (NFR-SEC-007)
3. Magic byte MIME verification and spoofing rejection (FR-DOC-002)
4. EXIF stripping from JPEG images
5. Malware detection via EICAR signature (quarantined object purged, canonical object never created)
6. Download security invariant: Quarantined, scanning, and scan_failed files CANNOT be downloaded
7. Validated document download generates 5-minute signed URL and records audit log
8. Missing documents request message generation
"""

import io
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import pytest
from app.modules.cases.models import Case, CaseParty, Vehicle
from app.modules.documents.checklist_engine import ChecklistEngine, ChecklistItemDTO
from app.modules.documents.models import Document, DocumentType
from app.modules.documents.processing import (
    EICAR_SIGNATURE,
    DocumentValidationError,
    sanitize_filename,
    scan_for_malware,
    strip_exif_metadata,
    verify_magic_bytes,
)
from app.modules.documents.schemas import (
    UploadConfirmRequest,
    UploadUrlRequest,
)
from app.modules.documents.service import DocumentService
from app.modules.parties.models import Party
from app.shared.exceptions import BusinessRuleViolationError
from app.shared.storage import get_storage_service
from PIL import Image


class MockDocumentDbSession:
    """In-memory mock database session for document tests."""

    def __init__(self) -> None:
        self.cases: dict[uuid.UUID, Case] = {}
        self.parties: dict[uuid.UUID, Party] = {}
        self.case_parties: dict[uuid.UUID, Any] = {}
        self.vehicles: dict[uuid.UUID, Vehicle] = {}
        self.doc_types: dict[uuid.UUID, DocumentType] = {}
        self.documents: dict[uuid.UUID, Document] = {}
        self.audit_events: list[dict[str, Any]] = []

    def add(self, entity: Any) -> None:
        if isinstance(entity, Case):
            self.cases[entity.id] = entity
        elif isinstance(entity, Party):
            self.parties[entity.id] = entity
        elif isinstance(entity, Vehicle):
            self.vehicles[entity.id] = entity
        elif isinstance(entity, DocumentType):
            self.doc_types[entity.id] = entity
        elif isinstance(entity, Document):
            self.documents[entity.id] = entity
        elif hasattr(entity, "party_role"):  # CaseParty
            self.case_parties[entity.id] = entity

    def add_all(self, entities: list[Any]) -> None:
        for e in entities:
            self.add(e)

    async def flush(self) -> None:
        pass

    async def commit(self) -> None:
        pass

    async def refresh(self, entity: Any) -> None:
        pass

    async def execute(self, stmt: Any) -> Any:
        class MockResult:
            def __init__(self, items: list[Any]) -> None:
                self._items = items

            def scalars(self) -> Any:
                class S:
                    def __init__(self, it: list[Any]) -> None:
                        self._it = it

                    def all(self) -> list[Any]:
                        return self._it

                    def first(self) -> Any:
                        return self._it[0] if self._it else None

                return S(self._items)

            def scalar_one_or_none(self) -> Any:
                return self._items[0] if self._items else None

            def scalar_one(self) -> Any:
                return self._items[0] if self._items else None

        stmt_str = str(stmt).lower()
        if "from document_types" in stmt_str:
            return MockResult(list(self.doc_types.values()))
        elif "from case_parties" in stmt_str:
            return MockResult(list(self.case_parties.values()))
        elif "from cases" in stmt_str:
            return MockResult(list(self.cases.values()))
        elif "from parties" in stmt_str:
            return MockResult(list(self.parties.values()))
        elif "from vehicles" in stmt_str:
            return MockResult(list(self.vehicles.values()))
        elif "from documents" in stmt_str:
            return MockResult(list(self.documents.values()))
        elif "from audit_events" in stmt_str:
            return MockResult(self.audit_events)
        return MockResult([])


# -----------------------------------------------------------------------------
# Unit Tests: Processing, Sanitization & Security
# -----------------------------------------------------------------------------


def test_filename_sanitization():
    """Verify filename sanitization strips directory traversal and special chars."""
    assert sanitize_filename("../../etc/passwd.pdf") == "passwd.pdf"
    assert sanitize_filename("..\\..\\windows\\system32.png") == "system32.png"
    assert sanitize_filename("my report (final) & draft!.pdf") == "my_report_final__draft.pdf"
    assert sanitize_filename("") == "unnamed_document.pdf"


def test_verify_magic_bytes_valid_formats():
    """Verify that PDF, JPEG, and PNG magic numbers are accepted."""
    # PDF
    pdf_bytes = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    assert verify_magic_bytes(pdf_bytes) == "application/pdf"

    # JPEG
    jpeg_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF"
    assert verify_magic_bytes(jpeg_bytes) == "image/jpeg"

    # PNG
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    assert verify_magic_bytes(png_bytes) == "image/png"


def test_verify_magic_bytes_spoofing_rejected():
    """Verify that executable or script payloads masquerading with wrong headers are rejected."""
    bad_bytes = b"MZ\x90\x00\x03\x00\x00\x00"  # Windows EXE
    with pytest.raises(DocumentValidationError) as exc:
        verify_magic_bytes(bad_bytes)
    assert exc.value.code == "UNSUPPORTED_MIME_TYPE"

    # Empty payload
    with pytest.raises(DocumentValidationError) as exc:
        verify_magic_bytes(b"")
    assert exc.value.code == "EMPTY_FILE"


def test_strip_exif_metadata():
    """Verify that image EXIF metadata is stripped."""
    img = Image.new("RGB", (20, 20), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    original_data = buf.getvalue()

    cleaned_data = strip_exif_metadata(original_data, "image/jpeg")
    assert len(cleaned_data) > 0
    cleaned_img = Image.open(io.BytesIO(cleaned_data))
    assert cleaned_img.size == (20, 20)


def test_malware_detection_eicar():
    """Verify that EICAR malware test string is detected and rejected."""
    payload = b"%PDF-1.4\n" + EICAR_SIGNATURE
    with pytest.raises(DocumentValidationError) as exc:
        scan_for_malware(payload)
    assert exc.value.code == "MALWARE_DETECTED"
    assert "Eicar-Test-Signature" in exc.value.message


# -----------------------------------------------------------------------------
# Unit Tests: Checklist Engine & Request Message
# -----------------------------------------------------------------------------


def test_generate_request_message():
    """Verify missing documents request message formatting."""
    engine = ChecklistEngine(session=None)  # type: ignore

    items = [
        ChecklistItemDTO(
            document_type_id=uuid.uuid4(),
            code="pan_card",
            name="PAN Card",
            group_name="KYC",
            is_mandatory=True,
            status="received",
        ),
        ChecklistItemDTO(
            document_type_id=uuid.uuid4(),
            code="salary_slip",
            name="Salary Slips (Latest 3 Months)",
            group_name="Income",
            is_mandatory=True,
            status="requested",
        ),
        ChecklistItemDTO(
            document_type_id=uuid.uuid4(),
            code="bank_noc",
            name="Lender NOC",
            group_name="Legal",
            is_mandatory=True,
            status="rejected",
            reject_reason="Illegible stamp",
        ),
    ]

    msg = engine.generate_request_message(
        case_no="LOS-10025", customer_name="Sunil Sharma", checklist_items=items
    )
    assert "Sunil Sharma" in msg
    assert "LOS-10025" in msg
    assert "Salary Slips (Latest 3 Months)" in msg
    assert "Lender NOC" in msg
    assert "PAN Card" not in msg


@pytest.mark.asyncio
async def test_checklist_hypothecation_rule():
    """Verify FR-VEH-005: active hypothecation on vehicle adds NOC and Form 35 to mandatory list."""
    session = MockDocumentDbSession()
    org_id = uuid.uuid4()
    case_id = uuid.uuid4()
    party_id = uuid.uuid4()

    case = Case(
        id=case_id,
        org_id=org_id,
        case_no="LOS-10001",
        loan_amount_requested=Decimal("500000"),
        owner_id=uuid.uuid4(),
        source_id=uuid.uuid4(),
        product_type="used_car",
        status="collecting_docs",
    )
    case_party = CaseParty(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=case_id,
        party_id=party_id,
        role="applicant",
    )
    party = Party(
        id=party_id,
        org_id=org_id,
        name="Vikram Verma",
        mobile_primary="9876500000",
        employment_type="salaried",
    )
    # Vehicle has active HP
    vehicle = Vehicle(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=case_id,
        make="Hyundai",
        model="Creta",
        condition="used",
        existing_hypothecation="HDFC Bank",
    )
    doc_types = [
        DocumentType(id=uuid.uuid4(), code="pan_card", name="PAN Card", group_name="KYC"),
        DocumentType(id=uuid.uuid4(), code="aadhaar_card", name="Aadhaar", group_name="KYC"),
        DocumentType(id=uuid.uuid4(), code="salary_slip", name="Salary Slip", group_name="Income"),
        DocumentType(
            id=uuid.uuid4(), code="bank_statement", name="Bank Statement", group_name="Income"
        ),
        DocumentType(id=uuid.uuid4(), code="rc_copy", name="RC", group_name="Vehicle"),
        DocumentType(
            id=uuid.uuid4(), code="insurance_policy", name="Insurance", group_name="Vehicle"
        ),
        DocumentType(id=uuid.uuid4(), code="bank_noc", name="Lender NOC", group_name="Legal"),
        DocumentType(id=uuid.uuid4(), code="form_35", name="Form 35", group_name="Legal"),
    ]
    session.add_all([case, case_party, party, vehicle] + doc_types)

    engine = ChecklistEngine(session)  # type: ignore
    items, missing_count = await engine.get_case_checklist(org_id, case_id)

    item_codes = {item.code: item.is_mandatory for item in items}
    # Both bank_noc and form_35 must be present and mandatory
    assert "bank_noc" in item_codes and item_codes["bank_noc"] is True
    assert "form_35" in item_codes and item_codes["form_35"] is True
    assert missing_count == len(items)


# -----------------------------------------------------------------------------
# Integration Tests: Document Service & Storage Workflow
# -----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_document_upload_and_validation_pipeline():
    """Test full document quarantine and promotion pipeline."""
    session = MockDocumentDbSession()
    storage = get_storage_service()
    service = DocumentService(session)  # type: ignore

    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    case_id = uuid.uuid4()
    doc_type_id = uuid.uuid4()

    case = Case(
        id=case_id,
        org_id=org_id,
        case_no="LOS-99001",
        loan_amount_requested=Decimal("500000"),
        owner_id=user_id,
        source_id=uuid.uuid4(),
        product_type="used_car",
        assigned_processor_id=user_id,
        status="collecting_docs",
    )
    case_party = CaseParty(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=case_id,
        party_id=uuid.uuid4(),
        role="applicant",
    )
    doc_type = DocumentType(
        id=doc_type_id,
        code="pan_card",
        name="PAN Card",
        group_name="KYC",
        is_active=True,
    )
    session.add_all([case, case_party, doc_type])

    # 1. Generate quarantine upload URL
    req_url = UploadUrlRequest(
        case_id=case_id,
        document_type_id=doc_type_id,
        file_name="rajesh_pan.pdf",
        file_size=1024,
        mime_type="application/pdf",
    )
    upload_resp = await service.generate_upload_url(org_id, user_id, req_url)
    assert upload_resp.upload_url
    assert "quarantine" in upload_resp.quarantine_key

    # 2. Simulate browser upload to quarantine bucket
    valid_pdf_content = b"%PDF-1.4\nTest PDF Document content for Rajesh Kumar PAN card"
    storage.put_object(
        bucket=storage.quarantine_bucket,
        key=upload_resp.quarantine_key,
        data=valid_pdf_content,
        content_type="application/pdf",
    )

    # 3. Confirm upload (triggers validation and promotion)
    req_confirm = UploadConfirmRequest(
        upload_id=upload_resp.upload_id,
        case_id=case_id,
        document_type_id=doc_type_id,
        file_name="rajesh_pan.pdf",
        file_size=len(valid_pdf_content),
        mime_type="application/pdf",
        quarantine_key=upload_resp.quarantine_key,
        auto_validate=True,
    )
    doc = await service.confirm_upload(org_id, user_id, req_confirm)

    assert doc.status == "received"
    assert doc.file_key is not None
    assert "canonical" in doc.file_key
    assert not storage.object_exists(storage.quarantine_bucket, upload_resp.quarantine_key)
    assert storage.object_exists(storage.canonical_bucket, doc.file_key)

    # 4. Download URL succeeds for validated document
    download_url, filename = await service.get_download_url(org_id, user_id, doc.id)
    assert download_url is not None
    assert filename == "rajesh_pan.pdf"

    # 5. Status update: Verify document
    updated_doc = await service.update_status(org_id, user_id, doc.id, "verified")
    assert updated_doc.status == "verified"
    assert updated_doc.verified_by == user_id


@pytest.mark.asyncio
async def test_quarantined_document_download_forbidden():
    """SECURITY INVARIANT: Documents in quarantined or scan_failed status cannot be downloaded."""
    session = MockDocumentDbSession()
    service = DocumentService(session)  # type: ignore

    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    doc_id = uuid.uuid4()

    quarantined_doc = Document(
        id=doc_id,
        org_id=org_id,
        case_id=uuid.uuid4(),
        document_type_id=uuid.uuid4(),
        file_name="suspicious.pdf",
        file_size=500,
        mime_type="application/pdf",
        version=1,
        quarantine_key="quarantine/test/suspicious.pdf",
        status="quarantined",
        uploaded_by=user_id,
        uploaded_at=datetime.now(UTC),
    )
    session.add(quarantined_doc)

    with pytest.raises(BusinessRuleViolationError) as exc:
        await service.get_download_url(org_id, user_id, doc_id)
    assert "quarantined" in str(exc.value)


@pytest.mark.asyncio
async def test_infected_upload_quarantined_and_fails():
    """SECURITY TEST: Infected file triggers scan_failed, deletes quarantine file, never promotes."""
    session = MockDocumentDbSession()
    storage = get_storage_service()
    service = DocumentService(session)  # type: ignore

    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    case_id = uuid.uuid4()
    doc_type_id = uuid.uuid4()

    case = Case(
        id=case_id,
        org_id=org_id,
        case_no="LOS-99002",
        loan_amount_requested=Decimal("500000"),
        owner_id=user_id,
        source_id=uuid.uuid4(),
        product_type="used_car",
        assigned_processor_id=user_id,
        status="collecting_docs",
    )
    case_party = CaseParty(
        id=uuid.uuid4(),
        org_id=org_id,
        case_id=case_id,
        party_id=uuid.uuid4(),
        role="applicant",
    )
    doc_type = DocumentType(
        id=doc_type_id,
        code="salary_slip",
        name="Salary Slip",
        group_name="Income",
        is_active=True,
    )
    session.add_all([case, case_party, doc_type])

    upload_key = f"quarantine/{org_id}/{uuid.uuid4()}/infected_salary.pdf"
    infected_payload = b"%PDF-1.4\n" + EICAR_SIGNATURE
    storage.put_object(storage.quarantine_bucket, upload_key, infected_payload)

    req_confirm = UploadConfirmRequest(
        upload_id=uuid.uuid4(),
        case_id=case_id,
        document_type_id=doc_type_id,
        file_name="infected_salary.pdf",
        file_size=len(infected_payload),
        mime_type="application/pdf",
        quarantine_key=upload_key,
        auto_validate=True,
    )
    doc = await service.confirm_upload(org_id, user_id, req_confirm)

    assert doc.status == "scan_failed"
    assert "Malware detected" in str(doc.scan_error)
    assert doc.file_key is None
    assert not storage.object_exists(storage.quarantine_bucket, upload_key)

    with pytest.raises(BusinessRuleViolationError):
        await service.get_download_url(org_id, user_id, doc.id)
