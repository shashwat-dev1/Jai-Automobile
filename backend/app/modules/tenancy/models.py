"""
DSA OS — Organization SQLAlchemy Model

Platform-level table. NOT tenant-scoped (no RLS).
Organizations are the top-level multi-tenant entity.
One organization = one DSA firm.
"""

from typing import Any

from sqlalchemy import Boolean, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.shared.models import PlatformModel


class Organization(PlatformModel):
    """
    Represents one DSA firm (tenant).

    This is a platform-level table — no RLS applied here.
    It is queried by the application during auth to determine which org
    a user belongs to.
    """

    __tablename__ = "organizations"

    # --- Identity ---
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)

    # --- Business Identifiers (optional at signup) ---
    gstin: Mapped[str | None] = mapped_column(String(15), nullable=True)
    pan: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # --- Plan / Billing ---
    plan: Mapped[str] = mapped_column(String(50), nullable=False, server_default="pilot")

    # --- Configuration ---
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default="{}")
    region: Mapped[str] = mapped_column(String(50), nullable=False, server_default="in-west-1")

    # --- Status ---
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    def __repr__(self) -> str:
        return f"<Organization id={self.id} slug={self.slug!r} name={self.name!r}>"
