"""
DSA OS — Application Configuration
Loaded from environment variables via pydantic-settings.
Never hardcode secrets here. All secrets come from .env.
"""

from functools import lru_cache
from typing import Any, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # -------------------------------------------------------------------------
    # Application
    # -------------------------------------------------------------------------
    app_env: Literal["development", "staging", "production"] = "development"
    app_debug: bool = False
    app_name: str = "DSA OS"
    app_version: str = "0.1.0"

    # -------------------------------------------------------------------------
    # Backend API
    # -------------------------------------------------------------------------
    backend_host: str = "0.0.0.0"  # noqa: S104
    backend_port: int = 8000

    # -------------------------------------------------------------------------
    # PostgreSQL
    # Application uses dsaos_app role (non-owner, RLS enforced)
    # Migrations use dsaos_migrator role (table owner)
    # -------------------------------------------------------------------------
    database_url: str = Field(
        default="postgresql+asyncpg://dsaos_app:dev_password@localhost:5432/dsaos",
        description="Application database URL using dsaos_app role",
    )
    database_migration_url: str = Field(
        default="postgresql+asyncpg://dsaos_migrator:dev_password@localhost:5432/dsaos",
        description="Migration database URL using dsaos_migrator role",
    )
    database_pool_size: int = 10
    database_max_overflow: int = 20
    database_pool_timeout: int = 30

    # -------------------------------------------------------------------------
    # Redis
    # -------------------------------------------------------------------------
    redis_url: str = Field(
        default="redis://localhost:6379/0",
        description="Redis URL for ARQ queue and auth_version cache",
    )
    redis_auth_version_ttl: int = 30  # seconds — auth_version cache TTL (ADR-005)

    # -------------------------------------------------------------------------
    # MinIO / Object Storage
    # -------------------------------------------------------------------------
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = Field(default="dev_access_key")
    minio_secret_key: str = Field(default="dev_secret_key")
    minio_secure: bool = False
    minio_quarantine_bucket: str = "dsaos-quarantine"
    minio_canonical_bucket: str = "dsaos-canonical"
    minio_region: str = "ap-south-1"

    # -------------------------------------------------------------------------
    # JWT / Authentication
    # Keys loaded from PEM files — never embed keys as strings in settings
    # -------------------------------------------------------------------------
    jwt_private_key_path: str = "./keys/jwt_private.pem"
    jwt_public_key_path: str = "./keys/jwt_public.pem"
    jwt_private_key: str | None = None
    jwt_public_key: str | None = None
    jwt_algorithm: str = "RS256"  # FIXED: RS256 only, no negotiation (ADR-005)
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 30

    # -------------------------------------------------------------------------
    # ClamAV
    # -------------------------------------------------------------------------
    clamav_host: str = "localhost"
    clamav_port: int = 3310

    # -------------------------------------------------------------------------
    # CORS
    # -------------------------------------------------------------------------
    cors_origins: list[str] | str = Field(
        default=["http://localhost:5173", "http://localhost:3000"],
        description="Allowed CORS origins",
    )

    # -------------------------------------------------------------------------
    # Auth Rate Limiting
    # -------------------------------------------------------------------------
    auth_max_failed_logins: int = 5
    auth_lockout_minutes: int = 15

    # -------------------------------------------------------------------------
    # Field-level Encryption (PAN at rest)
    # -------------------------------------------------------------------------
    field_encryption_key: str = Field(
        default="JuDfQvQ24nqlsEyMbjf08qqIWdNm9LgMUjF47rNHuwU=",
        description="Fernet 32-byte url-safe base64 key for encrypting sensitive fields at rest",
    )


    # -------------------------------------------------------------------------
    # Logging
    # -------------------------------------------------------------------------
    log_level: str = "INFO"

    # -------------------------------------------------------------------------
    # Validators
    # -------------------------------------------------------------------------
    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> Any:
        """Parse comma-separated strings or JSON arrays for CORS origins."""
        if isinstance(v, str):
            stripped = v.strip()
            if stripped.startswith("[") and stripped.endswith("]"):
                import json
                return json.loads(stripped)
            return [origin.strip() for origin in stripped.split(",") if origin.strip()]
        return v

    @field_validator("jwt_algorithm")
    @classmethod
    def validate_jwt_algorithm(cls, v: str) -> str:
        """Enforce RS256 only — no algorithm negotiation (ADR-005)."""
        if v != "RS256":
            msg = "JWT algorithm must be RS256. No other algorithms are permitted (ADR-005)."
            raise ValueError(msg)
        return v


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings. Call this everywhere via Depends."""
    return Settings()
