"""
DSA OS — Authentication & User Schemas
"""

import re
from datetime import datetime
from uuid import UUID

from pydantic import AliasChoices, BaseModel, ConfigDict, EmailStr, Field, field_validator


class LoginRequest(BaseModel):
    """Credentials required to authenticate."""

    model_config = ConfigDict(populate_by_name=True)

    org_slug: str = Field(
        ...,
        validation_alias=AliasChoices("org_slug", "organization_slug"),
        min_length=2,
        max_length=100,
        description="Organization identifier slug",
    )
    identifier: str = Field(
        ..., min_length=3, max_length=255, description="User email or mobile number"
    )
    password: str = Field(..., min_length=8, max_length=128, description="User password")


class RefreshTokenRequest(BaseModel):
    """Refresh token presentation for session renewal."""

    refresh_token: str = Field(..., min_length=20, description="Opaque refresh token")


class UserResponse(BaseModel):
    """User profile representation."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    org_id: UUID
    name: str
    email: str | None
    mobile: str | None
    role: str
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None


class TokenResponse(BaseModel):
    """Tokens issued upon successful authentication or rotation."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 900  # 15 minutes
    user: UserResponse | None = None


class UserCreateRequest(BaseModel):
    """User creation payload (Owner only)."""

    name: str = Field(..., min_length=2, max_length=255)
    email: EmailStr | None = None
    mobile: str | None = Field(None, pattern=r"^[6-9]\d{9}$", description="Indian 10-digit mobile")
    role: str = Field(
        ..., description="Role: owner, manager, processor, field_executive, accountant, auditor"
    )
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """Enforce password complexity: 8+ chars, at least one uppercase, lowercase, digit."""
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        return v

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        valid_roles = {"owner", "manager", "processor", "field_executive", "accountant", "auditor"}
        if v not in valid_roles:
            raise ValueError(f"Invalid role '{v}'. Allowed roles: {', '.join(sorted(valid_roles))}")
        return v


class UserUpdateRequest(BaseModel):
    """User modification payload (Owner only)."""

    name: str | None = Field(None, min_length=2, max_length=255)
    role: str | None = None
    is_active: bool | None = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str | None) -> str | None:
        if v is None:
            return None
        valid_roles = {"owner", "manager", "processor", "field_executive", "accountant", "auditor"}
        if v not in valid_roles:
            raise ValueError(f"Invalid role '{v}'. Allowed roles: {', '.join(sorted(valid_roles))}")
        return v


class ChangePasswordRequest(BaseModel):
    """Self password change payload."""

    old_password: str = Field(..., min_length=8)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        return v
