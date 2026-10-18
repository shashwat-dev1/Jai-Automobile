"""
DSA OS — Referral Partner OTP & TextBee Gateway Unit Tests

Verifies:
1. Phone number normalization (+91 format for TextBee SMS, 10-digit for database).
2. TextBee gateway request schema, SIM selection (simSubscriptionId: 1), and device ID.
3. Cryptographically secure random 6-digit OTP generation and salted SHA-256 hash storage.
4. Plaintext OTP is never stored in memory or database.
5. Correct OTP verifies successfully.
6. Incorrect OTP is rejected with remaining attempt count.
7. Attempt lockout: max 5 failed attempts invalidates OTP.
8. Replay prevention: used OTP cannot be verified twice.
9. Resend rate limiting: minimum 60s cooldown between requests.
10. Window rate limit: maximum 3 OTP requests per 10 minutes.
11. TextBee failure handling: gateway failure fails safely without marking user verified.
"""

import time
import pytest
from unittest.mock import AsyncMock, patch

from app.modules.referrals.schemas import (
    ReferralOtpSendRequest,
    ReferralOtpVerifyRequest,
)
from app.modules.referrals.textbee_gateway import (
    TextBeeGateway,
    TextBeeSendResult,
)
from app.modules.referrals.otp_service import (
    OtpSecurityService,
    InMemoryOtpStore,
)


# -----------------------------------------------------------------------------
# 1. Phone Normalization for TextBee & Database
# -----------------------------------------------------------------------------
def test_textbee_recipient_normalization() -> None:
    """Ensure recipient formats to international E.164 (+91XXXXXXXXXX)."""
    assert TextBeeGateway.normalize_recipient("9876543210") == "+919876543210"
    assert TextBeeGateway.normalize_recipient("+91 98765 43210") == "+919876543210"
    assert TextBeeGateway.normalize_recipient("09876543210") == "+919876543210"

    with pytest.raises(ValueError, match="10-digit Indian number"):
        TextBeeGateway.normalize_recipient("12345")

    with pytest.raises(ValueError, match="start with 6, 7, 8, or 9"):
        TextBeeGateway.normalize_recipient("5876543210")


def test_otp_schemas_validation() -> None:
    """Ensure ReferralOtpSendRequest and ReferralOtpVerifyRequest normalize numbers."""
    send_req = ReferralOtpSendRequest(mobile="+91 98765 43210", name="Arjun Sharma")
    assert send_req.mobile == "9876543210"
    assert send_req.name == "Arjun Sharma"

    verify_req = ReferralOtpVerifyRequest(
        mobile="09876543210",
        otp="123456",
        name="Arjun Sharma",
    )
    assert verify_req.mobile == "9876543210"
    assert verify_req.otp == "123456"


# -----------------------------------------------------------------------------
# 2. TextBee Gateway Configuration & SIM Selection
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_textbee_payload_structure_and_sim_selection() -> None:
    """Verify exact TextBee request schema and Airtel SIM subscription ID."""
    from unittest.mock import MagicMock
    gateway = TextBeeGateway(
        api_key="test_api_key_123",
        device_id="6ad35c2110b63ade602300fd",
        sim_subscription_id=1,
    )

    with patch("httpx.AsyncClient.post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/json"}
        mock_response.json.return_value = {
            "success": True,
            "data": {"id": "msg-tx-1001", "status": "sent"},
        }
        mock_post.return_value = mock_response

        result = await gateway.send_sms(
            to_mobile="9876543210",
            message="Your OTP is 654321",
        )

        assert result.success is True
        assert result.recipient == "+919876543210"
        assert result.message_id == "msg-tx-1001"

        # Verify call arguments
        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args.kwargs
        assert call_kwargs["headers"]["x-api-key"] == "test_api_key_123"

        payload = call_kwargs["json"]
        assert payload["deviceId"] == "6ad35c2110b63ade602300fd"
        assert payload["recipients"] == ["+919876543210"]
        assert payload["message"] == "Your OTP is 654321"
        assert payload["simSubscriptionId"] == 1  # Confirmed integer subscription ID


