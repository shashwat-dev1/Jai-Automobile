"""
DSA OS — Authentication Security Utilities

- Argon2id password hashing and verification
- RS256 JWT access token creation and decoding via PyJWT
- Opaque cryptographically secure refresh token generation and SHA-256 hashing
"""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.config import get_settings
from app.shared.exceptions import AuthenticationError

_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)


# -----------------------------------------------------------------------------
# Password Hashing (Argon2id)
# -----------------------------------------------------------------------------


def hash_password(password: str) -> str:
    """Hash password using Argon2id."""
    return _hasher.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against Argon2id hash. Returns True on match, False otherwise."""
    try:
        return _hasher.verify(hashed_password, plain_password)
    except (VerifyMismatchError, Exception):
        return False


# -----------------------------------------------------------------------------
# Key Loading
# -----------------------------------------------------------------------------

_private_key_cache: str | None = None
_public_key_cache: str | None = None


def get_jwt_private_key() -> str:
    """Load RSA private key PEM for signing RS256 JWTs."""
    global _private_key_cache
    if _private_key_cache is not None:
        return _private_key_cache

    settings = get_settings()
    if settings.jwt_private_key:
        _private_key_cache = settings.jwt_private_key.replace("\\n", "\n")
        return _private_key_cache

    candidates = [
        Path(settings.jwt_private_key_path),
        Path.cwd() / settings.jwt_private_key_path,
        Path.cwd() / "backend" / settings.jwt_private_key_path,
        Path(__file__).resolve().parents[2] / settings.jwt_private_key_path,
        Path(__file__).resolve().parents[3] / settings.jwt_private_key_path,
        Path.cwd().parent / settings.jwt_private_key_path,
    ]
    resolved_path = next((p for p in candidates if p.exists() and p.is_file()), None)
    if not resolved_path:
        raise RuntimeError(f"JWT private key not found at {settings.jwt_private_key_path}")

    _private_key_cache = resolved_path.read_text(encoding="utf-8")
    return _private_key_cache


def get_jwt_public_key() -> str:
    """Load RSA public key PEM for verifying RS256 JWTs."""
    global _public_key_cache
    if _public_key_cache is not None:
        return _public_key_cache

    settings = get_settings()
    if settings.jwt_public_key:
        _public_key_cache = settings.jwt_public_key.replace("\\n", "\n")
        return _public_key_cache

    candidates = [
        Path(settings.jwt_public_key_path),
        Path.cwd() / settings.jwt_public_key_path,
        Path.cwd() / "backend" / settings.jwt_public_key_path,
        Path(__file__).resolve().parents[2] / settings.jwt_public_key_path,
        Path(__file__).resolve().parents[3] / settings.jwt_public_key_path,
        Path.cwd().parent / settings.jwt_public_key_path,
    ]
    resolved_path = next((p for p in candidates if p.exists() and p.is_file()), None)
    if not resolved_path:
        raise RuntimeError(f"JWT public key not found at {settings.jwt_public_key_path}")

    _public_key_cache = resolved_path.read_text(encoding="utf-8")
    return _public_key_cache


# -----------------------------------------------------------------------------
# JWT Access Token Management (RS256)
# -----------------------------------------------------------------------------


def create_access_token(
    user_id: str,
    org_id: str,
    role: str,
    auth_version: int,
    expires_delta: timedelta | None = None,
) -> str:
    """
    Issue an RS256 signed access token.
    Claims: sub (user_id), org_id, role, auth_version, iat, exp.
    """
    settings = get_settings()
    now = datetime.now(UTC)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.jwt_access_token_expire_minutes)

    payload: dict[str, Any] = {
        "sub": user_id,
        "org_id": org_id,
        "role": role,
        "auth_version": auth_version,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }

    private_key = get_jwt_private_key()
    return jwt.encode(payload, private_key, algorithm="RS256")


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decode and verify an RS256 JWT access token.
    Enforces RS256 algorithm strictly (no algorithm confusion).
    Raises AuthenticationError on invalid or expired token.
    """
    public_key = get_jwt_public_key()
    try:
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"require": ["sub", "org_id", "role", "auth_version", "exp"]},
        )
        return cast(dict[str, Any], payload)
    except jwt.ExpiredSignatureError as e:
        raise AuthenticationError("Access token has expired", code="TOKEN_EXPIRED") from e
    except jwt.InvalidTokenError as e:
        raise AuthenticationError("Invalid access token", code="INVALID_TOKEN") from e


# -----------------------------------------------------------------------------
# Refresh Token Management
# -----------------------------------------------------------------------------


def generate_refresh_token(org_id: str | None = None) -> tuple[str, str]:
    """
    Generate an opaque cryptographically secure refresh token.
    Returns: (raw_token, token_hash)
    The raw token is returned to the client once; only the SHA-256 hash is stored in the database.
    """
    secret_part = secrets.token_urlsafe(48)
    raw_token = f"{org_id}.{secret_part}" if org_id else secret_part
    token_hash = hash_refresh_token(raw_token)
    return raw_token, token_hash


def hash_refresh_token(raw_token: str) -> str:
    """Compute SHA-256 hex digest of an opaque refresh token."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
