"""
DSA OS — TOTP Two-Factor Authentication Service

Implements FR-AUTH-004 (RFC 6238 TOTP and single-use recovery codes).
Pure Python implementation with no external native C dependencies.
"""

import base64
import hashlib
import hmac
import secrets
import struct
import time


class TOTPService:
    """Provides RFC 6238 Time-based One-Time Password generation and verification."""

    @staticmethod
    def generate_secret() -> str:
        """Generate a cryptographically secure 160-bit base32 secret."""
        random_bytes = secrets.token_bytes(20)
        return base64.b32encode(random_bytes).decode("ascii").rstrip("=")

    @staticmethod
    def get_totp_code(secret: str, time_step: int = 30, for_time: float | None = None) -> str:
        """Compute the 6-digit TOTP token for the given secret at a point in time."""
        current_time = for_time if for_time is not None else time.time()
        counter = int(current_time // time_step)
        counter_bytes = struct.pack(">Q", counter)

        # Pad base32 secret if needed
        padding = (8 - len(secret) % 8) % 8
        padded_secret = secret.upper() + ("=" * padding)
        key = base64.b32decode(padded_secret, casefold=True)

        h = hmac.new(key, counter_bytes, hashlib.sha1).digest()
        offset = h[-1] & 0x0F
        binary = struct.unpack(">I", h[offset : offset + 4])[0] & 0x7FFFFFFF
        token = str(binary % 1_000_000).zfill(6)
        return token

    @classmethod
    def verify_code(cls, secret: str, code: str, drift: int = 1, time_step: int = 30) -> bool:
        """
        Verify a 6-digit TOTP code against the secret.
        Allows clock drift of +/- `drift` intervals (default 1 = +/- 30 seconds).
        """
        code = code.strip()
        if not code.isdigit() or len(code) != 6:
            return False

        now = time.time()
        for i in range(-drift, drift + 1):
            expected = cls.get_totp_code(secret, time_step=time_step, for_time=now + (i * time_step))
            if hmac.compare_digest(code, expected):
                return True
        return False

    @staticmethod
    def get_provisioning_uri(secret: str, username: str, issuer: str = "DSA OS") -> str:
        """Format standard otpauth:// URL for authenticator apps (Google Authenticator, Authy)."""
        import urllib.parse

        quoted_username = urllib.parse.quote(username)
        quoted_issuer = urllib.parse.quote(issuer)
        return f"otpauth://totp/{quoted_issuer}:{quoted_username}?secret={secret}&issuer={quoted_issuer}&algorithm=SHA1&digits=6&period=30"

    @staticmethod
    def generate_recovery_codes(count: int = 8) -> list[str]:
        """Generate human-readable 8-character recovery codes (e.g., A1B2-C3D4)."""
        codes = []
        for _ in range(count):
            part1 = secrets.token_hex(2).upper()
            part2 = secrets.token_hex(2).upper()
            codes.append(f"{part1}-{part2}")
        return codes

    @staticmethod
    def hash_code(code: str) -> str:
        """Hash a recovery code using SHA-256 for secure storage."""
        cleaned = code.strip().replace("-", "").upper()
        return hashlib.sha256(cleaned.encode("utf-8")).hexdigest()

    @classmethod
    def verify_and_consume_recovery_code(
        cls, entered_code: str, hashed_codes: list[str]
    ) -> tuple[bool, list[str]]:
        """Verify if entered code matches any remaining recovery code and consume it."""
        candidate_hash = cls.hash_code(entered_code)
        for i, h in enumerate(hashed_codes):
            if hmac.compare_digest(candidate_hash, h):
                remaining = [c for idx, c in enumerate(hashed_codes) if idx != i]
                return True, remaining
        return False, hashed_codes

    @staticmethod
    def is_2fa_mandatory_for_role(role: str) -> bool:
        """Per FR-AUTH-004: TOTP 2FA mandatory for Owner and Accountant from P1."""
        return role.lower() in ("owner", "accountant")
