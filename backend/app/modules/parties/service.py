"""
DSA OS — Party Service

Handles party CRUD, duplicate detection, encryption/decryption, and audited reveal.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.service import AuditService
from app.modules.parties.models import Party
from app.modules.parties.schemas import (
    DuplicatePartyWarning,
    PartyCreate,
    PartyResponse,
    PartyRevealRequest,
    PartyRevealResponse,
    PartyUpdate,
)
from app.shared.encryption import (
    decrypt_field,
    encrypt_field,
    mask_aadhaar,
    mask_mobile,
    mask_pan,
)
from app.shared.exceptions import ConflictError, NotFoundError


class PartyService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit = AuditService(session=session)

    async def check_duplicates(
        self,
        org_id: uuid.UUID,
        mobile: str,
        pan_last_four: str | None = None,
    ) -> list[DuplicatePartyWarning]:
        """Check for existing parties with matching mobile or PAN last four."""
        warnings: list[DuplicatePartyWarning] = []

        # 1. Match on primary mobile
        stmt_mobile = select(Party).where(
            Party.org_id == org_id,
            Party.mobile_primary == mobile,
            Party.deleted_at.is_(None),
        )
        res_mobile = await self.session.execute(stmt_mobile)
        existing_mobiles = res_mobile.scalars().all()
        for p in existing_mobiles:
            warnings.append(
                DuplicatePartyWarning(
                    party_id=p.id,
                    name=p.name,
                    match_type="exact_mobile",
                    details=f"Party with mobile '{mask_mobile(mobile)}' already exists.",
                )
            )

        # 2. Match on PAN last four (if provided)
        if pan_last_four:
            stmt_pan = select(Party).where(
                Party.org_id == org_id,
                Party.pan_last_four == pan_last_four,
                Party.deleted_at.is_(None),
            )
            res_pan = await self.session.execute(stmt_pan)
            existing_pans = res_pan.scalars().all()
            for p in existing_pans:
                # Avoid duplicate warning if already matched on mobile
                if p.id not in [w.party_id for w in warnings]:
                    warnings.append(
                        DuplicatePartyWarning(
                            party_id=p.id,
                            name=p.name,
                            match_type="pan_match",
                            details=f"Party '{p.name}' shares the same PAN ending in '{pan_last_four}'.",
                        )
                    )

        return warnings

    async def create_party(
        self,
        org_id: uuid.UUID,
        payload: PartyCreate,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> tuple[PartyResponse, list[DuplicatePartyWarning]]:
        """Create a new party entity with encrypted PAN and duplicate detection."""
        pan_last_four = payload.pan[-4:] if payload.pan else None
        duplicate_warnings = await self.check_duplicates(
            org_id=org_id,
            mobile=payload.mobile_primary,
            pan_last_four=pan_last_four,
        )

        pan_encrypted = encrypt_field(payload.pan) if payload.pan else None

        party = Party(
            id=uuid.uuid4(),
            org_id=org_id,
            name=payload.name.strip(),
            mobile_primary=payload.mobile_primary,
            mobile_secondary=payload.mobile_secondary,
            email=payload.email.strip().lower() if payload.email else None,
            pan_encrypted=pan_encrypted,
            pan_last_four=pan_last_four,
            aadhaar_last_four=payload.aadhaar_last_four,
            employment_type=payload.employment_type,
            dob=payload.dob,
            address_line1=payload.address_line1,
            address_line2=payload.address_line2,
            city=payload.city,
            state=payload.state,
            pincode=payload.pincode,
            monthly_income=payload.monthly_income,
            version=1,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        self.session.add(party)
        await self.session.commit()
        await self.session.refresh(party)

        await self.audit.log_event(
            org_id=org_id,
            actor_id=actor_id,
            actor_role=actor_role,
            action="party.created",
            entity_type="party",
            entity_id=str(party.id),
            changes={"name": party.name, "mobile": mask_mobile(party.mobile_primary)},
        )

        return self._to_response(party), duplicate_warnings

    async def get_party(self, org_id: uuid.UUID, party_id: uuid.UUID) -> PartyResponse:
        """Fetch a party by ID and return masked presentation."""
        party = await self._get_entity(org_id, party_id)
        return self._to_response(party)

    async def update_party(
        self,
        org_id: uuid.UUID,
        party_id: uuid.UUID,
        payload: PartyUpdate,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> PartyResponse:
        """Update party using optimistic locking on version column."""
        party = await self._get_entity(org_id, party_id)

        # Optimistic locking check
        if party.version != payload.version:
            raise ConflictError(
                "Party record has been modified by another user. Please reload and review recent changes.",
                code="OPTIMISTIC_LOCK_CONFLICT",
            )

        update_dict = payload.model_dump(exclude_unset=True, exclude={"version"})
        for key, val in update_dict.items():
            setattr(party, key, val)

        party.version += 1
        party.updated_at = datetime.now(UTC)

        await self.session.commit()
        await self.session.refresh(party)

        await self.audit.log_event(
            org_id=org_id,
            actor_id=actor_id,
            actor_role=actor_role,
            action="party.updated",
            entity_type="party",
            entity_id=str(party.id),
            changes={"updated_fields": list(update_dict.keys()), "version": party.version},
        )

        return self._to_response(party)

    async def reveal_sensitive_field(
        self,
        org_id: uuid.UUID,
        party_id: uuid.UUID,
        payload: PartyRevealRequest,
        actor_id: uuid.UUID,
        actor_role: str,
        ip_address: str | None = None,
    ) -> PartyRevealResponse:
        """
        Reveal full plaintext PAN or primary mobile for authorized users.
        MANDATORY: Records an immutable audit event per NFR-SEC-008.
        """
        party = await self._get_entity(org_id, party_id)

        value = ""
        if payload.field_name == "pan":
            if not party.pan_encrypted:
                raise NotFoundError("PAN not on file for this party.")
            value = decrypt_field(party.pan_encrypted) or ""
        elif payload.field_name == "mobile_primary":
            value = party.mobile_primary

        # Audit log the sensitive data access
        await self.audit.log_event(
            org_id=org_id,
            actor_id=actor_id,
            actor_role=actor_role,
            action="party.pii_revealed",
            entity_type="party",
            entity_id=str(party.id),
            ip_address=ip_address,
            changes={"revealed_field": payload.field_name, "reason": payload.reason},
        )

        return PartyRevealResponse(
            field_name=payload.field_name,
            value=value,
            revealed_at=datetime.now(UTC),
        )

    async def search_parties(
        self,
        org_id: uuid.UUID,
        query: str | None = None,
        mobile: str | None = None,
        pan_last_four: str | None = None,
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[list[PartyResponse], int]:
        """Search parties with filters and pagination."""
        stmt = select(Party).where(Party.org_id == org_id, Party.deleted_at.is_(None))

        if query:
            q_clean = query.strip()
            stmt = stmt.where(
                or_(
                    Party.name.ilike(f"%{q_clean}%"),
                    Party.email.ilike(f"%{q_clean}%"),
                    Party.city.ilike(f"%{q_clean}%"),
                )
            )

        if mobile:
            stmt = stmt.where(Party.mobile_primary.ilike(f"%{mobile.strip()}%"))

        if pan_last_four:
            stmt = stmt.where(Party.pan_last_four == pan_last_four.strip().upper())

        # Count total
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.session.execute(count_stmt)).scalar_one()

        # Fetch page
        stmt = (
            stmt.order_by(Party.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        )
        res = await self.session.execute(stmt)
        parties = res.scalars().all()

        return [self._to_response(p) for p in parties], total

    async def _get_entity(self, org_id: uuid.UUID, party_id: uuid.UUID) -> Party:
        stmt = select(Party).where(
            Party.id == party_id,
            Party.org_id == org_id,
            Party.deleted_at.is_(None),
        )
        res = await self.session.execute(stmt)
        party = res.scalar_one_or_none()
        if not party:
            raise NotFoundError(f"Party with ID '{party_id}' not found.")
        return party

    def _to_response(self, party: Party) -> PartyResponse:
        """Map SQLAlchemy model to masked PartyResponse."""
        pan_masked = mask_pan(f"XXXXXX{party.pan_last_four}") if party.pan_last_four else None
        aadhaar_masked = mask_aadhaar(party.aadhaar_last_four) if party.aadhaar_last_four else None

        return PartyResponse(
            id=party.id,
            org_id=party.org_id,
            name=party.name,
            mobile_primary=mask_mobile(party.mobile_primary) or party.mobile_primary,
            mobile_secondary=mask_mobile(party.mobile_secondary),
            email=party.email,
            pan_last_four=party.pan_last_four,
            pan_masked=pan_masked,
            aadhaar_masked=aadhaar_masked,
            employment_type=party.employment_type,
            city=party.city,
            state=party.state,
            monthly_income=party.monthly_income,
            version=party.version,
            created_at=party.created_at,
        )
