"""
DSA OS — Payout Service Layer
Implements:
- Commission grid management with effective date ranges
- Automatic expectation generation upon loan disbursal
- FR-PAY-003: "No Rule is Not Zero" invariant with Attention List flagging
- BR-10: PDD-gated release when all PDD items are acknowledged by lender
- BR-13: Frozen rule terms snapshotting
- BR-09: Dealer / executive sub-DSA commission splits (<= 100%)
- FR-PAY-005: Optimistic locking and audit-logged manual overrides
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.audit.service import AuditService
from app.modules.cases.models import Case, CaseParty
from app.modules.lenders.models import Lender, LenderApplication
from app.modules.payout.engine import (
    calculate_gross,
    calculate_net,
    calculate_tds,
    validate_and_compute_splits,
)
from app.modules.payout.models import PayoutExpectation, PayoutRule, PayoutSplit
from app.modules.payout.schemas import (
    PayoutAttentionItem,
    PayoutExpectationOverrideRequest,
    PayoutExpectationResponse,
    PayoutRuleCreateRequest,
    PayoutRuleResponse,
    PayoutRuleUpdateRequest,
    PayoutSplitResponse,
    PayoutSplitsUpdateRequest,
)
from app.modules.pdd.models import PDDItem
from app.shared.exceptions import (
    BusinessRuleViolationError,
    ConflictError,
    NotFoundError,
)


class PayoutService:
    """Manages payout rules, expectations, splits, gating, and overrides."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit = AuditService(session=session)

    # -------------------------------------------------------------------------
    # 1. Payout Rules Management
    # -------------------------------------------------------------------------
    async def list_rules(
        self,
        org_id: uuid.UUID,
        lender_id: uuid.UUID | None = None,
        product: str | None = None,
        is_active: bool | None = None,
    ) -> list[PayoutRuleResponse]:
        stmt = (
            select(PayoutRule)
            .options(selectinload(PayoutRule.lender))
            .where(PayoutRule.org_id == org_id)
            .order_by(PayoutRule.product.asc(), PayoutRule.effective_from.desc())
        )
        if lender_id is not None:
            stmt = stmt.where(PayoutRule.lender_id == lender_id)
        if product is not None:
            stmt = stmt.where(PayoutRule.product == product)
        if is_active is not None:
            stmt = stmt.where(PayoutRule.is_active == is_active)

        res = await self.session.execute(stmt)
        rules = res.scalars().all()

        return [
            PayoutRuleResponse(
                id=r.id,
                org_id=r.org_id,
                lender_id=r.lender_id,
                lender_name=r.lender.name if r.lender else None,
                product=r.product,
                effective_from=r.effective_from,
                effective_to=r.effective_to,
                basis=r.basis,
                rate_percent=r.rate_percent,
                flat_amount=r.flat_amount,
                slabs=r.slabs,
                conditions=r.conditions,
                gating_type=r.gating_type,
                tds_rate_percent=r.tds_rate_percent,
                gst_mode=r.gst_mode,
                is_active=r.is_active,
                version=r.version,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in rules
        ]

    async def get_rule(self, org_id: uuid.UUID, rule_id: uuid.UUID) -> PayoutRule:
        stmt = (
            select(PayoutRule)
            .options(selectinload(PayoutRule.lender))
            .where(PayoutRule.id == rule_id, PayoutRule.org_id == org_id)
        )
        res = await self.session.execute(stmt)
        rule = res.scalar_one_or_none()
        if not rule:
            raise NotFoundError(f"Payout rule '{rule_id}' not found.")
        return rule

    async def create_rule(
        self,
        org_id: uuid.UUID,
        payload: PayoutRuleCreateRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> PayoutRuleResponse:
        if payload.effective_to and payload.effective_to < payload.effective_from:
            raise BusinessRuleViolationError(
                "effective_to date cannot be earlier than effective_from date.",
                code="INVALID_DATE_RANGE",
            )

        # Check lender exists
        lender_stmt = select(Lender).where(Lender.id == payload.lender_id, Lender.org_id == org_id)
        lender = (await self.session.execute(lender_stmt)).scalar_one_or_none()
        if not lender:
            raise NotFoundError(f"Lender '{payload.lender_id}' not found.")

        rule = PayoutRule(
            id=uuid.uuid4(),
            org_id=org_id,
            lender_id=payload.lender_id,
            product=payload.product,
            effective_from=payload.effective_from,
            effective_to=payload.effective_to,
            basis=payload.basis,
            rate_percent=payload.rate_percent,
            flat_amount=payload.flat_amount,
            slabs=payload.slabs,
            conditions=payload.conditions,
            gating_type=payload.gating_type,
            tds_rate_percent=payload.tds_rate_percent,
            gst_mode=payload.gst_mode,
            is_active=payload.is_active,
            version=1,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        self.session.add(rule)
        await self.session.commit()
        await self.session.refresh(rule)

        await self.audit.log_event(
            org_id=org_id,
            action="payout_rule.created",
            entity_type="payout_rule",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(rule.id),
            changes={
                "lender_id": str(rule.lender_id),
                "product": rule.product,
                "basis": rule.basis,
                "effective_from": rule.effective_from.isoformat(),
            },
        )

        return PayoutRuleResponse(
            id=rule.id,
            org_id=rule.org_id,
            lender_id=rule.lender_id,
            lender_name=lender.name,
            product=rule.product,
            effective_from=rule.effective_from,
            effective_to=rule.effective_to,
            basis=rule.basis,
            rate_percent=rule.rate_percent,
            flat_amount=rule.flat_amount,
            slabs=rule.slabs,
            conditions=rule.conditions,
            gating_type=rule.gating_type,
            tds_rate_percent=rule.tds_rate_percent,
            gst_mode=rule.gst_mode,
            is_active=rule.is_active,
            version=rule.version,
            created_at=rule.created_at,
            updated_at=rule.updated_at,
        )

    async def update_rule(
        self,
        org_id: uuid.UUID,
        rule_id: uuid.UUID,
        payload: PayoutRuleUpdateRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> PayoutRuleResponse:
        rule = await self.get_rule(org_id, rule_id)
        before_state = {
            "basis": rule.basis,
            "rate_percent": str(rule.rate_percent) if rule.rate_percent else None,
            "is_active": rule.is_active,
        }

        if payload.product is not None:
            rule.product = payload.product
        if payload.effective_from is not None:
            rule.effective_from = payload.effective_from
        if payload.effective_to is not None:
            rule.effective_to = payload.effective_to
        if payload.basis is not None:
            rule.basis = payload.basis
        if payload.rate_percent is not None:
            rule.rate_percent = payload.rate_percent
        if payload.flat_amount is not None:
            rule.flat_amount = payload.flat_amount
        if payload.slabs is not None:
            rule.slabs = payload.slabs
        if payload.conditions is not None:
            rule.conditions = payload.conditions
        if payload.gating_type is not None:
            rule.gating_type = payload.gating_type
        if payload.tds_rate_percent is not None:
            rule.tds_rate_percent = payload.tds_rate_percent
        if payload.gst_mode is not None:
            rule.gst_mode = payload.gst_mode
        if payload.is_active is not None:
            rule.is_active = payload.is_active

        rule.version += 1
        rule.updated_at = datetime.now(UTC)

        await self.session.commit()
        await self.session.refresh(rule)

        await self.audit.log_event(
            org_id=org_id,
            action="payout_rule.updated",
            entity_type="payout_rule",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(rule.id),
            changes={"before": before_state, "after": {"version": rule.version}},
        )

        return PayoutRuleResponse(
            id=rule.id,
            org_id=rule.org_id,
            lender_id=rule.lender_id,
            lender_name=rule.lender.name if rule.lender else None,
            product=rule.product,
            effective_from=rule.effective_from,
            effective_to=rule.effective_to,
            basis=rule.basis,
            rate_percent=rule.rate_percent,
            flat_amount=rule.flat_amount,
            slabs=rule.slabs,
            conditions=rule.conditions,
            gating_type=rule.gating_type,
            tds_rate_percent=rule.tds_rate_percent,
            gst_mode=rule.gst_mode,
            is_active=rule.is_active,
            version=rule.version,
            created_at=rule.created_at,
            updated_at=rule.updated_at,
        )

    # -------------------------------------------------------------------------
    # 2. Expectation Generation on Disbursal
    # -------------------------------------------------------------------------
    async def calculate_expectation_on_disbursal(
        self,
        org_id: uuid.UUID,
        case_id: uuid.UUID,
        application_id: uuid.UUID,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> PayoutExpectationResponse | None:
        """
        Calculates expected receivable payout when an application is marked as disbursed.
        Idempotent: if an expectation already exists for this application, returns it.
        """
        # Check existing expectation
        existing_stmt = (
            select(PayoutExpectation)
            .options(
                selectinload(PayoutExpectation.case),
                selectinload(PayoutExpectation.lender_application).selectinload(LenderApplication.lender),
                selectinload(PayoutExpectation.splits),
            )
            .where(
                PayoutExpectation.org_id == org_id,
                PayoutExpectation.lender_application_id == application_id,
            )
        )
        existing = (await self.session.execute(existing_stmt)).scalar_one_or_none()
        if existing:
            return self._to_expectation_response(existing)

        # Retrieve application and case
        app_stmt = (
            select(LenderApplication)
            .options(selectinload(LenderApplication.lender))
            .where(
                LenderApplication.id == application_id,
                LenderApplication.case_id == case_id,
                LenderApplication.org_id == org_id,
            )
        )
        app = (await self.session.execute(app_stmt)).scalar_one_or_none()
        if not app or not app.disbursal_amount:
            return None

        case_stmt = select(Case).where(Case.id == case_id, Case.org_id == org_id)
        case = (await self.session.execute(case_stmt)).scalar_one_or_none()
        if not case:
            return None

        disbursal_date = app.disbursal_date or datetime.now(UTC).date()

        # Match active rule by (org_id, lender_id, product, effective_dates)
        rule_stmt = (
            select(PayoutRule)
            .where(
                PayoutRule.org_id == org_id,
                PayoutRule.lender_id == app.lender_id,
                PayoutRule.product == app.product,
                PayoutRule.is_active == True,  # noqa: E712
                PayoutRule.effective_from <= disbursal_date,
                or_(
                    PayoutRule.effective_to.is_(None),
                    PayoutRule.effective_to >= disbursal_date,
                ),
            )
            .order_by(PayoutRule.effective_from.desc(), PayoutRule.created_at.desc())
        )
        matched_rule = (await self.session.execute(rule_stmt)).scalars().first()

        now = datetime.now(UTC)

        if not matched_rule:
            # FR-PAY-003: "No Rule is Not Zero" invariant
            # Payout expectation is created with status = 'no_rule' so ops must configure rule or manually override.
            expectation = PayoutExpectation(
                id=uuid.uuid4(),
                org_id=org_id,
                case_id=case_id,
                lender_application_id=application_id,
                rule_id=None,
                rule_snapshot=None,
                disbursal_amount=app.disbursal_amount,
                gross_amount=Decimal("0.00"),
                tds_rate_percent=Decimal("5.00"),
                tds_amount=Decimal("0.00"),
                net_amount=Decimal("0.00"),
                status="no_rule",
                gating_status="pending",
                is_override=False,
                override_reason=None,
                original_gross_amount=None,
                version=1,
                created_at=now,
                updated_at=now,
            )
            self.session.add(expectation)
            await self.session.commit()
            await self.session.refresh(expectation)

            await self.audit.log_event(
                org_id=org_id,
                action="payout_expectation.flagged_no_rule",
                entity_type="payout_expectation",
                actor_id=actor_id,
                actor_role=actor_role,
                entity_id=str(expectation.id),
                changes={
                    "case_id": str(case_id),
                    "application_id": str(application_id),
                    "disbursal_amount": str(app.disbursal_amount),
                    "status": "no_rule",
                },
            )
            return self._to_expectation_response(expectation, case=case, app=app)

        # Matched rule calculation
        gross = calculate_gross(
            disbursal_amount=app.disbursal_amount,
            basis=matched_rule.basis,
            rate_percent=matched_rule.rate_percent,
            flat_amount=matched_rule.flat_amount,
            slabs=matched_rule.slabs,
        )
        tds = calculate_tds(gross, matched_rule.tds_rate_percent)
        net = calculate_net(gross, tds)

        # Gating check
        if matched_rule.gating_type == "pdd_complete":
            # Check if all PDD items are acknowledged
            pdd_stmt = select(func.count(PDDItem.id)).where(
                PDDItem.org_id == org_id,
                PDDItem.lender_application_id == application_id,
                PDDItem.status != "acknowledged_by_lender",
            )
            unack_count = (await self.session.execute(pdd_stmt)).scalar() or 0
            if unack_count == 0:
                status = "due"
                gating_status = "satisfied"
            else:
                status = "held"
                gating_status = "pending"
        else:
            status = "due"
            gating_status = "satisfied"

        # BR-13: Frozen snapshot of rule terms
        rule_snapshot: dict[str, Any] = {
            "rule_id": str(matched_rule.id),
            "lender_id": str(matched_rule.lender_id),
            "product": matched_rule.product,
            "basis": matched_rule.basis,
            "rate_percent": str(matched_rule.rate_percent) if matched_rule.rate_percent is not None else None,
            "flat_amount": str(matched_rule.flat_amount) if matched_rule.flat_amount is not None else None,
            "slabs": matched_rule.slabs,
            "conditions": matched_rule.conditions,
            "gating_type": matched_rule.gating_type,
            "tds_rate_percent": str(matched_rule.tds_rate_percent),
            "gst_mode": matched_rule.gst_mode,
            "version": matched_rule.version,
            "captured_at": now.isoformat(),
        }

        expectation = PayoutExpectation(
            id=uuid.uuid4(),
            org_id=org_id,
            case_id=case_id,
            lender_application_id=application_id,
            rule_id=matched_rule.id,
            rule_snapshot=rule_snapshot,
            disbursal_amount=app.disbursal_amount,
            gross_amount=gross,
            tds_rate_percent=matched_rule.tds_rate_percent,
            tds_amount=tds,
            net_amount=net,
            status=status,
            gating_status=gating_status,
            is_override=False,
            override_reason=None,
            original_gross_amount=None,
            version=1,
            created_at=now,
            updated_at=now,
        )
        self.session.add(expectation)
        await self.session.commit()
        await self.session.refresh(expectation)

        await self.audit.log_event(
            org_id=org_id,
            action="payout_expectation.created",
            entity_type="payout_expectation",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(expectation.id),
            changes={
                "case_id": str(case_id),
                "application_id": str(application_id),
                "rule_id": str(matched_rule.id),
                "gross_amount": str(gross),
                "net_amount": str(net),
                "status": status,
            },
        )

        return self._to_expectation_response(expectation, case=case, app=app)

    # -------------------------------------------------------------------------
    # 3. PDD Gating Release
    # -------------------------------------------------------------------------
    async def check_and_release_pdd_gate(
        self,
        org_id: uuid.UUID,
        application_id: uuid.UUID,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> None:
        """
        Checks if all PDD items for an application are acknowledged by the lender.
        If yes, releases any 'held' payout expectation to 'due'.
        """
        # Find expectation
        exp_stmt = select(PayoutExpectation).where(
            PayoutExpectation.org_id == org_id,
            PayoutExpectation.lender_application_id == application_id,
            PayoutExpectation.status == "held",
            PayoutExpectation.gating_status == "pending",
        )
        exp = (await self.session.execute(exp_stmt)).scalar_one_or_none()
        if not exp:
            return

        # Check all PDD items
        pdd_count_stmt = select(func.count(PDDItem.id)).where(
            PDDItem.org_id == org_id,
            PDDItem.lender_application_id == application_id,
        )
        total_pdd = (await self.session.execute(pdd_count_stmt)).scalar() or 0
        if total_pdd == 0:
            return

        unack_stmt = select(func.count(PDDItem.id)).where(
            PDDItem.org_id == org_id,
            PDDItem.lender_application_id == application_id,
            PDDItem.status != "acknowledged_by_lender",
        )
        unack_count = (await self.session.execute(unack_stmt)).scalar() or 0

        if unack_count == 0:
            # All PDD items are acknowledged by bank! Release gate:
            exp.status = "due"
            exp.gating_status = "satisfied"
            exp.updated_at = datetime.now(UTC)
            exp.version += 1

            await self.session.commit()

            await self.audit.log_event(
                org_id=org_id,
                action="payout_expectation.gate_released",
                entity_type="payout_expectation",
                actor_id=actor_id,
                actor_role=actor_role,
                entity_id=str(exp.id),
                changes={
                    "application_id": str(application_id),
                    "old_status": "held",
                    "new_status": "due",
                    "gating_status": "satisfied",
                },
            )

    # -------------------------------------------------------------------------
    # 4. Manual Overrides (FR-PAY-005)
    # -------------------------------------------------------------------------
    async def override_expectation(
        self,
        org_id: uuid.UUID,
        expectation_id: uuid.UUID,
        payload: PayoutExpectationOverrideRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> PayoutExpectationResponse:
        """
        Managers/Owners can manually adjust expected payout with mandatory justification.
        Recomputes TDS and net payout; preserves original amount; increments version.
        """
        exp_stmt = (
            select(PayoutExpectation)
            .options(
                selectinload(PayoutExpectation.case),
                selectinload(PayoutExpectation.lender_application).selectinload(LenderApplication.lender),
                selectinload(PayoutExpectation.splits),
            )
            .where(PayoutExpectation.id == expectation_id, PayoutExpectation.org_id == org_id)
        )
        exp = (await self.session.execute(exp_stmt)).scalar_one_or_none()
        if not exp:
            raise NotFoundError(f"Payout expectation '{expectation_id}' not found.")

        # Optimistic locking
        if exp.version != payload.version:
            raise ConflictError(
                f"Payout expectation version conflict: current={exp.version}, provided={payload.version}. Please refresh."
            )

        before_state = {
            "gross_amount": str(exp.gross_amount),
            "net_amount": str(exp.net_amount),
            "status": exp.status,
            "is_override": exp.is_override,
        }

        if exp.original_gross_amount is None:
            exp.original_gross_amount = exp.gross_amount

        exp.gross_amount = payload.gross_amount
        exp.tds_amount = calculate_tds(payload.gross_amount, exp.tds_rate_percent)
        exp.net_amount = calculate_net(payload.gross_amount, exp.tds_amount)
        exp.is_override = True
        exp.override_reason = payload.override_reason.strip()

        # If it was in 'no_rule' status, move to 'due' or 'held' depending on PDD
        if exp.status == "no_rule":
            # Check PDD gating
            pdd_stmt = select(func.count(PDDItem.id)).where(
                PDDItem.org_id == org_id,
                PDDItem.lender_application_id == exp.lender_application_id,
                PDDItem.status != "acknowledged_by_lender",
            )
            unack_count = (await self.session.execute(pdd_stmt)).scalar() or 0
            if unack_count == 0:
                exp.status = "due"
                exp.gating_status = "satisfied"
            else:
                exp.status = "held"
                exp.gating_status = "pending"

        exp.version += 1
        exp.updated_at = datetime.now(UTC)

        # Recalculate any existing percentage splits against new gross amount
        if exp.splits:
            for s in exp.splits:
                if s.share_type == "percent":
                    s.split_amount = (exp.gross_amount * s.share_value / Decimal("100")).quantize(
                        Decimal("0.01")
                    )

        await self.session.commit()
        await self.session.refresh(exp)

        await self.audit.log_event(
            org_id=org_id,
            action="payout_expectation.overridden",
            entity_type="payout_expectation",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(exp.id),
            changes={
                "before": before_state,
                "after": {
                    "gross_amount": str(exp.gross_amount),
                    "net_amount": str(exp.net_amount),
                    "override_reason": exp.override_reason,
                    "version": exp.version,
                },
            },
        )

        return self._to_expectation_response(exp)

    # -------------------------------------------------------------------------
    # 5. Splits Management (BR-09)
    # -------------------------------------------------------------------------
    async def update_splits(
        self,
        org_id: uuid.UUID,
        expectation_id: uuid.UUID,
        payload: PayoutSplitsUpdateRequest,
        actor_id: uuid.UUID,
        actor_role: str,
    ) -> list[PayoutSplitResponse]:
        exp_stmt = select(PayoutExpectation).where(
            PayoutExpectation.id == expectation_id, PayoutExpectation.org_id == org_id
        )
        exp = (await self.session.execute(exp_stmt)).scalar_one_or_none()
        if not exp:
            raise NotFoundError(f"Payout expectation '{expectation_id}' not found.")

        # Compute & validate BR-09
        computed_splits = validate_and_compute_splits(
            gross_amount=exp.gross_amount, splits=payload.splits
        )

        # Delete old splits
        await self.session.execute(
            delete(PayoutSplit).where(
                PayoutSplit.expectation_id == expectation_id,
                PayoutSplit.org_id == org_id,
            )
        )

        # Insert new splits
        new_splits: list[PayoutSplit] = []
        now = datetime.now(UTC)
        for item, amt in computed_splits:
            split_obj = PayoutSplit(
                id=uuid.uuid4(),
                org_id=org_id,
                expectation_id=expectation_id,
                beneficiary_type=item.beneficiary_type,
                source_id=item.source_id,
                user_id=item.user_id,
                share_type=item.share_type,
                share_value=item.share_value,
                split_amount=amt,
                created_at=now,
                updated_at=now,
            )
            self.session.add(split_obj)
            new_splits.append(split_obj)

        await self.session.commit()

        await self.audit.log_event(
            org_id=org_id,
            action="payout_splits.updated",
            entity_type="payout_expectation",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(expectation_id),
            changes={"split_count": len(new_splits)},
        )

        # Fetch with relationships for response
        res_stmt = (
            select(PayoutSplit)
            .options(selectinload(PayoutSplit.source), selectinload(PayoutSplit.user))
            .where(PayoutSplit.expectation_id == expectation_id, PayoutSplit.org_id == org_id)
        )
        loaded = (await self.session.execute(res_stmt)).scalars().all()

        return [
            PayoutSplitResponse(
                id=s.id,
                org_id=s.org_id,
                expectation_id=s.expectation_id,
                beneficiary_type=s.beneficiary_type,
                source_id=s.source_id,
                source_name=s.source.name if s.source else None,
                user_id=s.user_id,
                user_name=s.user.name if s.user else None,
                share_type=s.share_type,
                share_value=s.share_value,
                split_amount=s.split_amount,
                created_at=s.created_at,
                updated_at=s.updated_at,
            )
            for s in loaded
        ]

    # -------------------------------------------------------------------------
    # 6. Listing & Attention List
    # -------------------------------------------------------------------------
    async def list_expectations(
        self,
        org_id: uuid.UUID,
        status: str | None = None,
        case_id: uuid.UUID | None = None,
    ) -> list[PayoutExpectationResponse]:
        stmt = (
            select(PayoutExpectation)
            .options(
                selectinload(PayoutExpectation.case)
                .selectinload(Case.case_parties)
                .selectinload(CaseParty.party),
                selectinload(PayoutExpectation.lender_application).selectinload(LenderApplication.lender),
                selectinload(PayoutExpectation.splits).selectinload(PayoutSplit.source),
                selectinload(PayoutExpectation.splits).selectinload(PayoutSplit.user),
            )
            .where(PayoutExpectation.org_id == org_id)
            .order_by(PayoutExpectation.created_at.desc())
        )
        if status is not None:
            stmt = stmt.where(PayoutExpectation.status == status)
        if case_id is not None:
            stmt = stmt.where(PayoutExpectation.case_id == case_id)

        res = await self.session.execute(stmt)
        items = res.scalars().all()
        return [self._to_expectation_response(item) for item in items]

    async def get_expectation(
        self, org_id: uuid.UUID, expectation_id: uuid.UUID
    ) -> PayoutExpectationResponse:
        stmt = (
            select(PayoutExpectation)
            .options(
                selectinload(PayoutExpectation.case)
                .selectinload(Case.case_parties)
                .selectinload(CaseParty.party),
                selectinload(PayoutExpectation.lender_application).selectinload(LenderApplication.lender),
                selectinload(PayoutExpectation.splits).selectinload(PayoutSplit.source),
                selectinload(PayoutExpectation.splits).selectinload(PayoutSplit.user),
            )
            .where(PayoutExpectation.id == expectation_id, PayoutExpectation.org_id == org_id)
        )
        res = await self.session.execute(stmt)
        item = res.scalar_one_or_none()
        if not item:
            raise NotFoundError(f"Payout expectation '{expectation_id}' not found.")
        return self._to_expectation_response(item)

    async def get_attention_list(self, org_id: uuid.UUID) -> list[PayoutAttentionItem]:
        """
        Returns all disbursed expectations requiring human/manager intervention:
        1. 'no_rule': Disbursed loans with no configured commission rate
        2. 'held': PDD documentation incomplete, delaying payout release
        """
        stmt = (
            select(PayoutExpectation)
            .options(
                selectinload(PayoutExpectation.case)
                .selectinload(Case.case_parties)
                .selectinload(CaseParty.party),
                selectinload(PayoutExpectation.lender_application).selectinload(LenderApplication.lender),
            )
            .where(
                PayoutExpectation.org_id == org_id,
                PayoutExpectation.status.in_(["no_rule", "held"]),
            )
            .order_by(PayoutExpectation.created_at.asc())
        )
        res = await self.session.execute(stmt)
        expectations = res.scalars().all()

        results: list[PayoutAttentionItem] = []
        for exp in expectations:
            if exp.status == "no_rule":
                reason = "no_rule"
                desc = "No commission grid configured for lender and product at disbursal date."
            else:
                reason = "pdd_pending"
                desc = "Payout held pending lender acknowledgment of post-disbursal documents."

            applicant_name = None
            if exp.case and "case_parties" in exp.case.__dict__ and exp.case.case_parties:
                for cp in exp.case.case_parties:
                    if getattr(cp, "party_type", None) == "applicant" and "party" in cp.__dict__ and cp.party:
                        applicant_name = cp.party.name
                        break
            if not applicant_name and exp.case:
                applicant_name = getattr(exp.case, "customer_name", None)

            results.append(
                PayoutAttentionItem(
                    id=exp.id,
                    case_id=exp.case_id,
                    case_no=exp.case.case_no if exp.case else None,
                    applicant_name=applicant_name,
                    lender_application_id=exp.lender_application_id,
                    lender_name=exp.lender_application.lender.name if exp.lender_application and exp.lender_application.lender else None,
                    product=exp.lender_application.product if exp.lender_application else None,
                    disbursal_amount=exp.disbursal_amount,
                    status=exp.status,
                    gating_status=exp.gating_status,
                    reason=reason,
                    reason_description=desc,
                    created_at=exp.created_at,
                )
            )

        return results

    # -------------------------------------------------------------------------
    # Helper Serialization
    # -------------------------------------------------------------------------
    def _to_expectation_response(
        self,
        exp: PayoutExpectation,
        case: Case | None = None,
        app: LenderApplication | None = None,
    ) -> PayoutExpectationResponse:
        case_obj = case or exp.case
        app_obj = app or exp.lender_application

        splits_res: list[PayoutSplitResponse] = []
        if "splits" in exp.__dict__ and exp.splits:
            for s in exp.splits:
                splits_res.append(
                    PayoutSplitResponse(
                        id=s.id,
                        org_id=s.org_id,
                        expectation_id=s.expectation_id,
                        beneficiary_type=s.beneficiary_type,
                        source_id=s.source_id,
                        source_name=s.source.name if "source" in s.__dict__ and s.source else None,
                        user_id=s.user_id,
                        user_name=s.user.name if "user" in s.__dict__ and s.user else None,
                        share_type=s.share_type,
                        share_value=s.share_value,
                        split_amount=s.split_amount,
                        created_at=s.created_at,
                        updated_at=s.updated_at,
                    )
                )

        applicant_name = None
        if case_obj and "case_parties" in case_obj.__dict__ and case_obj.case_parties:
            for cp in case_obj.case_parties:
                if getattr(cp, "party_type", None) == "applicant" and "party" in cp.__dict__ and cp.party:
                    applicant_name = cp.party.name
                    break
        if not applicant_name and case_obj:
            applicant_name = getattr(case_obj, "customer_name", None)

        now = datetime.now(UTC)

        return PayoutExpectationResponse(
            id=exp.id,
            org_id=exp.org_id,
            case_id=exp.case_id,
            case_no=case_obj.case_no if case_obj else None,
            applicant_name=applicant_name,
            lender_application_id=exp.lender_application_id,
            lender_name=app_obj.lender.name if app_obj and "lender" in app_obj.__dict__ and app_obj.lender else None,
            product=app_obj.product if app_obj else None,
            rule_id=exp.rule_id,
            rule_snapshot=exp.rule_snapshot,
            disbursal_amount=exp.disbursal_amount,
            gross_amount=exp.gross_amount,
            tds_rate_percent=exp.tds_rate_percent,
            tds_amount=exp.tds_amount,
            net_amount=exp.net_amount,
            status=exp.status,
            gating_status=exp.gating_status,
            is_override=exp.is_override,
            override_reason=exp.override_reason,
            original_gross_amount=exp.original_gross_amount,
            version=exp.version,
            splits=splits_res,
            created_at=exp.created_at or now,
            updated_at=exp.updated_at or now,
        )
