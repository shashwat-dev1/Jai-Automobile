"""DSA OS — Document Checklist Engine

Evaluates case attributes, customer employment profile, vehicle condition, and hypothecation
status to dynamically determine required documents according to business rules (FR-DOC-001, FR-VEH-005).
"""

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.cases.models import Case, CaseParty, Vehicle
from app.modules.documents.models import Document, DocumentType
from app.modules.parties.models import Party


class ChecklistItemDTO:
    """Represents a required document item in the operational checklist."""

    def __init__(
        self,
        document_type_id: uuid.UUID,
        code: str,
        name: str,
        group_name: str,
        is_mandatory: bool,
        status: str = "requested",
        document_id: uuid.UUID | None = None,
        file_name: str | None = None,
        file_size: int | None = None,
        version: int | None = None,
        uploaded_at: str | None = None,
        reject_reason: str | None = None,
        can_download: bool = False,
        scan_result: dict[str, Any] | None = None,
    ):
        self.document_type_id = document_type_id
        self.code = code
        self.name = name
        self.group_name = group_name
        self.is_mandatory = is_mandatory
        self.status = status
        self.document_id = document_id
        self.file_name = file_name
        self.file_size = file_size
        self.version = version
        self.uploaded_at = uploaded_at
        self.reject_reason = reject_reason
        self.can_download = can_download
        self.scan_result = scan_result

    def to_dict(self) -> dict[str, Any]:
        return {
            "document_type_id": str(self.document_type_id),
            "code": self.code,
            "name": self.name,
            "group_name": self.group_name,
            "is_mandatory": self.is_mandatory,
            "status": self.status,
            "document_id": str(self.document_id) if self.document_id else None,
            "file_name": self.file_name,
            "file_size": self.file_size,
            "version": self.version,
            "uploaded_at": self.uploaded_at,
            "reject_reason": self.reject_reason,
            "can_download": self.can_download,
            "scan_result": self.scan_result,
        }


