"""
DSA OS — Document Gate Service
Enforces BR-03: Moving case to applied / logged_in requires mandatory documents.
Managers/Owners may override with a recorded reason.
"""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.service import AuditService
from app.modules.cases.models import Case
from app.modules.documents.checklist_engine import ChecklistEngine
from app.shared.exceptions import BusinessRuleViolationError, PermissionDeniedError


class DocumentGate:
    """Evaluates mandatory document compliance before case moves to lender submission."""

    @staticmethod
    async def evaluate_gate(
        db: AsyncSession,
        case: Case,
        user_role: str,
        user_id: uuid.UUID,
        override_reason: str | None = None,
    ) -> dict[str, Any]:
        """
        Evaluate if case satisfies mandatory document requirements.
        If mandatory items are missing:
          - If user is owner/manager and override_reason provided -> Pass with audit log
          - Else -> Raise BusinessRuleViolationError
        """
        engine = ChecklistEngine(session=db)
        items, missing_mandatory_count = await engine.get_case_checklist(
            org_id=case.org_id, case_id=case.id
        )
        missing_mandatory = [
            item for item in items if item.is_mandatory and item.status not in ("received", "verified")
        ]

        if not missing_mandatory:
            return {"passed": True, "overridden": False, "missing_count": 0}

        # Mandatory documents are missing. Check override permissions.
        if override_reason and override_reason.strip():
            if user_role not in ("owner", "manager"):
                raise PermissionDeniedError(
                    "Only Managers or Owners can override mandatory document gate."
                )

            # Record audit log for gate override
            audit = AuditService(session=db)
            await audit.log_event(
                org_id=case.org_id,
                action="case.document_gate_override",
                entity_type="case",
                actor_id=user_id,
                actor_role=user_role,
                entity_id=str(case.id),
                changes={
                    "status": "file_logged_in",
                    "override_reason": override_reason,
                    "missing_documents": [m.code for m in missing_mandatory],
                },
            )
            return {
                "passed": True,
                "overridden": True,
                "missing_count": len(missing_mandatory),
                "override_reason": override_reason,
            }

        missing_names = ", ".join(m.name for m in missing_mandatory)
        raise BusinessRuleViolationError(
            f"BR-03: Mandatory documents missing for case {case.case_no}: [{missing_names}]. "
            "A Manager or Owner override with reason is required to proceed.",
            code="DOCUMENT_GATE_BLOCKED",
            details={
                "case_id": str(case.id),
                "missing_documents": [
                    {"code": m.code, "name": m.name}
                    for m in missing_mandatory
                ],
            },
        )
