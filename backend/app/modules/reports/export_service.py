"""
DSA OS — Data Export Service

Implements FR-RPT-005:
- Generates standard CSV data for cases, payouts, sources, or audit events.
- Permission-gated via PERM_DATA_EXPORT.
- Automatically records immutable audit event `report_exported`.
- Strictly masks any sensitive customer identity attributes in compliance with PRD/SRS rules.
"""

import csv
import io
import uuid
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.audit.models import AuditLog
from app.modules.audit.service import AuditService
from app.modules.cases.models import Case
from app.modules.lenders.models import LenderApplication
from app.modules.payout.models import PayoutExpectation
from app.modules.reports.schemas import ReportType
from app.modules.reports.source_report_service import SourceReportService


class ExportService:
    """Service generating CSV exports with strict audit logging."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit_service = AuditService(session)

    async def export_csv(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        user_role: str,
        report_type: ReportType,
        date_from: date | None = None,
        date_to: date | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> str:
        """
        Generate CSV content, record audit entry, and return raw CSV string.
        """
        output = io.StringIO()
        writer = csv.writer(output)

        if report_type == "cases":
            await self._export_cases(writer, date_from, date_to)
        elif report_type == "payouts":
            await self._export_payouts(writer, date_from, date_to)
        elif report_type == "sources":
            await self._export_sources(writer, date_from, date_to)
        elif report_type == "audit":
            await self._export_audit(writer, date_from, date_to)
        else:
            raise ValueError(f"Unsupported report type: {report_type}")

        csv_content = output.getvalue()

        # Record immutable audit trail (FR-RPT-005, PRD 9.2)
        await self.audit_service.log_event(
            org_id=org_id,
            action="report_exported",
            entity_type="report",
            actor_id=user_id,
            actor_role=user_role,
            entity_id=str(report_type),
            changes={
                "report_type": report_type,
                "date_from": str(date_from) if date_from else None,
                "date_to": str(date_to) if date_to else None,
                "bytes_generated": len(csv_content),
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )

        return csv_content

    async def _export_cases(
        self,
        writer: Any,
        date_from: date | None,
        date_to: date | None,
    ) -> None:
        writer.writerow(
            [
                "Case Number",
                "Product Type",
                "Status",
                "Requested Amount (INR)",
                "Sanctioned Amount (INR)",
                "Disbursed Amount (INR)",
                "Source Name",
                "Created At",
            ]
        )

        query = select(Case).options(selectinload(Case.source)).order_by(Case.created_at.desc())
        if date_from:
            query = query.where(Case.created_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=UTC))
        if date_to:
            query = query.where(Case.created_at <= datetime.combine(date_to, datetime.max.time(), tzinfo=UTC))

        result = await self.session.execute(query)
        for c in result.scalars().all():
            writer.writerow(
                [
                    c.case_no,
                    c.product_type,
                    c.status,
                    str(c.loan_amount_requested),
                    str(c.loan_amount_sanctioned) if c.loan_amount_sanctioned else "",
                    str(c.loan_amount_disbursed) if c.loan_amount_disbursed else "",
                    c.source.name if c.source else "",
                    c.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                ]
            )

    async def _export_payouts(
        self,
        writer: Any,
        date_from: date | None,
        date_to: date | None,
    ) -> None:
        writer.writerow(
            [
                "Expectation ID",
                "Case Number",
                "Lender Name",
                "Disbursal Amount (INR)",
                "Gross Payout (INR)",
                "TDS Rate (%)",
                "Net Payout (INR)",
                "Status",
                "Created At",
            ]
        )

        query = (
            select(PayoutExpectation)
            .options(
                selectinload(PayoutExpectation.case),
                selectinload(PayoutExpectation.lender_application).selectinload(LenderApplication.lender),
            )
            .order_by(PayoutExpectation.created_at.desc())
        )
        if date_from:
            query = query.where(PayoutExpectation.created_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=UTC))
        if date_to:
            query = query.where(PayoutExpectation.created_at <= datetime.combine(date_to, datetime.max.time(), tzinfo=UTC))

        result = await self.session.execute(query)
        for e in result.scalars().all():
            l_name = ""
            if e.lender_application and e.lender_application.lender:
                l_name = e.lender_application.lender.name

            writer.writerow(
                [
                    str(e.id),
                    e.case.case_no if e.case else "",
                    l_name,
                    str(e.disbursal_amount),
                    str(e.gross_amount),
                    str(e.tds_rate_percent),
                    str(e.net_amount),
                    e.status,
                    e.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                ]
            )

    async def _export_sources(
        self,
        writer: Any,
        date_from: date | None,
        date_to: date | None,
    ) -> None:
        writer.writerow(
            [
                "Source Name",
                "Type",
                "Contact Person",
                "Phone",
                "Total Cases",
                "Disbursed Cases",
                "Conversion Rate (%)",
                "Disbursed Volume (INR)",
                "Payout Expected (INR)",
                "Payout Received (INR)",
                "Quality Score",
            ]
        )

        src_service = SourceReportService(self.session)
        report = await src_service.get_source_report(date_from=date_from, date_to=date_to)
        for s in report.sources:
            writer.writerow(
                [
                    s.source_name,
                    s.source_type,
                    s.contact_person or "",
                    s.phone or "",
                    s.total_cases,
                    s.disbursed_cases,
                    str(s.conversion_rate_pct),
                    str(s.disbursed_volume),
                    str(s.payout_expected),
                    str(s.payout_received),
                    str(s.quality_score),
                ]
            )

    async def _export_audit(
        self,
        writer: Any,
        date_from: date | None,
        date_to: date | None,
    ) -> None:
        writer.writerow(
            [
                "Timestamp",
                "Actor ID",
                "Actor Role",
                "Action",
                "Entity Type",
                "Entity ID",
                "IP Address",
            ]
        )

        query = select(AuditLog).order_by(AuditLog.occurred_at.desc())
        if date_from:
            query = query.where(AuditLog.occurred_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=UTC))
        if date_to:
            query = query.where(AuditLog.occurred_at <= datetime.combine(date_to, datetime.max.time(), tzinfo=UTC))

        result = await self.session.execute(query)
        for a in result.scalars().all():
            writer.writerow(
                [
                    a.occurred_at.strftime("%Y-%m-%d %H:%M:%S"),
                    str(a.actor_id) if a.actor_id else "",
                    a.actor_role or "",
                    a.action,
                    a.entity_type,
                    a.entity_id or "",
                    a.ip_address or "",
                ]
            )
