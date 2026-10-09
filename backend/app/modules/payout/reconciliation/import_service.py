"""
DSA OS — Payout Reconciliation Import Service
Statement ingestion (CSV), column mapping persistence, dry-run previews,
batch commit with auto-matching, and 24-hour batch reversal window (FR-PAY-008).
Fully async with AsyncSession and PostgreSQL RLS support.
"""

import csv
import io
import re
import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.audit.service import AuditService
from app.modules.cases.models import Case, CaseParty
from app.modules.lenders.models import Lender, LenderApplication
from app.modules.payout.models import PayoutExpectation
from app.modules.payout.reconciliation.matching_engine import (
    DEFAULT_TOLERANCE,
    VALID_RECEIPT_CASE_STATUSES,
    calculate_name_similarity,
    calculate_variance,
    normalize_identifier,
)
from app.modules.payout.reconciliation.models import (
    ImportBatch,
    PayoutReceipt,
    Reconciliation,
    StatementColumnMapping,
)
from app.modules.payout.reconciliation.schemas import (
    DryRunReportResponse,
    DryRunRowResult,
    StatementColumnMappingCreate,
)
from app.shared.exceptions import (
    BusinessRuleViolationError,
    NotFoundError,
)


def _utcnow() -> datetime:
    return datetime.now(UTC)


def parse_decimal_safe(val: Any) -> Decimal:
    """Safely convert strings with currency symbols or commas to Decimal."""
    if val is None or val == "":
        return Decimal("0.00")
    if isinstance(val, int | float | Decimal):
        return Decimal(str(val)).quantize(Decimal("0.01"))

    val_str = str(val).strip()
    val_str = re.sub(r"[A-Za-z₹$€£,]", "", val_str).strip()
    if val_str.count(".") > 1:
        parts = val_str.split(".")
        val_str = "".join(parts[:-1]) + "." + parts[-1]

    cleaned = re.sub(r"[^\d.-]", "", val_str)
    if not cleaned or cleaned in ("-", "."):
        return Decimal("0.00")
    try:
        return Decimal(cleaned).quantize(Decimal("0.01"))
    except InvalidOperation:
        return Decimal("0.00")


def parse_date_safe(val: Any) -> date | None:
    """Attempt parsing multiple common Indian and ISO date formats."""
    if not val:
        return None
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        return val.date()

    val_str = str(val).strip()
    formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%d-%b-%Y",
        "%d-%B-%Y",
        "%m/%d/%Y",
        "%Y/%m/%d",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(val_str, fmt).date()
        except ValueError:
            continue
    return None


