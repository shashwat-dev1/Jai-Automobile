"""
DSA OS — Sources Service
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.sources.models import Source
from app.modules.sources.schemas import SourceCreate, SourceResponse, SourceUpdate
from app.shared.exceptions import NotFoundError


class SourceService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_sources(
        self, org_id: uuid.UUID, active_only: bool = True
    ) -> list[SourceResponse]:
        stmt = select(Source).where(Source.org_id == org_id, Source.deleted_at.is_(None))
        if active_only:
            stmt = stmt.where(Source.is_active.is_(True))
        stmt = stmt.order_by(Source.name.asc())
        res = await self.session.execute(stmt)
        sources = res.scalars().all()
        return [SourceResponse.model_validate(s) for s in sources]

    async def get_source(self, org_id: uuid.UUID, source_id: uuid.UUID) -> SourceResponse:
        stmt = select(Source).where(
            Source.id == source_id,
            Source.org_id == org_id,
            Source.deleted_at.is_(None),
        )
        res = await self.session.execute(stmt)
        source = res.scalar_one_or_none()
        if not source:
            raise NotFoundError(f"Source '{source_id}' not found.")
        return SourceResponse.model_validate(source)

    async def create_source(self, org_id: uuid.UUID, payload: SourceCreate) -> SourceResponse:
        source = Source(
            id=uuid.uuid4(),
            org_id=org_id,
            name=payload.name.strip(),
            type=payload.type,
            parent_id=payload.parent_id,
            contact_person=payload.contact_person,
            phone=payload.phone,
            email=payload.email,
            payout_rate_default=payload.payout_rate_default,
            is_active=payload.is_active,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        self.session.add(source)
        await self.session.commit()
        await self.session.refresh(source)
        return SourceResponse.model_validate(source)

    async def update_source(
        self, org_id: uuid.UUID, source_id: uuid.UUID, payload: SourceUpdate
    ) -> SourceResponse:
        stmt = select(Source).where(
            Source.id == source_id,
            Source.org_id == org_id,
            Source.deleted_at.is_(None),
        )
        res = await self.session.execute(stmt)
        source = res.scalar_one_or_none()
        if not source:
            raise NotFoundError(f"Source '{source_id}' not found.")

        for key, val in payload.model_dump(exclude_unset=True).items():
            setattr(source, key, val)

        await self.session.commit()
        await self.session.refresh(source)
        return SourceResponse.model_validate(source)
