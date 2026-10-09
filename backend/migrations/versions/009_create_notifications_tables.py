"""Create notification tables with PostgreSQL RLS

Revision ID: 009
Revises: 008
Create Date: 2026-10-05

Implements Phase 09 database foundations:
1. notifications table (user-scoped notifications with status, urgency, deep links, payload)
2. notification_preferences table (user-specific channel and quiet hours preferences)
3. notification_delivery_logs table (FR-NTF-004 per-notification delivery audit log)
4. PostgreSQL RLS policies with FORCE ROW LEVEL SECURITY
5. Table grants to dsaos_app and dsaos_readonly
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "009"
down_revision: str | None = "008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -------------------------------------------------------------------------
    # 1. notifications table
    # -------------------------------------------------------------------------
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("urgency", sa.String(20), nullable=False, server_default="normal"),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("deep_link", sa.String(255), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_notifications_org_user",
        "notifications",
        ["org_id", "user_id", "is_read", "created_at"],
    )
    op.create_index(
        "ix_notifications_dedup",
        "notifications",
        ["org_id", "user_id", "event_type", "entity_id", "created_at"],
    )

    # -------------------------------------------------------------------------
    # 2. notification_preferences table
    # -------------------------------------------------------------------------
    op.create_table(
        "notification_preferences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("in_app_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("email_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("digest_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("quiet_hours_start", sa.String(5), nullable=True),
        sa.Column("quiet_hours_end", sa.String(5), nullable=True),
        sa.Column(
            "disabled_event_types",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("org_id", "user_id", name="uq_notif_pref_org_user"),
    )

    op.create_index("ix_notif_pref_user", "notification_preferences", ["org_id", "user_id"])

    # -------------------------------------------------------------------------
    # 3. notification_delivery_logs table
    # -------------------------------------------------------------------------
    op.create_table(
        "notification_delivery_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "notification_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("notifications.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("channel", sa.String(30), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),  # delivered, sent, failed, suppressed
        sa.Column("recipient", sa.String(255), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "attempted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_notif_log_org",
        "notification_delivery_logs",
        ["org_id", "notification_id"],
    )

    # -------------------------------------------------------------------------
    # 4. PostgreSQL RLS Policies
    # -------------------------------------------------------------------------
    for tbl in ("notifications", "notification_preferences", "notification_delivery_logs"):
        op.execute(f"ALTER TABLE {tbl} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"ALTER TABLE {tbl} FORCE ROW LEVEL SECURITY;")
        op.execute(
            f"""
            CREATE POLICY tenant_isolation_policy ON {tbl}
            FOR ALL
            USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
            """
        )

    # -------------------------------------------------------------------------
    # 5. Table Grants
    # -------------------------------------------------------------------------
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dsaos_app') THEN
                GRANT SELECT, INSERT, UPDATE, DELETE ON notifications, notification_preferences, notification_delivery_logs TO dsaos_app;
            END IF;
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dsaos_readonly') THEN
                GRANT SELECT ON notifications, notification_preferences, notification_delivery_logs TO dsaos_readonly;
            END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.drop_table("notification_delivery_logs")
    op.drop_table("notification_preferences")
    op.drop_table("notifications")
