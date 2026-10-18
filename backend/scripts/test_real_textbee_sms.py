"""
DSA OS — TextBee Real Device Live SMS Diagnostic Script

Verifies connection with the Motorola Edge 60 Pro gateway and sends a test SMS
via the Airtel SIM using confirmed subscription ID 1.

Usage:
  python backend/scripts/test_real_textbee_sms.py --recipient 98XXXXXXXX
"""

import argparse
import os
import sys
import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
    # also try backend/.env
    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
except ImportError:
    pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Test real SMS delivery via TextBee gateway.")
    parser.add_argument("--recipient", "-r", required=True, help="Recipient Indian mobile number (e.g. 9876543210)")
    parser.add_argument("--device-id", default="6ad35c2110b63ade602300fd", help="TextBee Device ID")
    parser.add_argument("--sim-id", type=int, default=1, help="Airtel SIM subscription ID")
    parser.add_argument("--api-key", default=None, help="TextBee API key (defaults to TEXTBEE_API_KEY env var)")

    args = parser.parse_args()

    api_key = args.api_key or os.environ.get("TEXTBEE_API_KEY")
    if not api_key:
        print("[ERROR] TEXTBEE_API_KEY is not set. Provide --api-key or export TEXTBEE_API_KEY.")
        sys.exit(1)

    # 1. Clean recipient
    raw = args.recipient.strip()
    digits = "".join(filter(str.isdigit, raw))
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) != 10:
        print(f"[ERROR] Invalid mobile number '{raw}'. Must be 10 digits.")
        sys.exit(1)

    formatted_recipient = f"+91{digits}"

    print("==================================================")
    print("DSA OS — TextBee Live Gateway Diagnostic")
    print("==================================================")
    print(f"Device ID:         {args.device_id}")
    print(f"Target SIM Sub ID: {args.sim_id} (Airtel)")
    print(f"Recipient:         {formatted_recipient}")
    print("==================================================")

    # 2. Inspect device SIM information
    print("\n[STEP 1] Querying TextBee Device status & SIM cards...")
    device_url = f"https://api.textbee.dev/api/v1/gateway/devices/{args.device_id}"
    try:
        dev_res = requests.get(device_url, headers={"x-api-key": api_key}, timeout=10)
        if dev_res.status_code == 200:
            dev_data = dev_res.json()
            print("[INFO] Device Status Response:")
            print(dev_data)
        else:
            print(f"! Device info warning (HTTP {dev_res.status_code}): {dev_res.text}")
    except Exception as e:
        print(f"! Could not fetch device info: {e}")

    # 3. Send test SMS
    print("\n[STEP 2] Dispatching live SMS via Airtel SIM...")
    sms_url = "https://api.textbee.dev/api/v1/gateway/send-sms"
    payload = {
        "deviceId": args.device_id,
        "recipients": [formatted_recipient],
        "message": "Jai Automobiles: Your verification code is 749215. Valid for 5 minutes. Enter this OTP to complete your referral partner verification. Do not share this code with anyone.",
        "simSubscriptionId": args.sim_id,
    }

    try:
        res = requests.post(
            sms_url,
            headers={
                "x-api-key": api_key,
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=15,
        )

        print(f"HTTP Status: {res.status_code}")
        print("Response JSON:")
        try:
            print(res.json())
        except Exception:
            print(res.text)

        if res.status_code in (200, 201):
            print("\n[SUCCESS] Live SMS accepted by TextBee gateway!")
        else:
            print(f"\n[FAILED] Gateway rejected SMS (HTTP {res.status_code})")

    except requests.exceptions.Timeout:
        print("\n[TIMEOUT] Request timed out. Ensure the Motorola Edge 60 Pro is connected to Wi-Fi/cellular.")
    except Exception as e:
        print(f"\n[ERROR] Error: {e}")


if __name__ == "__main__":
    main()
