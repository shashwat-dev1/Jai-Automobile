"""
DSA OS — System Hardening, Security, Compliance & Data Import Test Suite (Phase 10)

Verifies:
- FR-AUTH-004: TOTP 2FA setup, RFC 6238 verification with drift, single-use recovery codes, and mandatory checks
- FR-PRV-003: DSAR logging with 30-day statutory due date and consent withdrawal
- FR-PRV-004: Retention schedule configuration and legal hold enforcement
- FR-PRV-005: Breach register incident logging and triage runbook
- FR-IMP-001..003: Generic CSV dry-run validation, commit, and 24-hour reversal rollback
- FR-DOC-009 & NFR-SEC-010: Image-to-PDF merge and security download watermarking
"""

import io
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from app.modules.auth.models import User
from app.modules.auth.totp_service import TOTPService
from app.modules.documents.watermark_service import DocumentWatermarkService
from app.modules.import_export.models import DataImportBatch
from app.modules.import_export.service import ImportExportService
from app.modules.lenders.models import Lender
from app.modules.parties.models import Party
from app.modules.privacy.models import (
    BreachRegister,
    DataSubjectRequest,
    RetentionSchedule,
    UserTOTP,
)
from app.modules.privacy.schemas import (
    BreachCreateRequest,
    BreachUpdateRequest,
    DSARCreateRequest,
    DSARUpdateRequest,
    RetentionScheduleUpdate,
)
from app.modules.privacy.service import PrivacyService
from app.modules.sources.models import Source
from app.shared.exceptions import BusinessRuleViolationError
from PIL import Image


class MockResult:
    def __init__(self, data: list[Any]):
        self._data = data

    def scalars(self) -> "MockResult":
        return self

    def all(self) -> list[Any]:
        return list(self._data)

    def scalar_one_or_none(self) -> Any:
        return self._data[0] if self._data else None

    def scalar_one(self) -> Any:
        if not self._data:
            raise ValueError("No rows found")
        return self._data[0]

    def scalar(self) -> Any:
        return self._data[0] if self._data else 0


class MockHardeningDbSession:
    """In-memory mock supporting async session queries for hardening and privacy tests."""

    def __init__(self) -> None:
        self.totp_records: dict[uuid.UUID, UserTOTP] = {}
        self.dsars: dict[uuid.UUID, DataSubjectRequest] = {}
        self.breaches: dict[uuid.UUID, BreachRegister] = {}
        self.retention_schedules: dict[uuid.UUID, RetentionSchedule] = {}
        self.import_batches: dict[uuid.UUID, DataImportBatch] = {}
        self.parties: dict[uuid.UUID, Party] = {}
        self.sources: dict[uuid.UUID, Source] = {}
        self.lenders: dict[uuid.UUID, Lender] = {}
        self.users: dict[uuid.UUID, User] = {}

    def add(self, entity: Any) -> None:
        now = datetime.now(UTC)
        if hasattr(entity, "id") and entity.id is None:
            entity.id = uuid.uuid4()
        if hasattr(entity, "created_at") and getattr(entity, "created_at", None) is None:
            entity.created_at = now
        if hasattr(entity, "updated_at") and getattr(entity, "updated_at", None) is None:
            entity.updated_at = now

        if isinstance(entity, UserTOTP):
            self.totp_records[entity.id] = entity
        elif isinstance(entity, DataSubjectRequest):
            self.dsars[entity.id] = entity
        elif isinstance(entity, BreachRegister):
            self.breaches[entity.id] = entity
        elif isinstance(entity, RetentionSchedule):
            self.retention_schedules[entity.id] = entity
        elif isinstance(entity, DataImportBatch):
            self.import_batches[entity.id] = entity
        elif isinstance(entity, Party):
            self.parties[entity.id] = entity
        elif isinstance(entity, Source):
            self.sources[entity.id] = entity
        elif isinstance(entity, Lender):
            self.lenders[entity.id] = entity
        elif isinstance(entity, User):
            self.users[entity.id] = entity

    async def flush(self) -> None:
        pass

    async def commit(self) -> None:
        pass

    async def execute(self, statement: Any) -> MockResult:
        query_str = str(statement).lower()

        if "count(" in query_str:
            if "breach_register" in query_str:
                return MockResult([len(self.breaches)])
            return MockResult([0])

        if "delete from" in query_str:
            # Reversal deletes
            if "from parties" in query_str:
                self.parties.clear()
            elif "from sources" in query_str:
                self.sources.clear()
            elif "from lenders" in query_str:
                self.lenders.clear()
            return MockResult([1])

        if "from user_totp" in query_str:
            return MockResult(list(self.totp_records.values()))

        if "from data_subject_requests" in query_str:
            return MockResult(list(self.dsars.values()))

        if "from breach_register" in query_str:
            return MockResult(list(self.breaches.values()))

        if "from retention_schedules" in query_str:
            return MockResult(list(self.retention_schedules.values()))

        if "from data_import_batches" in query_str:
            return MockResult(list(self.import_batches.values()))

        if "from users" in query_str:
            return MockResult(list(self.users.values()))

        return MockResult([])


