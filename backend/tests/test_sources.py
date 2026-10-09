"""
DSA OS — Sources Domain Tests
"""

import uuid
from decimal import Decimal

import pytest
from app.modules.sources.schemas import SourceCreate, SourceUpdate
from app.modules.sources.service import SourceService


class MockSourceDbSession:
    def __init__(self) -> None:
        self.sources: dict[uuid.UUID, dict] = {}

    def add(self, entity) -> None:
        self.sources[entity.id] = entity

    async def commit(self) -> None:
        pass

    async def refresh(self, entity) -> None:
        pass

    async def execute(self, stmt):
        class MockResult:
            def __init__(self, items):
                self._items = items

            def scalars(self):
                class S:
                    def __init__(self, it):
                        self._it = it

                    def all(self):
                        return self._it

                return S(self._items)

            def scalar_one_or_none(self):
                return self._items[0] if self._items else None

        return MockResult(list(self.sources.values()))


@pytest.mark.asyncio
class TestSourcesUnit:
    async def test_source_lifecycle(self) -> None:
        org_id = uuid.uuid4()
        session = MockSourceDbSession()
        service = SourceService(session=session)  # type: ignore[arg-type]

        create_payload = SourceCreate(
            name="Apex Auto Dealership",
            type="dealer",
            contact_person="Rohan Kapoor",
            phone="9876500001",
            payout_rate_default=Decimal("1.25"),
        )
        source = await service.create_source(org_id=org_id, payload=create_payload)
        assert source.name == "Apex Auto Dealership"
        assert source.type == "dealer"
        assert source.payout_rate_default == Decimal("1.25")

        update_payload = SourceUpdate(payout_rate_default=Decimal("1.50"))
        updated = await service.update_source(
            org_id=org_id, source_id=source.id, payload=update_payload
        )
        assert updated.payout_rate_default == Decimal("1.50")
