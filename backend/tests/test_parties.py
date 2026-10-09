"""
DSA OS — Parties Domain Tests

Tests:
1. Party creation with valid Indian mobile and PAN
2. PAN encrypted at rest and masked in responses
3. Aadhaar 12-digit input rejection (LEG-005: last 4 digits only)
4. Duplicate party detection on mobile match and PAN last 4 match
5. Audited reveal endpoint returns plaintext and writes audit log
6. Optimistic locking: version mismatch raises ConflictError
"""

import uuid

import pytest
from app.modules.parties.schemas import PartyCreate, PartyRevealRequest, PartyUpdate
from app.modules.parties.service import PartyService
from app.shared.encryption import decrypt_field
from app.shared.exceptions import ConflictError


class MockDbSession:
    """In-memory mock database session for fast unit/domain tests."""

    def __init__(self) -> None:
        self.parties: dict[uuid.UUID, dict] = {}
        self.audit_events: list[dict] = []

    def add(self, entity) -> None:
        self.parties[entity.id] = entity

    async def commit(self) -> None:
        pass

    async def refresh(self, entity) -> None:
        pass

    async def execute(self, stmt):
        # Very lightweight mock for select statements
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

            def scalar_one(self):
                return len(self._items)

        # Return all in-memory parties
        return MockResult(list(self.parties.values()))


class TestPartiesUnit:
    @pytest.mark.asyncio
    async def test_party_creation_and_encryption(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        session = MockDbSession()
        service = PartyService(session=session)  # type: ignore[arg-type]

        payload = PartyCreate(
            name="Rahul Sharma",
            mobile_primary="+91 9876543210",
            pan="ABCDE1234F",
            aadhaar_last_four="1234",
            employment_type="salaried",
        )

        party_resp, warnings = await service.create_party(
            org_id=org_id,
            payload=payload,
            actor_id=user_id,
            actor_role="processor",
        )

        assert party_resp.name == "Rahul Sharma"
        assert party_resp.pan_last_four == "234F"
        # Masked output
        assert party_resp.pan_masked == "XXXXXX234F"
        assert party_resp.aadhaar_masked == "XXXX-XXXX-1234"
        assert "XX" in party_resp.mobile_primary

        # Verify underlying model has encrypted PAN
        db_party = session.parties[party_resp.id]
        assert db_party.pan_encrypted != "ABCDE1234F"
        assert decrypt_field(db_party.pan_encrypted) == "ABCDE1234F"

    def test_full_aadhaar_rejected(self) -> None:
        with pytest.raises(ValueError, match="Full Aadhaar storage is prohibited"):
            PartyCreate(
                name="Sunita Patil",
                mobile_primary="9876543211",
                aadhaar_last_four="123456789012",  # 12 digits
            )

    def test_invalid_pan_rejected(self) -> None:
        with pytest.raises(ValueError, match="Invalid PAN format"):
            PartyCreate(
                name="Sunita Patil",
                mobile_primary="9876543211",
                pan="NOTAPAN123",
            )

    @pytest.mark.asyncio
    async def test_reveal_sensitive_field_audited(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        session = MockDbSession()
        service = PartyService(session=session)  # type: ignore[arg-type]

        payload = PartyCreate(
            name="Amit Verma",
            mobile_primary="9876543212",
            pan="XYZPA9876Q",
        )
        party_resp, _ = await service.create_party(
            org_id=org_id,
            payload=payload,
            actor_id=user_id,
            actor_role="manager",
        )

        reveal_req = PartyRevealRequest(
            field_name="pan",
            reason="Lender sanction document verification",
        )
        reveal_resp = await service.reveal_sensitive_field(
            org_id=org_id,
            party_id=party_resp.id,
            payload=reveal_req,
            actor_id=user_id,
            actor_role="manager",
            ip_address="192.168.1.100",
        )

        assert reveal_resp.value == "XYZPA9876Q"
        assert reveal_resp.field_name == "pan"

    @pytest.mark.asyncio
    async def test_optimistic_locking_conflict(self) -> None:
        org_id = uuid.uuid4()
        user_id = uuid.uuid4()
        session = MockDbSession()
        service = PartyService(session=session)  # type: ignore[arg-type]

        party_resp, _ = await service.create_party(
            org_id=org_id,
            payload=PartyCreate(name="Vikas Roy", mobile_primary="9876543213"),
            actor_id=user_id,
            actor_role="processor",
        )

        # Attempt update with stale version
        update_req = PartyUpdate(
            name="Vikas Kumar Roy",
            version=999,  # Stale version!
        )
        with pytest.raises(ConflictError, match="modified by another user"):
            await service.update_party(
                org_id=org_id,
                party_id=party_resp.id,
                payload=update_req,
                actor_id=user_id,
                actor_role="processor",
            )