# -----------------------------------------------------------------------------
# 1. TOTP & 2FA Tests (FR-AUTH-004)
# -----------------------------------------------------------------------------
def test_totp_code_generation_and_verification() -> None:
    """Verifies RFC 6238 TOTP computation and verification with clock drift tolerance."""
    secret = TOTPService.generate_secret()
    assert len(secret) >= 24

    # Current token
    code = TOTPService.get_totp_code(secret)
    assert len(code) == 6
    assert code.isdigit()

    # Immediate verification succeeds
    assert TOTPService.verify_code(secret, code, drift=1) is True

    # Bad token fails
    assert TOTPService.verify_code(secret, "999999", drift=1) is False

    # Drift tolerance (+30s)
    future_code = TOTPService.get_totp_code(secret, for_time=datetime.now(UTC).timestamp() + 30)
    assert TOTPService.verify_code(secret, future_code, drift=1) is True


def test_totp_recovery_codes() -> None:
    """Verifies recovery code generation, hashing, and single-use consumption."""
    plain_codes = TOTPService.generate_recovery_codes(8)
    assert len(plain_codes) == 8

    hashed_codes = [TOTPService.hash_code(c) for c in plain_codes]
    first_code = plain_codes[0]

    # First use consumes the code
    valid, remaining = TOTPService.verify_and_consume_recovery_code(first_code, hashed_codes)
    assert valid is True
    assert len(remaining) == 7

    # Re-using consumed code fails
    valid_again, remaining_again = TOTPService.verify_and_consume_recovery_code(first_code, remaining)
    assert valid_again is False
    assert len(remaining_again) == 7


def test_role_2fa_mandatory() -> None:
    """Verifies FR-AUTH-004 2FA requirement for Owner and Accountant."""
    assert TOTPService.is_2fa_mandatory_for_role("owner") is True
    assert TOTPService.is_2fa_mandatory_for_role("accountant") is True
    assert TOTPService.is_2fa_mandatory_for_role("case_officer") is False
    assert TOTPService.is_2fa_mandatory_for_role("field_executive") is False


@pytest.mark.asyncio
async def test_privacy_service_totp_flow() -> None:
    """Tests 2FA setup and enable workflow via PrivacyService."""
    db = MockHardeningDbSession()
    org_id = uuid.uuid4()
    user = User(
        id=uuid.uuid4(),
        org_id=org_id,
        name="Rohan Verma",
        email="rohan@example.com",
        role="owner",
        password_hash="mock",
        is_active=True,
    )
    db.add(user)

    service = PrivacyService(db)  # type: ignore[arg-type]

    # Setup
    setup_data = await service.setup_totp(org_id, user)
    assert setup_data.secret
    assert "otpauth://" in setup_data.provisioning_uri
    assert len(setup_data.recovery_codes) == 8

    # Verify with current code
    valid_code = TOTPService.get_totp_code(setup_data.secret)
    enabled = await service.verify_and_enable_totp(org_id, user.id, valid_code)
    assert enabled is True

    # Check status
    status = await service.get_totp_status(org_id, user)
    assert status.is_enabled is True
    assert status.is_mandatory is True
    assert status.recovery_codes_remaining == 8


# -----------------------------------------------------------------------------
# 2. DSAR & Consent Withdrawal (FR-PRV-003)
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_dsar_lifecycle_and_due_date() -> None:
    """Verifies DSAR logging, statutory 30-day deadline, and resolution."""
    db = MockHardeningDbSession()
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    party_id = uuid.uuid4()

    service = PrivacyService(db)  # type: ignore[arg-type]

    # Create DSAR
    req = DSARCreateRequest(
        party_id=party_id,
        request_type="consent_withdrawal",
        requested_by="Customer via legal notice",
        notes="Customer requests withdrawal of consent for marketing and loan processing.",
    )
    dsar = await service.create_dsar(org_id, user_id, req)
    assert dsar.status == "pending"
    assert dsar.due_date == date.today() + timedelta(days=30)

    # Update to completed
    updated = await service.update_dsar(
        org_id,
        dsar.id,
        DSARUpdateRequest(status="completed", notes="Consent flag updated in customer profile."),
    )
    assert updated.status == "completed"
    assert updated.completed_at is not None