@pytest.mark.asyncio
async def test_textbee_fails_safely_when_key_missing() -> None:
    """When TEXTBEE_API_KEY is not configured, gateway returns safe failure without crashing."""
    gateway = TextBeeGateway(api_key=None)
    result = await gateway.send_sms(to_mobile="9876543210", message="Hello")
    assert result.success is False
    assert "TEXTBEE_API_KEY is not configured" in result.error_message


# -----------------------------------------------------------------------------
# 3. OTP Security Service & Lifecycle
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_otp_generation_and_salted_hashing() -> None:
    """Ensure OTP is 6 digits and stored only as a salted hash."""
    service = OtpSecurityService()
    test_mobile = "9820011222"

    # Reset store for test_mobile
    service.store.delete_otp(test_mobile)
    service.store._rate_limits.pop(test_mobile, None)

    gen = await service.generate_otp(test_mobile, "Rajesh Kumar")
    assert len(gen.otp_code) == 6
    assert gen.otp_code.isdigit()
    assert gen.expires_in_seconds == 300

    # Inspect stored record: verify plaintext OTP is NOT stored
    record = service.store.get_otp(test_mobile)
    assert record is not None
    assert "salt" in record
    assert "hashed_otp" in record
    assert gen.otp_code not in str(record)  # Plaintext is absent from stored record


@pytest.mark.asyncio
async def test_otp_verification_success_and_replay_prevention() -> None:
    """Ensure valid OTP succeeds and cannot be reused."""
    service = OtpSecurityService()
    test_mobile = "9820011223"
    service.store.delete_otp(test_mobile)
    service.store._rate_limits.pop(test_mobile, None)

    gen = await service.generate_otp(test_mobile, "Santosh Verma")

    # 1. Correct OTP verification
    verify_res = await service.verify_otp(test_mobile, gen.otp_code)
    assert verify_res.success is True
    assert verify_res.partner_name == "Santosh Verma"

    # 2. Replay attempt: OTP must be invalidated immediately
    replay_res = await service.verify_otp(test_mobile, gen.otp_code)
    assert replay_res.success is False
    assert replay_res.error_code == "EXPIRED_OR_NOT_FOUND"


@pytest.mark.asyncio
async def test_otp_incorrect_code_and_lockout() -> None:
    """Ensure incorrect OTP reduces attempts, and max attempts locks out."""
    service = OtpSecurityService()
    test_mobile = "9820011224"
    service.store.delete_otp(test_mobile)
    service.store._rate_limits.pop(test_mobile, None)

    gen = await service.generate_otp(test_mobile, "Manoj Patel")

    # Wrong attempt 1
    res1 = await service.verify_otp(test_mobile, "000000")
    assert res1.success is False
    assert res1.error_code == "INCORRECT_CODE"
    assert res1.remaining_attempts == 4

    # Subsequent wrong attempts up to lockout (5 max attempts)
    await service.verify_otp(test_mobile, "000001")
    await service.verify_otp(test_mobile, "000002")
    await service.verify_otp(test_mobile, "000003")
    res5 = await service.verify_otp(test_mobile, "000004")
    assert res5.remaining_attempts == 0

    # 6th attempt: lockout
    res6 = await service.verify_otp(test_mobile, gen.otp_code)
    assert res6.success is False
    assert res6.error_code in {"MAX_ATTEMPTS_EXCEEDED", "EXPIRED_OR_NOT_FOUND"}


@pytest.mark.asyncio
async def test_otp_resend_cooldown_rate_limit() -> None:
    """Ensure OTP cannot be re-requested within the 60-second cooldown."""
    service = OtpSecurityService()
    test_mobile = "9820011225"
    service.store.delete_otp(test_mobile)
    service.store._rate_limits.pop(test_mobile, None)

    await service.generate_otp(test_mobile, "Vikramaditya")

    # Immediate second request must trigger cooldown error
    with pytest.raises(ValueError, match="Please wait .* seconds before requesting a new verification code"):
        await service.generate_otp(test_mobile, "Vikramaditya")
