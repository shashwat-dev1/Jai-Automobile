"""
DSA OS — Data Import & Reversal Service

Implements FR-IMP-001..003:
- CSV dry-run validation report with row-level error breakdown
- Import execution with batch tracking
- 24-hour rollback reversal window
"""

import csv
import io
import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.import_export.models import DataImportBatch
from app.modules.import_export.schemas import ImportDryRunResponse, ImportRowError
from app.modules.lenders.models import Lender
from app.modules.parties.models import Party
from app.modules.sources.models import Source
from app.shared.exceptions import BusinessRuleViolationError, NotFoundError, ValidationError

logger = logging.getLogger(__name__)


class ImportExportService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    def dry_run_csv(
        self,
        entity_type: str,
        csv_content: str,
    ) -> ImportDryRunResponse:
        """Parse CSV and validate required fields, generating row-level error reports."""
        valid_entities = ("parties", "sources", "lenders")
        if entity_type not in valid_entities:
            raise ValidationError(f"Invalid entity_type '{entity_type}'. Must be one of: {valid_entities}")

        reader = csv.DictReader(io.StringIO(csv_content.strip()))
        total_rows = 0
        valid_records: list[dict[str, Any]] = []
        errors: list[ImportRowError] = []

        for row_idx, row in enumerate(reader, start=2):  # 1-indexed header is line 1
            total_rows += 1
            row_errors = []

            # Clean keys and values
            clean_row = {k.strip().lower(): (v.strip() if v else "") for k, v in row.items() if k}

            if entity_type == "parties":
                name = clean_row.get("name") or clean_row.get("full_name")
                mobile = clean_row.get("mobile") or clean_row.get("phone")
                if not name:
                    row_errors.append(ImportRowError(row=row_idx, field="name", message="Party name is required"))
                if not mobile or len("".join(filter(str.isdigit, mobile))) != 10:
                    row_errors.append(
                        ImportRowError(row=row_idx, field="mobile", message="10-digit mobile number required")
                    )

                if not row_errors:
                    valid_records.append(
                        {
                            "name": name,
                            "mobile": "".join(filter(str.isdigit, mobile or "")),
                            "employment_type": clean_row.get("employment_type", "salaried"),
                            "email": clean_row.get("email") or None,
                        }
                    )

            elif entity_type == "sources":
                name = clean_row.get("name") or clean_row.get("source_name")
                s_type = clean_row.get("source_type") or clean_row.get("type", "dealer")
                valid_types = ("dealer", "sub_dsa", "connector", "employee", "direct", "walk_in")
                if not name:
                    row_errors.append(ImportRowError(row=row_idx, field="name", message="Source name is required"))
                if s_type not in valid_types:
                    row_errors.append(
                        ImportRowError(
                            row=row_idx,
                            field="source_type",
                            message=f"Invalid source type. Allowed: {valid_types}",
                        )
                    )

                if not row_errors:
                    valid_records.append(
                        {
                            "name": name,
                            "source_type": s_type,
                            "contact_person": clean_row.get("contact_person") or None,
                            "phone": clean_row.get("phone") or clean_row.get("mobile") or None,
                        }
                    )

            elif entity_type == "lenders":
                name = clean_row.get("name") or clean_row.get("lender_name")
                if not name:
                    row_errors.append(ImportRowError(row=row_idx, field="name", message="Lender name is required"))

                if not row_errors:
                    valid_records.append(
                        {
                            "name": name,
                            "type": clean_row.get("type", "bank"),
                        }
                    )

            errors.extend(row_errors)

        return ImportDryRunResponse(
            total_rows=total_rows,
            valid_rows=len(valid_records),
            error_rows=total_rows - len(valid_records),
            errors=errors,
            valid_records=valid_records,
        )

    async def commit_import(
        self,
        org_id: uuid.UUID,
        user_id: uuid.UUID,
        entity_type: str,
        filename: str,
        records: list[dict[str, Any]],
    ) -> DataImportBatch:
        """Commit valid records and establish 24-hour reversal window (FR-IMP-003)."""
        if not records:
            raise ValidationError("No valid records to import")

        imported_ids: list[str] = []
        now = datetime.now(UTC)

        for rec in records:
            new_id = uuid.uuid4()
            imported_ids.append(str(new_id))

            if entity_type == "parties":
                party = Party(
                    id=new_id,
                    org_id=org_id,
                    name=rec["name"],
                    mobile_primary=rec["mobile"],
                    email=rec.get("email"),
                    employment_type=rec.get("employment_type", "salaried"),
                )
                self.db.add(party)

            elif entity_type == "sources":
                source = Source(
                    id=new_id,
                    org_id=org_id,
                    name=rec["name"],
                    type=rec.get("source_type", "dealer"),
                    contact_person=rec.get("contact_person"),
                    mobile=rec.get("phone"),
                )
                self.db.add(source)

            elif entity_type == "lenders":
                lender = Lender(
                    id=new_id,
                    org_id=org_id,
                    name=rec["name"],
                    type=rec.get("type", "bank"),
                )
                self.db.add(lender)

        batch = DataImportBatch(
            id=uuid.uuid4(),
            org_id=org_id,
            entity_type=entity_type,
            filename=filename,
            total_rows=len(records),
            valid_rows=len(records),
            error_rows=0,
            errors=[],
            status="committed",
            can_reverse_until=now + timedelta(hours=24),
            imported_ids=imported_ids,
            created_by=user_id,
        )
        self.db.add(batch)
        await self.db.flush()

        logger.info(
            "Import batch %s committed: %d %s imported for org %s",
            batch.id,
            len(records),
            entity_type,
            org_id,
        )
        return batch

    async def reverse_import(
        self,
        org_id: uuid.UUID,
        batch_id: uuid.UUID,
    ) -> DataImportBatch:
        """Roll back an import batch within the 24-hour reversal window (FR-IMP-003)."""
        stmt = select(DataImportBatch).where(
            DataImportBatch.id == batch_id,
            DataImportBatch.org_id == org_id,
        )
        res = await self.db.execute(stmt)
        batch = res.scalar_one_or_none()
        if not batch:
            raise NotFoundError("DataImportBatch", str(batch_id))

        if batch.status != "committed":
            raise BusinessRuleViolationError(f"Cannot reverse batch with status '{batch.status}'")

        now = datetime.now(UTC)
        if batch.can_reverse_until and now > batch.can_reverse_until:
            raise BusinessRuleViolationError("The 24-hour import reversal window has expired")

        # Delete created records
        id_uuids = [uuid.UUID(uid) for uid in batch.imported_ids]

        if batch.entity_type == "parties":
            await self.db.execute(delete(Party).where(Party.id.in_(id_uuids), Party.org_id == org_id))
        elif batch.entity_type == "sources":
            await self.db.execute(delete(Source).where(Source.id.in_(id_uuids), Source.org_id == org_id))
        elif batch.entity_type == "lenders":
            await self.db.execute(delete(Lender).where(Lender.id.in_(id_uuids), Lender.org_id == org_id))

        batch.status = "reversed"
        batch.reversed_at = now
        await self.db.flush()

        logger.info("Import batch %s reversed by user on org %s", batch.id, org_id)
        return batch

    async def list_batches(
        self,
        org_id: uuid.UUID,
        entity_type: str | None = None,
        limit: int = 50,
    ) -> list[DataImportBatch]:
        """List historical import batches."""
        filters = [DataImportBatch.org_id == org_id]
        if entity_type:
            filters.append(DataImportBatch.entity_type == entity_type)

        stmt = select(DataImportBatch).where(*filters).order_by(DataImportBatch.created_at.desc()).limit(limit)
        res = await self.db.execute(stmt)
        return list(res.scalars().all())
