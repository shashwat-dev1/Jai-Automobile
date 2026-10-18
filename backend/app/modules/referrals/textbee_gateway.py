"""
DSA OS — TextBee Android SMS Gateway Client

Handles outbound SMS delivery via the configured TextBee gateway device
(Motorola Edge 60 Pro) using the confirmed Airtel SIM (subscription ID 1).

Specifications:
- Endpoint: https://api.textbee.dev/api/v1/gateway/send-sms
- Header: x-api-key: <TEXTBEE_API_KEY>
- JSON Payload:
    {
        "deviceId": "<TEXTBEE_DEVICE_ID>",
        "recipients": ["+91XXXXXXXXXX"],
        "message": "<TEXT>",
        "simSubscriptionId": 1
    }
- SIM selection: TextBee strictly uses `simSubscriptionId` (integer subscription ID).
  Never falls back to default SIM silently. Fails safely on SIM or gateway failure.
"""

import logging
import re
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class TextBeeError(Exception):
    """Base exception for TextBee gateway communication errors."""


class TextBeeConfigurationError(TextBeeError):
    """Raised when required TextBee configuration (e.g. API key) is missing."""


class TextBeeDeliveryError(TextBeeError):
    """Raised when the TextBee API rejects the SMS or reports delivery failure."""


@dataclass
class TextBeeSendResult:
    success: bool
    recipient: str
    message_id: str | None = None
    gateway_status: str | None = None
    error_message: str | None = None
    raw_response: dict[str, Any] | None = None


class TextBeeGateway:
    """
    Client for TextBee SMS Gateway API.
    Routes messages exclusively through the configured Android device and Airtel SIM.
    """

    def __init__(
        self,
        api_key: str | None = None,
        device_id: str | None = None,
        sim_subscription_id: int | None = None,
        api_url: str | None = None,
    ) -> None:
        settings = get_settings()
        self.api_key = api_key or settings.textbee_api_key
        self.device_id = device_id or settings.textbee_device_id
        self.sim_subscription_id = (
            sim_subscription_id
            if sim_subscription_id is not None
            else settings.textbee_sim_subscription_id
        )
        self.api_url = api_url or settings.textbee_api_url

    @staticmethod
    def normalize_recipient(raw_phone: str) -> str:
        """
        Normalize Indian phone number into E.164 format (+91XXXXXXXXXX).
        """
        digits = re.sub(r"\D", "", raw_phone)
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        elif len(digits) == 11 and digits.startswith("0"):
            digits = digits[1:]
        if len(digits) != 10:
            raise ValueError(f"Invalid mobile number '{raw_phone}'. Must be a 10-digit Indian number.")
        if digits[0] not in {"6", "7", "8", "9"}:
            raise ValueError(f"Indian mobile numbers must start with 6, 7, 8, or 9.")
        return f"+91{digits}"

    async def send_sms(self, to_mobile: str, message: str) -> TextBeeSendResult:
        """
        Send an SMS message through TextBee using the configured Airtel SIM.

        Strict Rules:
        1. Fails immediately if TEXTBEE_API_KEY is not configured.
        2. Recipient must be formatted with +91 country code.
        3. Forces `simSubscriptionId` in payload.
        4. Fails safely on network error, SIM error, or offline device.
        """
        if not self.api_key:
            logger.error("TextBee send_sms invoked without TEXTBEE_API_KEY configured.")
            return TextBeeSendResult(
                success=False,
                recipient=to_mobile,
                error_message="TEXTBEE_API_KEY is not configured on the server. Please configure it in server environment.",
            )

        if not self.device_id:
            logger.error("TextBee send_sms invoked without TEXTBEE_DEVICE_ID configured.")
            return TextBeeSendResult(
                success=False,
                recipient=to_mobile,
                error_message="TEXTBEE_DEVICE_ID is missing from configuration.",
            )

        try:
            formatted_recipient = self.normalize_recipient(to_mobile)
        except ValueError as val_err:
            return TextBeeSendResult(
                success=False,
                recipient=to_mobile,
                error_message=str(val_err),
            )

        payload = {
            "deviceId": self.device_id,
            "recipients": [formatted_recipient],
            "message": message,
            "simSubscriptionId": int(self.sim_subscription_id),
        }

        headers = {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        logger.info(
            "Dispatching SMS via TextBee: deviceId=%s, simSubscriptionId=%s, recipient=%s",
            self.device_id,
            self.sim_subscription_id,
            formatted_recipient[:6] + "****",
        )

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(
                    self.api_url,
                    json=payload,
                    headers=headers,
                )

                if res.status_code == 401 or res.status_code == 403:
                    logger.error("TextBee API returned authentication error (HTTP %d)", res.status_code)
                    return TextBeeSendResult(
                        success=False,
                        recipient=formatted_recipient,
                        error_message="TextBee API authentication failed. Verify TEXTBEE_API_KEY.",
                        raw_response=res.json() if res.headers.get("content-type", "").startswith("application/json") else None,
                    )

                if res.status_code == 404:
                    logger.error("TextBee device %s not found (HTTP 404)", self.device_id)
                    return TextBeeSendResult(
                        success=False,
                        recipient=formatted_recipient,
                        error_message=f"TextBee device ID '{self.device_id}' was not found in TextBee account.",
                    )

                data: dict[str, Any] = {}
                try:
                    data = res.json()
                except Exception:
                    data = {"text": res.text}

                if res.status_code != 200 and res.status_code != 201:
                    err_msg = (
                        data.get("message")
                        or data.get("error")
                        or f"TextBee Gateway error (HTTP {res.status_code})"
                    )
                    logger.error("TextBee SMS dispatch failed: %s", err_msg)
                    return TextBeeSendResult(
                        success=False,
                        recipient=formatted_recipient,
                        error_message=str(err_msg),
                        raw_response=data,
                    )

                # Check payload response structure
                # Success response typically contains { "success": true, "data": { ... } } or similar
                msg_id = None
                if isinstance(data, dict):
                    inner_data = data.get("data")
                    if isinstance(inner_data, dict):
                        msg_id = inner_data.get("id") or inner_data.get("messageId")
                    elif isinstance(inner_data, list) and len(inner_data) > 0 and isinstance(inner_data[0], dict):
                        msg_id = inner_data[0].get("id") or inner_data[0].get("messageId")
                    if not msg_id:
                        msg_id = data.get("id") or data.get("messageId")

                logger.info(
                    "SMS successfully accepted by TextBee gateway for %s (id=%s)",
                    formatted_recipient[:6] + "****",
                    msg_id,
                )

                return TextBeeSendResult(
                    success=True,
                    recipient=formatted_recipient,
                    message_id=str(msg_id) if msg_id else None,
                    gateway_status="ACCEPTED",
                    raw_response=data,
                )

        except httpx.ConnectTimeout:
            logger.error("TextBee API connection timed out. Android gateway phone may be offline.")
            return TextBeeSendResult(
                success=False,
                recipient=formatted_recipient,
                error_message="SMS Gateway connection timed out. Please ensure the Android gateway device is online.",
            )
        except httpx.RequestError as exc:
            logger.error("Network error while connecting to TextBee: %s", exc)
            return TextBeeSendResult(
                success=False,
                recipient=formatted_recipient,
                error_message=f"Network error connecting to SMS Gateway: {exc}",
            )
        except Exception as exc:
            logger.exception("Unexpected error in TextBeeGateway.send_sms: %s", exc)
            return TextBeeSendResult(
                success=False,
                recipient=formatted_recipient,
                error_message=f"Unexpected error sending SMS: {exc}",
            )