# -----------------------------------------------------------------------------
# 3. Breach Register (FR-PRV-005)
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_breach_register_incident_flow() -> None:
    """Verifies incident logging, automatic ref formatting, and triage updates."""
    db = MockHardeningDbSession()
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()

    service = PrivacyService(db)  # type: ignore[arg-type]

    breach_req = BreachCreateRequest(
        severity="high",
        detected_at=datetime.now(UTC),
        description="Suspicious login attempt from untrusted IP block.",
        containment_steps="Blocked IP range and rotated session keys.",
        affected_parties_count=0,
    )
    incident = await service.create_breach(org_id, user_id, breach_req)
    assert "INC-" in incident.incident_ref
    assert incident.status == "reported"

    # Triage and contain
    updated = await service.update_breach(
        org_id,
        incident.id,
        BreachUpdateRequest(status="contained", containment_steps="Firewall rule active."),
    )
    assert updated.status == "contained"


# -----------------------------------------------------------------------------
# 4. Retention Schedules (FR-PRV-004)
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_retention_schedule_and_legal_hold() -> None:
    """Verifies statutory retention configuration and legal hold toggling."""
    db = MockHardeningDbSession()
    org_id = uuid.uuid4()
    service = PrivacyService(db)  # type: ignore[arg-type]

    # Default schedule
    schedule = await service.get_or_create_retention_schedule(org_id, "cases")
    assert schedule.retention_years == 8
    assert schedule.legal_hold is False

    # Apply legal hold
    updated = await service.update_retention_schedule(
        org_id,
        "cases",
        RetentionScheduleUpdate(retention_years=10, legal_hold=True),
    )
    assert updated.retention_years == 10
    assert updated.legal_hold is True


# -----------------------------------------------------------------------------
# 5. Generic Data Import & 24h Reversal (FR-IMP-001..003)
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_csv_import_dry_run_and_commit() -> None:
    """Verifies CSV dry run validation and commit with 24h reversal window."""
    db = MockHardeningDbSession()
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    service = ImportExportService(db)  # type: ignore[arg-type]

    csv_data = """name,mobile,employment_type
Arun Kumar,9876543210,salaried
Invalid User,1234,self_employed
Pooja Mehta,9812345678,self_employed
"""

    # Dry run
    report = service.dry_run_csv("parties", csv_data)
    assert report.total_rows == 3
    assert report.valid_rows == 2
    assert report.error_rows == 1
    assert len(report.errors) == 1
    assert report.errors[0].field == "mobile"

    # Commit valid rows
    batch = await service.commit_import(
        org_id=org_id,
        user_id=user_id,
        entity_type="parties",
        filename="parties.csv",
        records=report.valid_records,
    )
    assert batch.status == "committed"
    assert len(batch.imported_ids) == 2
    assert batch.can_reverse_until is not None
    assert len(db.parties) == 2

    # Reverse within window
    reversed_batch = await service.reverse_import(org_id, batch.id)
    assert reversed_batch.status == "reversed"
    assert len(db.parties) == 0


@pytest.mark.asyncio
async def test_reversal_fails_after_24h_window() -> None:
    """Verifies rollback fails if 24-hour window has expired (FR-IMP-003)."""
    db = MockHardeningDbSession()
    org_id = uuid.uuid4()
    user_id = uuid.uuid4()
    service = ImportExportService(db)  # type: ignore[arg-type]

    batch = DataImportBatch(
        id=uuid.uuid4(),
        org_id=org_id,
        entity_type="parties",
        filename="old.csv",
        total_rows=1,
        valid_rows=1,
        status="committed",
        can_reverse_until=datetime.now(UTC) - timedelta(hours=2),  # Expired
        imported_ids=[str(uuid.uuid4())],
        created_by=user_id,
    )
    db.add(batch)

    with pytest.raises(BusinessRuleViolationError) as exc_info:
        await service.reverse_import(org_id, batch.id)
    assert "24-hour" in str(exc_info.value)


# -----------------------------------------------------------------------------
# 6. Document Watermarking & PDF Merging (FR-DOC-009, NFR-SEC-010)
# -----------------------------------------------------------------------------
def test_image_to_pdf_merge_and_watermark() -> None:
    """Verifies merging images to single valid PDF with security watermark."""
    # Create two test images
    img1 = Image.new("RGB", (200, 200), color="white")
    buf1 = io.BytesIO()
    img1.save(buf1, format="JPEG")
    bytes1 = buf1.getvalue()

    img2 = Image.new("RGB", (300, 300), color="lightgray")
    buf2 = io.BytesIO()
    img2.save(buf2, format="PNG")
    bytes2 = buf2.getvalue()

    # Watermarked PDF export
    pdf_bytes = DocumentWatermarkService.create_watermarked_export(
        image_bytes_list=[bytes1, bytes2],
        user_name="Deepak Officer",
        user_id="usr-12345678",
    )

    assert len(pdf_bytes) > 1000
    assert pdf_bytes.startswith(b"%PDF-")  # Valid PDF header