class ReconciliationImportService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit = AuditService(session=session)

    async def save_column_mapping(
        self,
        org_id: uuid.UUID,
        payload: StatementColumnMappingCreate,
    ) -> StatementColumnMapping:
        """Create or update saved statement column mapping for a lender."""
        stmt_lender = select(Lender).where(
            Lender.org_id == org_id,
            Lender.id == payload.lender_id,
            Lender.is_active.is_(True),
        )
        lender = (await self.session.execute(stmt_lender)).scalar_one_or_none()
        if not lender:
            raise NotFoundError(f"Lender {payload.lender_id} not found.")

        # Check existing mapping with same name
        stmt_existing = select(StatementColumnMapping).where(
            StatementColumnMapping.org_id == org_id,
            StatementColumnMapping.lender_id == payload.lender_id,
            StatementColumnMapping.mapping_name == payload.mapping_name,
        )
        existing = (await self.session.execute(stmt_existing)).scalar_one_or_none()
        if existing:
            existing.mappings = payload.mappings
            existing.is_default = payload.is_default
            await self.session.flush()
            return existing

        mapping = StatementColumnMapping(
            org_id=org_id,
            lender_id=payload.lender_id,
            mapping_name=payload.mapping_name,
            mappings=payload.mappings,
            is_default=payload.is_default,
        )
        self.session.add(mapping)
        await self.session.flush()
        return mapping

    async def get_column_mappings(
        self,
        org_id: uuid.UUID,
        lender_id: uuid.UUID,
    ) -> list[StatementColumnMapping]:
        """Fetch all saved column mappings for a lender."""
        stmt = select(StatementColumnMapping).where(
            StatementColumnMapping.org_id == org_id,
            StatementColumnMapping.lender_id == lender_id,
        )
        return list((await self.session.execute(stmt)).scalars().all())

    def parse_csv_rows(
        self,
        csv_content: str,
        column_mapping: dict[str, str],
    ) -> list[dict[str, Any]]:
        """
        Parse CSV content using mapping keys:
        loan_account_no, customer_name, received_amount, tds_amount, net_amount, payment_date, utr_reference
        """
        reverse_map: dict[str, str] = {}
        for std_field, header in column_mapping.items():
            reverse_map[header.strip().lower()] = std_field

        reader = csv.DictReader(io.StringIO(csv_content.strip()))
        if not reader.fieldnames:
            return []

        header_to_std: dict[str, str] = {}
        for h in reader.fieldnames:
            norm_h = h.strip().lower()
            if norm_h in reverse_map:
                header_to_std[h] = reverse_map[norm_h]
            else:
                for std_k in [
                    "loan_account_no",
                    "customer_name",
                    "received_amount",
                    "tds_amount",
                    "net_amount",
                    "payment_date",
                    "utr_reference",
                ]:
                    if std_k in norm_h or norm_h in std_k:
                        header_to_std[h] = std_k
                        break

        rows: list[dict[str, Any]] = []
        for idx, row in enumerate(reader, start=1):
            parsed_row: dict[str, Any] = {
                "row_index": idx,
                "loan_account_no": None,
                "customer_name": None,
                "received_amount": Decimal("0.00"),
                "tds_amount": Decimal("0.00"),
                "net_amount": Decimal("0.00"),
                "payment_date": None,
                "utr_reference": None,
            }
            for col, val in row.items():
                if not col:
                    continue
                std_key = header_to_std.get(col)
                if not std_key:
                    continue

                if std_key in ["received_amount", "tds_amount", "net_amount"]:
                    parsed_row[std_key] = parse_decimal_safe(val)
                elif std_key == "payment_date":
                    parsed_row[std_key] = parse_date_safe(val)
                else:
                    parsed_row[std_key] = str(val).strip() if val else None

            if parsed_row["net_amount"] == Decimal("0.00") and parsed_row["received_amount"] > Decimal("0.00"):
                parsed_row["net_amount"] = parsed_row["received_amount"] - parsed_row["tds_amount"]

            rows.append(parsed_row)
        return rows

    async def find_candidate_expectation(
        self,
        org_id: uuid.UUID,
        lender_id: uuid.UUID,
        loan_account_no: str | None,
        customer_name: str | None,
    ) -> tuple[PayoutExpectation | None, str | None]:
        """
        Locate candidate PayoutExpectation for given lender:
        1. Exact match by LAN (disbursal_ref, login_ref, or case_no).
        2. Fallback fuzzy match by customer name (>85% similarity).
        Returns (expectation, match_method).
        """
        norm_lan = normalize_identifier(loan_account_no)

        stmt = (
            select(PayoutExpectation)
            .join(LenderApplication, PayoutExpectation.lender_application_id == LenderApplication.id)
            .join(Case, PayoutExpectation.case_id == Case.id)
            .options(
                selectinload(PayoutExpectation.case).selectinload(Case.case_parties).selectinload(CaseParty.party),
                selectinload(PayoutExpectation.lender_application),
            )
            .where(
                PayoutExpectation.org_id == org_id,
                LenderApplication.lender_id == lender_id,
                PayoutExpectation.status.in_(["held", "due", "no_rule"]),
            )
        )
        expectations = list((await self.session.execute(stmt)).scalars().all())

        # 1. Exact match by LAN
        if norm_lan:
            for exp in expectations:
                app = exp.lender_application
                case = exp.case
                if (
                    normalize_identifier(app.disbursal_ref) == norm_lan
                    or normalize_identifier(app.login_ref) == norm_lan
                    or normalize_identifier(case.case_no) == norm_lan
                ):
                    return exp, "exact_lan"

        # 2. Fallback fuzzy name match
        if customer_name:
            best_exp = None
            best_score = 0.0

            for exp in expectations:
                for cp in exp.case.case_parties:
                    party_name = cp.party.name
                    score = calculate_name_similarity(customer_name, party_name)
                    if score > best_score and score >= 0.85:
                        best_score = score
                        best_exp = exp

            if best_exp:
                return best_exp, f"fuzzy_name_{int(best_score * 100)}pct"

        return None, None

    async def dry_run_import(
        self,
        org_id: uuid.UUID,
        lender_id: uuid.UUID,
        filename: str,
        csv_content: str,
        column_mapping: dict[str, str],
        tolerance: Decimal = DEFAULT_TOLERANCE,
    ) -> DryRunReportResponse:
        """Parse CSV and simulate matching against expectations without writing to DB."""
        parsed_rows = self.parse_csv_rows(csv_content, column_mapping)

        results: list[DryRunRowResult] = []
        valid_rows = 0
        error_rows = 0
        potential_matched = 0
        potential_unmatched = 0
        total_amount = Decimal("0.00")

        for row in parsed_rows:
            errors: list[str] = []
            if row["received_amount"] <= Decimal("0.00"):
                errors.append("Invalid or missing received amount.")

            if not row["payment_date"]:
                errors.append("Invalid or missing payment date.")

            if errors:
                error_rows += 1
                results.append(
                    DryRunRowResult(
                        row_index=row["row_index"],
                        loan_account_no=row["loan_account_no"],
                        customer_name=row["customer_name"],
                        received_amount=row["received_amount"],
                        tds_amount=row["tds_amount"],
                        net_amount=row["net_amount"],
                        payment_date=row["payment_date"],
                        match_status="error",
                        errors=errors,
                    )
                )
                continue

            valid_rows += 1
            total_amount += row["received_amount"]

            # Match candidate
            exp, _ = await self.find_candidate_expectation(
                org_id,
                lender_id,
                row["loan_account_no"],
                row["customer_name"],
            )

            if exp:
                # Check BR-07
                if exp.case.status not in VALID_RECEIPT_CASE_STATUSES:
                    results.append(
                        DryRunRowResult(
                            row_index=row["row_index"],
                            loan_account_no=row["loan_account_no"],
                            customer_name=row["customer_name"],
                            received_amount=row["received_amount"],
                            tds_amount=row["tds_amount"],
                            net_amount=row["net_amount"],
                            payment_date=row["payment_date"],
                            match_status="discrepancy",
                            matched_expectation_id=exp.id,
                            matched_case_no=exp.case.case_no,
                            expected_amount=exp.gross_amount,
                            errors=[
                                f"BR-07: Candidate case {exp.case.case_no} is in non-disbursed status '{exp.case.status}'."
                            ],
                        )
                    )
                    potential_unmatched += 1
                    continue

                variance, status = calculate_variance(
                    row["received_amount"], exp.gross_amount, tolerance
                )
                potential_matched += 1
                results.append(
                    DryRunRowResult(
                        row_index=row["row_index"],
                        loan_account_no=row["loan_account_no"],
                        customer_name=row["customer_name"],
                        received_amount=row["received_amount"],
                        tds_amount=row["tds_amount"],
                        net_amount=row["net_amount"],
                        payment_date=row["payment_date"],
                        match_status=status,
                        matched_expectation_id=exp.id,
                        matched_case_no=exp.case.case_no,
                        expected_amount=exp.gross_amount,
                        variance=variance,
                        errors=[],
                    )
                )
            else:
                potential_unmatched += 1
                results.append(
                    DryRunRowResult(
                        row_index=row["row_index"],
                        loan_account_no=row["loan_account_no"],
                        customer_name=row["customer_name"],
                        received_amount=row["received_amount"],
                        tds_amount=row["tds_amount"],
                        net_amount=row["net_amount"],
                        payment_date=row["payment_date"],
                        match_status="unmatched",
                        errors=[],
                    )
                )

        return DryRunReportResponse(
            filename=filename,
            total_rows=len(parsed_rows),
            valid_rows=valid_rows,
            error_rows=error_rows,
            potential_matched=potential_matched,
            potential_unmatched=potential_unmatched,
            total_amount=total_amount,
            rows=results,
        )

    async def commit_import(
        self,
        org_id: uuid.UUID,
        lender_id: uuid.UUID,
        filename: str,
        csv_content: str,
        column_mapping: dict[str, str],
        actor_id: uuid.UUID | None = None,
        actor_role: str | None = None,
        tolerance: Decimal = DEFAULT_TOLERANCE,
    ) -> ImportBatch:
        """
        Commit statement import batch:
        - Creates ImportBatch
        - Inserts PayoutReceipt records
        - Auto-matches to expectations and creates Reconciliation links
        - Transitions expectation status to 'paid'
        """
        parsed_rows = self.parse_csv_rows(csv_content, column_mapping)
        if not parsed_rows:
            raise BusinessRuleViolationError("No valid rows parsed from statement CSV.")

        batch = ImportBatch(
            org_id=org_id,
            lender_id=lender_id,
            filename=filename,
            total_rows=len(parsed_rows),
            status="committed",
            created_by=actor_id,
        )
        self.session.add(batch)
        await self.session.flush()

        matched_count = 0
        unmatched_count = 0
        error_count = 0
        total_received = Decimal("0.00")

        now = _utcnow()

        for row in parsed_rows:
            if row["received_amount"] <= Decimal("0.00") or not row["payment_date"]:
                error_count += 1
                continue

            total_received += row["received_amount"]

            exp, _ = await self.find_candidate_expectation(
                org_id,
                lender_id,
                row["loan_account_no"],
                row["customer_name"],
            )

            is_valid_disbursed = exp and exp.case.status in VALID_RECEIPT_CASE_STATUSES

            receipt = PayoutReceipt(
                org_id=org_id,
                lender_id=lender_id,
                import_batch_id=batch.id,
                loan_account_no=row["loan_account_no"],
                customer_name=row["customer_name"],
                received_amount=row["received_amount"],
                tds_amount=row["tds_amount"],
                net_amount=row["net_amount"],
                payment_date=row["payment_date"],
                utr_reference=row["utr_reference"],
                match_status="unmatched",
                case_id=exp.case_id if (is_valid_disbursed and exp is not None) else None,
                lender_application_id=exp.lender_application_id if (is_valid_disbursed and exp is not None) else None,
            )
            self.session.add(receipt)
            await self.session.flush()

            if is_valid_disbursed and exp:
                variance, status = calculate_variance(
                    row["received_amount"], exp.gross_amount, tolerance
                )
                recon = Reconciliation(
                    org_id=org_id,
                    expectation_id=exp.id,
                    receipt_id=receipt.id,
                    expected_amount=exp.gross_amount,
                    received_amount=row["received_amount"],
                    variance_amount=variance,
                    status=status,
                    tolerance_used=tolerance,
                    is_manual=False,
                    reconciled_by=actor_id,
                    reconciled_at=now,
                )
                self.session.add(recon)

                receipt.match_status = "matched"
                exp.status = "paid"
                matched_count += 1
            else:
                unmatched_count += 1

        batch.matched_rows = matched_count
        batch.unmatched_rows = unmatched_count
        batch.error_rows = error_count
        batch.total_received_amount = total_received

        await self.audit.log_event(
            org_id=org_id,
            action="import_batch:committed",
            entity_type="import_batches",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(batch.id),
            changes={
                "filename": filename,
                "total_rows": batch.total_rows,
                "matched_rows": matched_count,
                "unmatched_rows": unmatched_count,
                "total_received": str(total_received),
            },
        )
        await self.session.flush()
        return batch

    async def reverse_import_batch(
        self,
        org_id: uuid.UUID,
        batch_id: uuid.UUID,
        reversal_reason: str,
        actor_id: uuid.UUID | None = None,
        actor_role: str | None = None,
    ) -> ImportBatch:
        """
        Reverse committed import batch within 24 hours (FR-PAY-008).
        Restores expectation statuses, removes reconciliation match records,
        and deletes receipts.
        """
        stmt = select(ImportBatch).where(
            ImportBatch.org_id == org_id,
            ImportBatch.id == batch_id,
        )
        batch = (await self.session.execute(stmt)).scalar_one_or_none()
        if not batch:
            raise NotFoundError(f"Import batch {batch_id} not found.")

        if batch.status == "reversed":
            raise BusinessRuleViolationError("Import batch has already been reversed.")

        # Enforce 24-hour reversal window
        now = _utcnow()
        time_elapsed = now - batch.created_at
        if time_elapsed > timedelta(hours=24):
            raise BusinessRuleViolationError(
                f"Import batch reversal window (24 hours) has expired. "
                f"Elapsed: {int(time_elapsed.total_seconds() // 3600)}h {int((time_elapsed.total_seconds() % 3600) // 60)}m."
            )

        # Fetch all receipts for this batch with reconciliation
        stmt_receipts = (
            select(PayoutReceipt)
            .options(selectinload(PayoutReceipt.reconciliation))
            .where(
                PayoutReceipt.org_id == org_id,
                PayoutReceipt.import_batch_id == batch.id,
            )
        )
        receipts = list((await self.session.execute(stmt_receipts)).scalars().all())

        for receipt in receipts:
            if receipt.reconciliation:
                recon = receipt.reconciliation
                stmt_exp = select(PayoutExpectation).where(
                    PayoutExpectation.org_id == org_id,
                    PayoutExpectation.id == recon.expectation_id,
                )
                exp = (await self.session.execute(stmt_exp)).scalar_one_or_none()
                if exp and exp.status == "paid":
                    exp.status = "due"

                await self.session.delete(recon)

            await self.session.delete(receipt)

        batch.status = "reversed"
        batch.reversed_at = now
        batch.reversal_reason = reversal_reason

        await self.audit.log_event(
            org_id=org_id,
            action="import_batch:reversed",
            entity_type="import_batches",
            actor_id=actor_id,
            actor_role=actor_role,
            entity_id=str(batch.id),
            changes={
                "batch_id": str(batch.id),
                "reversal_reason": reversal_reason,
                "reversed_at": now.isoformat(),
            },
        )
        await self.session.flush()
        return batch

    async def list_batches(
        self,
        org_id: uuid.UUID,
        lender_id: uuid.UUID | None = None,
        status: str | None = None,
    ) -> list[ImportBatch]:
        """Query import batches with optional filtering."""
        stmt = (
            select(ImportBatch)
            .options(selectinload(ImportBatch.lender))
            .where(ImportBatch.org_id == org_id)
        )
        if lender_id:
            stmt = stmt.where(ImportBatch.lender_id == lender_id)
        if status:
            stmt = stmt.where(ImportBatch.status == status)

        stmt = stmt.order_by(ImportBatch.created_at.desc())
        return list((await self.session.execute(stmt)).scalars().all())
