"""
DSA OS — Sensitive Field Encryption & Masking Utilities

Implements:
- Fernet symmetric encryption for sensitive fields at rest (e.g. PAN)
- Controlled deterministic derivation for indexable last-4 fields
- Strict masking helpers preventing PII exposure on default responses
"""

from cryptography.fernet import Fernet

from app.config import get_settings


def _get_fernet() -> Fernet:
    settings = get_settings()
    return Fernet(settings.field_encryption_key.encode("utf-8"))


def encrypt_field(value: str | None) -> str | None:
    """Encrypt a sensitive plaintext string at rest using Fernet."""
    if not value:
        return None
    fernet = _get_fernet()
    encrypted_bytes = fernet.encrypt(value.strip().encode("utf-8"))
    return encrypted_bytes.decode("utf-8")


def decrypt_field(ciphertext: str | None) -> str | None:
    """Decrypt a Fernet-encrypted ciphertext string."""
    if not ciphertext:
        return None
    fernet = _get_fernet()
    decrypted_bytes = fernet.decrypt(ciphertext.encode("utf-8"))
    return decrypted_bytes.decode("utf-8")


def mask_pan(pan: str | None) -> str | None:
    """
    Mask a 10-character PAN showing only the last 4 characters.
    Example: 'ABCDE1234F' -> 'XXXXXX234F'
    """
    if not pan:
        return None
    cleaned = pan.strip().upper()
    if len(cleaned) < 4:
        return "XXXX"
    return "X" * (len(cleaned) - 4) + cleaned[-4:]


def mask_aadhaar(aadhaar_last_four: str | None) -> str | None:
    """
    Format masked Aadhaar using only the stored last 4 digits.
    Never stores or handles full 12 digits.
    Example: '1234' -> 'XXXX-XXXX-1234'
    """
    if not aadhaar_last_four:
        return None
    cleaned = aadhaar_last_four.strip()
    return f"XXXX-XXXX-{cleaned[-4:]}"


def mask_mobile(mobile: str | None) -> str | None:
    """
    Mask a phone number showing country code and last 3 digits.
    Example: '+919876543210' -> '+91 XXXXX XX210'
    """
    if not mobile:
        return None
    cleaned = mobile.strip()
    if len(cleaned) <= 4:
        return cleaned
    return f"{cleaned[:3]} XXXXX XX{cleaned[-3:]}"
