"""
DSA OS — Privacy, Security & Compliance Service

Implements:
- FR-AUTH-004: TOTP 2FA setup, verification, recovery code validation
- FR-PRV-003: DSAR (Data Subject Access Request) and Consent Withdrawal logging
- FR-PRV-004: Configurable retention schedule and legal-hold enforcement
- FR-PRV-005: Personal-data breach register and incident triage
"""

import logging
import uuid
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User
from app.modules.auth.totp_service import TOTPService
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
    TOTPSetupResponse,
    TOTPStatusResponse,
)
from app.shared.exceptions import NotFoundError, ValidationError

logger = logging.getLogger(__name__)


class PrivacyService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # -------------------------------------------------------------------------
    # 1. 2FA / TOTP Management (FR-AUTH-004)
    # -------------------------------------------------------------------------
    async def get_totp_status(self, org_id: uuid.UUID, user: User) -> TOTPStatusResponse:
        """Fetch 2FA status for user, including role mandatory flag."""
        stmt = select(UserTOTP).where(UserTOTP.org_id == org_id, UserTOTP.user_id == user.id)
        res = await self.db.execute(stmt)
        record = res.scalar_one_or_none()

        is_enabled = record.is_enabled if record else False
        remaining = len(record.recovery_codes) if (record and record.recovery_codes) else 0
        mandatory = TOTPService.is_2fa_mandatory_for_role(user.role)

        return TOTPStatusResponse(
            is_enabled=is_enabled,
            is_mandatory=mandatory,
            recovery_codes_remaining=remaining,
        )

    async def setup_totp(self, org_id: uuid.UUID, user: User) -> TOTPSetupResponse:
        """Generate a new TOTP secret and recovery codes."""
        secret = TOTPService.generate_secret()
        plain_codes = TOTPService.generate_recovery_codes(8)
        hashed_codes = [TOTPService.hash_code(c) for c in plain_codes]
        uri = TOTPService.get_provisioning_uri(secret, user.email or str(user.id), issuer="DSA OS")

        stmt = select(UserTOTP).where(UserTOTP.org_id == org_id, UserTOTP.user_id == user.id)
        res = await self.db.execute(stmt)
        record = res.scalar_one_or_none()

        if not record:
            record = UserTOTP(
                id=uuid.uuid4(),
                org_id=org_id,
                user_id=user.id,
                secret=secret,
                is_enabled=False,
                recovery_codes=hashed_codes,
            )
            self.db.add(record)
        else:
            record.secret = secret
            record.recovery_codes = hashed_codes
            record.is_enabled = False
            record.confirmed_at = None

        await self.db.flush()

        return TOTPSetupResponse(
            secret=secret,
            provisioning_uri=uri,
            recovery_codes=plain_codes,
        )

    async def verify_and_enable_totp(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        code: str,
    ) -> bool:
        """Verify the 6-digit TOTP code and enable 2FA."""
        stmt = select(UserTOTP).where(UserTOTP.org_id == org_id, UserTOTP.user_id == user_id)
        res = await self.db.execute(stmt)
        record = res.scalar_one_or_none()

        if not record:
            raise NotFoundError("UserTOTP", str(user_id))

        if not TOTPService.verify_code(record.secret, code):
            raise ValidationError("Invalid 6-digit verification code. Please check your authenticator app.")

        record.is_enabled = True
        record.confirmed_at = datetime.now(UTC)
        await self.db.flush()
        return True

    # -------------------------------------------------------------------------
    # 2. DSAR & Consent Withdrawal (FR-PRV-003)
    # -------------------------------------------------------------------------
    async def create_dsar(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: DSARCreateRequest,
    ) -> DataSubjectRequest:
        """Create a new DSAR request with a default 30-day compliance deadline."""
        valid_types = ("access", "correction", "erasure", "consent_withdrawal")
        if data.request_type not in valid_types:
            raise ValidationError(f"Invalid request_type '{data.request_type}'. Must be one of: {valid_types}")

        due = date.today() + timedelta(days=30)
        dsar = DataSubjectRequest(
            id=uuid.uuid4(),
            org_id=org_id,
            party_id=data.party_id,
            request_type=data.request_type,
            status="pending",
            due_date=due,
            requested_by=data.requested_by,
            notes=data.notes,
            created_by=user_id,
        )
        self.db.add(dsar)
        await self.db.flush()
        return dsar

    async def list_dsars(
        self,
        org_id: uuid.UUID,
        status: str | None = None,
        limit: int = 50,
    ) -> list[DataSubjectRequest]:
        """List DSAR records for tenant."""
        filters = [DataSubjectRequest.org_id == org_id]
        if status:
            filters.append(DataSubjectRequest.status == status)

        stmt = select(DataSubjectRequest).where(and_(*filters)).order_by(DataSubjectRequest.created_at.desc()).limit(limit)
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def update_dsar(
        self,
        org_id: uuid.UUID,
        dsar_id: uuid.UUID,
        data: DSARUpdateRequest,
    ) -> DataSubjectRequest:
        """Update status or resolution notes of a DSAR."""
        stmt = select(DataSubjectRequest).where(DataSubjectRequest.id == dsar_id, DataSubjectRequest.org_id == org_id)
        res = await self.db.execute(stmt)
        dsar = res.scalar_one_or_none()
        if not dsar:
            raise NotFoundError("DataSubjectRequest", str(dsar_id))

        if data.status is not None:
            dsar.status = data.status
            if data.status in ("completed", "rejected"):
                dsar.completed_at = datetime.now(UTC)

        if data.rejection_reason is not None:
            dsar.rejection_reason = data.rejection_reason
        if data.notes is not None:
            dsar.notes = data.notes

        await self.db.flush()
        return dsar

    # -------------------------------------------------------------------------
    # 3. Breach Register (FR-PRV-005)
    # -------------------------------------------------------------------------
    async def create_breach(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        data: BreachCreateRequest,
    ) -> BreachRegister:
        """Register a potential security/data incident with automatic ref number."""
        count_stmt = select(func.count(BreachRegister.id)).where(BreachRegister.org_id == org_id)
        count_res = await self.db.execute(count_stmt)
        total = (count_res.scalar_one() or 0) + 1
        year = datetime.now(UTC).year
        ref = f"INC-{year}-{str(total).zfill(3)}"

        breach = BreachRegister(
            id=uuid.uuid4(),
            org_id=org_id,
            incident_ref=ref,
            severity=data.severity,
            status="reported",
            detected_at=data.detected_at,
            triaged_at=datetime.now(UTC),
            description=data.description,
            containment_steps=data.containment_steps,
            affected_parties_count=data.affected_parties_count,
            reported_by=user_id,
        )
        self.db.add(breach)
        await self.db.flush()
        return breach

    async def list_breaches(
        self,
        org_id: uuid.UUID,
        status: str | None = None,
        limit: int = 50,
    ) -> list[BreachRegister]:
        """List reported incidents."""
        filters = [BreachRegister.org_id == org_id]
        if status:
            filters.append(BreachRegister.status == status)

        stmt = select(BreachRegister).where(and_(*filters)).order_by(BreachRegister.detected_at.desc()).limit(limit)
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def update_breach(
        self,
        org_id: uuid.UUID,
        breach_id: uuid.UUID,
        data: BreachUpdateRequest,
    ) -> BreachRegister:
        """Update containment or resolution status of an incident."""
        stmt = select(BreachRegister).where(BreachRegister.id == breach_id, BreachRegister.org_id == org_id)
        res = await self.db.execute(stmt)
        breach = res.scalar_one_or_none()
        if not breach:
            raise NotFoundError("BreachRegister", str(breach_id))

        if data.status is not None:
            breach.status = data.status
        if data.containment_steps is not None:
            breach.containment_steps = data.containment_steps
        if data.affected_parties_count is not None:
            breach.affected_parties_count = data.affected_parties_count

        await self.db.flush()
        return breach

    # -------------------------------------------------------------------------
    # 4. Retention Schedules (FR-PRV-004)
    # -------------------------------------------------------------------------
    async def get_or_create_retention_schedule(
        self,
        org_id: uuid.UUID,
        entity_type: str,
    ) -> RetentionSchedule:
        """Get or initialize retention schedule for entity type."""
        stmt = select(RetentionSchedule).where(
            RetentionSchedule.org_id == org_id,
            RetentionSchedule.entity_type == entity_type,
        )
        res = await self.db.execute(stmt)
        schedule = res.scalar_one_or_none()

        if not schedule:
            schedule = RetentionSchedule(
                id=uuid.uuid4(),
                org_id=org_id,
                entity_type=entity_type,
                retention_years=8,  # Default RBI/statutory 8-year standard
                legal_hold=False,
            )
            self.db.add(schedule)
            await self.db.flush()

        return schedule

    async def update_retention_schedule(
        self,
        org_id: uuid.UUID,
        entity_type: str,
        data: RetentionScheduleUpdate,
    ) -> RetentionSchedule:
        """Update retention period or toggle legal hold."""
        schedule = await self.get_or_create_retention_schedule(org_id, entity_type)
        if data.retention_years is not None:
            schedule.retention_years = data.retention_years
        if data.legal_hold is not None:
            schedule.legal_hold = data.legal_hold

        await self.db.flush()
        return schedule
