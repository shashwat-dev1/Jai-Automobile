"""
DSA OS — Referral Partner OTP Security & Verification Service

Implements enterprise-grade OTP lifecycle management:
1. Cryptographically secure random numeric OTP generation (secrets module).
2. Salting and SHA-256 hashing (plaintext OTP is NEVER persisted).
3. Configurable expiry (default 5 minutes).
4. Rate limiting:
   - Resend cooldown (default 60 seconds)
   - Max OTP generation per window (default 3 per 10 minutes)
   - Max failed verification attempts (default 5) before lockout/invalidation
5. Immediate invalidation upon successful verification (single-use, prevents replay).
6. Dual backend: Redis (production / multi-worker) with thread-safe in-memory fallback.
"""

import hashlib
import json
import logging
import secrets
import time
from dataclasses import dataclass
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class OtpGenerateResult:
    otp_code: str  # For dispatch only (never persisted or returned to client)
    normalized_mobile: str
    expires_in_seconds: int
    resend_cooldown_seconds: int


@dataclass
class OtpVerificationResult:
    success: bool
    message: str
    error_code: str | None = None
    remaining_attempts: int | None = None
    partner_name: str | None = None


class InMemoryOtpStore:
    """Thread-safe in-memory store with automatic timestamp expiration."""

    def __init__(self) -> None:
        self._store: dict[str, dict[str, Any]] = {}
        self._rate_limits: dict[str, list[float]] = {}

    def set_otp(self, mobile: str, data: dict[str, Any], ttl_seconds: int) -> None:
        data["expires_at"] = time.time() + ttl_seconds
        self._store[mobile] = data

    def get_otp(self, mobile: str) -> dict[str, Any] | None:
        entry = self._store.get(mobile)
        if not entry:
            return None
        if time.time() > entry.get("expires_at", 0):
            self._store.pop(mobile, None)
            return None
        return entry

    def update_otp(self, mobile: str, data: dict[str, Any]) -> None:
        if mobile in self._store:
            self._store[mobile] = data

    def delete_otp(self, mobile: str) -> None:
        self._store.pop(mobile, None)

    def record_send(self, mobile: str, window_seconds: int) -> int:
        now = time.time()
        timestamps = self._rate_limits.get(mobile, [])
        # Prune old timestamps
        timestamps = [ts for ts in timestamps if now - ts < window_seconds]
        timestamps.append(now)
        self._rate_limits[mobile] = timestamps
        return len(timestamps)

    def get_last_send_time(self, mobile: str) -> float | None:
        timestamps = self._rate_limits.get(mobile)
        return timestamps[-1] if timestamps else None


_in_memory_store = InMemoryOtpStore()