class ChecklistEngine:
    """Determines required documents for a case and correlates them with uploaded documents."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_case_checklist(
        self,
        org_id: uuid.UUID,
        case_id: uuid.UUID,
    ) -> tuple[list[ChecklistItemDTO], int]:
        """Compute the complete document checklist for a case.

        Returns (checklist_items, missing_mandatory_count).
        """
        # 1. Fetch case with party and vehicle
        stmt_case = select(Case).where(Case.id == case_id, Case.org_id == org_id)
        res_case = await self.session.execute(stmt_case)
        case = res_case.scalar_one_or_none()
        if not case:
            return [], 0

        # Fetch primary applicant party if present via CaseParty
        stmt_cp = select(CaseParty).where(
            CaseParty.case_id == case.id,
            CaseParty.role == "applicant",
            CaseParty.org_id == org_id,
        )
        res_cp = await self.session.execute(stmt_cp)
        case_party = res_cp.scalar_one_or_none()
        party_id = case_party.party_id if case_party else None

        if party_id:
            stmt_party = select(Party).where(Party.id == party_id, Party.org_id == org_id)
            res_party = await self.session.execute(stmt_party)
            party = res_party.scalar_one_or_none()
            employment_type = party.employment_type if party else "salaried"
        else:
            employment_type = "salaried"

        # Fetch vehicle if present
        stmt_veh = select(Vehicle).where(Vehicle.case_id == case.id, Vehicle.org_id == org_id)
        res_veh = await self.session.execute(stmt_veh)
        vehicle = res_veh.scalar_one_or_none()

        # 2. Fetch all active document types
        stmt_types = select(DocumentType).where(DocumentType.is_active.is_(True))
        res_types = await self.session.execute(stmt_types)
        doc_types = {dt.code: dt for dt in res_types.scalars().all()}

        # 3. Determine required codes based on business rules
        required_codes: dict[str, bool] = {}  # code -> is_mandatory

        # KYC: Mandatory for all applications
        required_codes["pan_card"] = True
        required_codes["aadhaar_card"] = True

        # Income: Based on employment type
        if employment_type == "salaried":
            required_codes["salary_slip"] = True
            required_codes["bank_statement"] = True
        else:
            required_codes["bank_statement"] = True
            required_codes["form_16_itr"] = True

        # Vehicle: Based on case product and vehicle condition
        if case.product_type == "used_car" or (vehicle and vehicle.condition == "used"):
            required_codes["rc_copy"] = True
            required_codes["insurance_policy"] = True
        else:
            required_codes["proforma_invoice"] = True

        # FR-VEH-005: Active hypothecation rule
        if vehicle and vehicle.existing_hypothecation:
            required_codes["bank_noc"] = True
            required_codes["form_35"] = True

        # 4. Fetch latest version of uploaded documents for this case
        stmt_docs = (
            select(Document)
            .where(
                Document.case_id == case.id,
                Document.org_id == org_id,
                Document.deleted_at.is_(None),
            )
            .order_by(Document.version.desc())
        )
        res_docs = await self.session.execute(stmt_docs)
        case_docs = res_docs.scalars().all()

        # Group by document_type_id (keep latest version)
        docs_by_type_id: dict[uuid.UUID, Document] = {}
        for d in case_docs:
            if d.document_type_id not in docs_by_type_id:
                docs_by_type_id[d.document_type_id] = d

        # 5. Build checklist items
        items: list[ChecklistItemDTO] = []
        missing_mandatory_count = 0

        for code, is_mandatory in required_codes.items():
            dt = doc_types.get(code)
            if not dt:
                continue

            existing_doc = docs_by_type_id.get(dt.id)
            if existing_doc:
                # Allowed download statuses per Data Dictionary Section 1.4:
                # NEVER allow download for quarantined, scanning, or scan_failed
                can_dl = existing_doc.status not in ("quarantined", "scanning", "scan_failed")
                status = existing_doc.status

                # If status is rejected or scan_failed, it counts as missing if mandatory
                if is_mandatory and status in ("scan_failed", "rejected"):
                    missing_mandatory_count += 1

                items.append(
                    ChecklistItemDTO(
                        document_type_id=dt.id,
                        code=dt.code,
                        name=dt.name,
                        group_name=dt.group_name,
                        is_mandatory=is_mandatory,
                        status=status,
                        document_id=existing_doc.id,
                        file_name=existing_doc.file_name,
                        file_size=existing_doc.file_size,
                        version=existing_doc.version,
                        uploaded_at=existing_doc.uploaded_at.isoformat()
                        if existing_doc.uploaded_at
                        else None,
                        reject_reason=existing_doc.reject_reason or existing_doc.scan_error,
                        can_download=can_dl,
                        scan_result=existing_doc.scan_result,
                    )
                )
            else:
                if is_mandatory:
                    missing_mandatory_count += 1
                items.append(
                    ChecklistItemDTO(
                        document_type_id=dt.id,
                        code=dt.code,
                        name=dt.name,
                        group_name=dt.group_name,
                        is_mandatory=is_mandatory,
                        status="requested",
                        can_download=False,
                    )
                )

        return items, missing_mandatory_count

    def generate_request_message(
        self,
        case_no: str,
        customer_name: str,
        checklist_items: list[ChecklistItemDTO],
    ) -> str:
        """Generate a structured, copyable text message detailing missing mandatory documents (FR-DOC-007)."""
        missing_docs = [
            item.name
            for item in checklist_items
            if item.is_mandatory and item.status in ("requested", "rejected", "scan_failed")
        ]

        if not missing_docs:
            return f"Dear {customer_name}, all mandatory documents for loan file {case_no} have been received. Thank you!"

        doc_lines = "\n".join(f"• {doc}" for doc in missing_docs)
        message = (
            f"Dear {customer_name},\n\n"
            f"Greetings from DSA Operations. For processing your vehicle loan application ({case_no}), "
            f"please share clear copies of the following pending documents at your earliest convenience:\n\n"
            f"{doc_lines}\n\n"
            f"You may submit these directly via WhatsApp or email. Thank you for your cooperation."
        )
        return message
