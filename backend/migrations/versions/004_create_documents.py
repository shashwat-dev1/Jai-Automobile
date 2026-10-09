"""Create documents, document_types, and checklist_rules tables with PostgreSQL RLS

Revision ID: 004
Revises: 003
Create Date: 2026-10-05

Implements Phase 03 database foundations:
1. document_types table (configuration catalog of accepted documents)
2. checklist_rules table (matrix mapping case attributes to required document types)
3. documents table (versioned file references, quarantine metadata, scan results, lifecycle statuses)
4. PostgreSQL RLS policies with FORCE ROW LEVEL SECURITY
5. Table grants to dsaos_app and dsaos_readonly
6. Seed standard document types and default checklist rules
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # 1. document_types table
    # -------------------------------------------------------------------------
    op.create_table(
        "document_types",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("group_name", sa.String(100), nullable=False),
        sa.Column("validity_days", sa.Integer(), nullable=True),
        sa.Column("is_sensitive", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_document_types_code", "document_types", ["code"], unique=True)
    op.create_index("ix_document_types_group", "document_types", ["group_name"])

    # -------------------------------------------------------------------------
    # 2. checklist_rules table
    # -------------------------------------------------------------------------
    op.create_table(
        "checklist_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("product", sa.String(50), nullable=True),
        sa.Column("employment_type", sa.String(50), nullable=True),
        sa.Column("vehicle_condition", sa.String(20), nullable=True),
        sa.Column("lender_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "document_type_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("document_types.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("is_mandatory", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("required_by_stage", sa.String(50), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_checklist_rules_query",
        "checklist_rules",
        ["org_id", "product", "employment_type", "vehicle_condition"],
    )

    # -------------------------------------------------------------------------
    # 3. documents table
    # -------------------------------------------------------------------------
    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "case_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cases.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "party_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("parties.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "vehicle_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("vehicles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "document_type_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("document_types.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("file_key", sa.String(500), nullable=True),
        sa.Column("quarantine_key", sa.String(500), nullable=True),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "parent_document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.String(50),
            nullable=False,
            server_default="quarantined",
        ),
        sa.Column("scan_result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("scan_error", sa.Text(), nullable=True),
        sa.Column("reject_reason", sa.Text(), nullable=True),
        sa.Column(
            "uploaded_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "verified_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_documents_org_case", "documents", ["org_id", "case_id"])
    op.create_index("ix_documents_org_status", "documents", ["org_id", "status"])
    op.create_index("ix_documents_type", "documents", ["document_type_id"])

    # -------------------------------------------------------------------------
    # 4. PostgreSQL RLS Policies
    # -------------------------------------------------------------------------
    # Documents table RLS
    op.execute("ALTER TABLE documents ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE documents FORCE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY tenant_isolation_policy ON documents
        FOR ALL
        USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
        WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
        """
    )

    # Checklist rules table RLS (allows org_id IS NULL for system defaults)
    op.execute("ALTER TABLE checklist_rules ENABLE ROW LEVEL SECURITY;")
    op.execute("ALTER TABLE checklist_rules FORCE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY tenant_isolation_policy ON checklist_rules
        FOR ALL
        USING (org_id IS NULL OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
        WITH CHECK (org_id IS NULL OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
        """
    )

    # -------------------------------------------------------------------------
    # 5. Database Role Grants (idempotent / graceful if roles don't exist)
    # -------------------------------------------------------------------------
    for role_stmt in [
        "DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'dsaos_app') THEN "
        "GRANT ALL ON document_types, checklist_rules, documents TO dsaos_app; END IF; END $$;",
        "DO $$ BEGIN IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'dsaos_readonly') THEN "
        "GRANT SELECT ON document_types, checklist_rules, documents TO dsaos_readonly; END IF; END $$;",
    ]:
        op.execute(role_stmt)

    # -------------------------------------------------------------------------
    # 6. Seed Standard Document Types
    # -------------------------------------------------------------------------
    doc_type_table = sa.table(
        "document_types",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("group_name", sa.String),
        sa.column("validity_days", sa.Integer),
        sa.column("is_sensitive", sa.Boolean),
        sa.column("is_active", sa.Boolean),
    )

    doc_types = [
        {
            "id": uuid.uuid4(),
            "code": "pan_card",
            "name": "PAN Card",
            "group_name": "KYC",
            "validity_days": None,
            "is_sensitive": True,
            "is_active": True,
        },
        {
            "id": uuid.uuid4(),
            "code": "aadhaar_card",
            "name": "Aadhaar Card (Last 4 Display)",
            "group_name": "KYC",
            "validity_days": None,
            "is_sensitive": True,
            "is_active": True,
        },
        {
            "id": uuid.uuid4(),
            "code": "salary_slip",
            "name": "Salary Slips (Latest 3 Months)",
            "group_name": "Income",
            "validity_days": 90,
            "is_sensitive": False,
            "is_active": True,
        },
        {
            "id": uuid.uuid4(),
            "code": "bank_statement",
            "name": "Bank Statement (Latest 6 Months)",
            "group_name": "Income",
            "validity_days": 90,
            "is_sensitive": False,
            "is_active": True,
        },
        {
            "id": uuid.uuid4(),
            "code": "form_16_itr",
            "name": "Form 16 / ITR Returns",
            "group_name": "Income",
            "validity_days": 365,
            "is_sensitive": False,
            "is_active": True,
        },
        {
            "id": uuid.uuid4(),
            "code": "rc_copy",
            "name": "Vehicle Registration Certificate (RC)",
            "group_name": "Vehicle",
            "validity_days": None,
            "is_sensitive": False,
            "is_active": True,
        },
        {
            "id": uuid.uuid4(),
            "code": "insurance_policy",
            "name": "Comprehensive Motor Insurance",
            "group_name": "Vehicle",
            "validity_days": 365,
            "is_sensitive": False,
            "is_active": True,
        },
        {
            "id": uuid.uuid4(),
            "code": "bank_noc",
            "name": "Lender NOC / Foreclosure Statement",
            "group_name": "Legal",
            "validity_days": 90,
            "is_sensitive": False,
            "is_active": True,
        },
        {
            "id": uuid.uuid4(),
            "code": "form_35",
            "name": "Form 35 (Hypothecation Termination)",
            "group_name": "Legal",
            "validity_days": 180,
            "is_sensitive": False,
            "is_active": True,
        },
        {
            "id": uuid.uuid4(),
            "code": "proforma_invoice",
            "name": "Dealer Proforma / Quotation",
            "group_name": "Vehicle",
            "validity_days": 60,
            "is_sensitive": False,
            "is_active": True,
        },
    ]
    op.bulk_insert(doc_type_table, doc_types)


def downgrade() -> None:
    op.drop_table("documents")
    op.drop_table("checklist_rules")
    op.drop_table("document_types")
