"""
DSA OS — Tenancy & White-Label Organization Schemas
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class TenantBranding(BaseModel):
    name: str = "Jai Automobiles"
    tagline: str = "Vehicle Finance Operations"
    logo_url: str = "/jai_auto_logo.jpg"
    theme_preset: str = "gold_emerald"
    primary_color: str = "#10b981"
    accent_color: str = "#fbbf24"


class TenantBrandingUpdateRequest(BaseModel):
    name: str | None = None
    tagline: str | None = None
    logo_url: str | None = None
    theme_preset: str | None = None
    primary_color: str | None = None
    accent_color: str | None = None


class OrganizationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str
    gstin: str | None = None
    pan: str | None = None
    plan: str
    region: str
    is_active: bool
    settings: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None


class OrganizationCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    slug: str = Field(..., min_length=2, max_length=100)
    gstin: str | None = Field(None, max_length=15)
    pan: str | None = Field(None, max_length=10)
    plan: str = "pilot"
    owner_name: str = Field(..., min_length=2)
    owner_email: EmailStr
    owner_mobile: str = Field(..., pattern=r"^[6-9]\d{9}$")
    owner_password: str = Field(..., min_length=8)
    settings: dict[str, Any] = Field(default_factory=dict)


class OrganizationUpdateRequest(BaseModel):
    name: str | None = None
    plan: str | None = None
    is_active: bool | None = None
    settings: dict[str, Any] | None = None