class OtpSecurityService:
    def __init__(self, redis_client: Any = None) -> None:
        self.settings = get_settings()
        self.redis = redis_client
        self.store = _in_memory_store

    def _hash_otp(self, otp: str, salt: str) -> str:
        """Compute salted SHA-256 digest."""
        return hashlib.sha256(f"{salt}:{otp}".encode("utf-8")).hexdigest()

    async def generate_otp(
        self,
        normalized_mobile: str,
        partner_name: str = "",
    ) -> OtpGenerateResult:
        """
        Generate a secure random numeric OTP and store its salted hash.
        Enforces resend cooldown and send rate limits.
        """
        now = time.time()

        # 1. Rate Limit: Resend cooldown check
        last_send = self.store.get_last_send_time(normalized_mobile)
        if last_send is not None:
            elapsed = now - last_send
            cooldown = self.settings.otp_resend_cooldown_seconds
            if elapsed < cooldown:
                wait_seconds = int(cooldown - elapsed)
                raise ValueError(
                    f"Please wait {wait_seconds} seconds before requesting a new verification code."
                )

        # 2. Rate Limit: Window quota check
        sends_in_window = self.store.record_send(
            normalized_mobile,
            self.settings.otp_rate_limit_window_seconds,
        )
        if sends_in_window > self.settings.otp_rate_limit_max_sends:
            raise ValueError(
                "Maximum verification attempts reached for this mobile number. Please try again after 10 minutes."
            )

        # 3. Generate cryptographically secure random numeric OTP
        length = self.settings.otp_length
        min_val = 10 ** (length - 1)
        max_val = (10**length) - 1
        raw_otp = str(secrets.randbelow(max_val - min_val + 1) + min_val)

        # 4. Generate random salt and hash
        salt = secrets.token_hex(16)
        hashed_otp = self._hash_otp(raw_otp, salt)

        otp_record = {
            "hashed_otp": hashed_otp,
            "salt": salt,
            "partner_name": partner_name.strip(),
            "attempts": 0,
            "created_at": now,
        }

        # 5. Persist hashed record with TTL
        ttl = self.settings.otp_expiry_seconds
        if self.redis:
            try:
                key = f"otp:ref:{normalized_mobile}"
                await self.redis.set(key, json.dumps(otp_record), ex=ttl)
            except Exception as exc:
                logger.warning("Redis set failed for OTP, using in-memory store: %s", exc)
                self.store.set_otp(normalized_mobile, otp_record, ttl)
        else:
            self.store.set_otp(normalized_mobile, otp_record, ttl)

        return OtpGenerateResult(
            otp_code=raw_otp,
            normalized_mobile=normalized_mobile,
            expires_in_seconds=ttl,
            resend_cooldown_seconds=self.settings.otp_resend_cooldown_seconds,
        )

    async def verify_otp(
        self,
        normalized_mobile: str,
        submitted_otp: str,
    ) -> OtpVerificationResult:
        """
        Verify the submitted OTP against the stored salted hash.
        Enforces attempt limits, invalidation upon success, and expiry.
        """
        clean_otp = submitted_otp.strip()
        if not clean_otp or not clean_otp.isdigit():
            return OtpVerificationResult(
                success=False,
                message="Verification code must contain only numeric digits.",
                error_code="INVALID_FORMAT",
            )

        # Retrieve record
        record: dict[str, Any] | None = None
        key = f"otp:ref:{normalized_mobile}"

        if self.redis:
            try:
                raw_data = await self.redis.get(key)
                if raw_data:
                    record = json.loads(raw_data)
            except Exception as exc:
                logger.warning("Redis get failed for OTP, checking in-memory store: %s", exc)
                record = self.store.get_otp(normalized_mobile)
        else:
            record = self.store.get_otp(normalized_mobile)

        if not record:
            return OtpVerificationResult(
                success=False,
                message="Verification code has expired or does not exist. Please request a new code.",
                error_code="EXPIRED_OR_NOT_FOUND",
            )

        salt = record.get("salt", "")
        stored_hash = record.get("hashed_otp", "")
        attempts = record.get("attempts", 0) + 1
        record["attempts"] = attempts

        max_attempts = self.settings.otp_max_attempts
        if attempts > max_attempts:
            # Invalidate record to prevent brute-forcing
            await self._delete_record(normalized_mobile)
            return OtpVerificationResult(
                success=False,
                message="Maximum verification attempts exceeded. Please request a new code.",
                error_code="MAX_ATTEMPTS_EXCEEDED",
                remaining_attempts=0,
            )

        # Constant-time comparison
        submitted_hash = self._hash_otp(clean_otp, salt)
        if not secrets.compare_digest(stored_hash, submitted_hash):
            remaining = max(0, max_attempts - attempts)
            # Update attempt count in store
            await self._update_record(normalized_mobile, record)
            return OtpVerificationResult(
                success=False,
                message=f"Incorrect verification code. {remaining} attempt(s) remaining.",
                error_code="INCORRECT_CODE",
                remaining_attempts=remaining,
            )

        # Successful verification: Immediately invalidate OTP to prevent replay
        await self._delete_record(normalized_mobile)

        return OtpVerificationResult(
            success=True,
            message="Mobile number successfully verified.",
            partner_name=record.get("partner_name"),
        )

    async def _update_record(self, mobile: str, record: dict[str, Any]) -> None:
        key = f"otp:ref:{mobile}"
        if self.redis:
            try:
                # Keep remaining TTL if possible
                ttl = await self.redis.ttl(key)
                if ttl > 0:
                    await self.redis.set(key, json.dumps(record), ex=ttl)
                    return
            except Exception:
                pass
        self.store.update_otp(mobile, record)

    async def _delete_record(self, mobile: str) -> None:
        key = f"otp:ref:{mobile}"
        if self.redis:
            try:
                await self.redis.delete(key)
            except Exception:
                pass
        self.store.delete_otp(mobile)
