"""
app/utils/whatsapp.py
---------------------
WhatsApp (OpenWA) messaging utility for TMC Diagnostic Center.
Includes:
- Phone number normalization
- Template message builders for referring doctors
- Synchronous and asynchronous WhatsApp message delivery via OpenWA API
"""
from __future__ import annotations

import logging
import os
import re
import threading
from typing import Sequence

from dotenv import load_dotenv
import requests

# Ensure environment variables are loaded
_env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
if os.path.exists(_env_path):
    load_dotenv(dotenv_path=_env_path)
else:
    load_dotenv()

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 10.0
BRAND_NAME = "TMC Diagnostic Center"


def get_whatsapp_config() -> dict[str, str | bool]:
    """Retrieve WhatsApp / OpenWA settings from environment variables."""
    if os.path.exists(_env_path):
        load_dotenv(dotenv_path=_env_path)
    return {
        "url": (os.getenv("OPENWA_URL") or "https://wa.tmcdiagnostics.com").strip(),
        "api_key": (os.getenv("OPENWA_API_KEY") or "").strip(),
        "session": (os.getenv("OPENWA_SESSION") or "edf39c2a-f81a-477d-8018-0dfd8066999a").strip(),
        "send_path": (os.getenv("OPENWA_SEND_PATH") or "/api/sessions/{session}/messages/send-text").strip(),
        "default_country_code": (os.getenv("OPENWA_DEFAULT_COUNTRY_CODE") or "92").strip(),
        "enabled": (os.getenv("WHATSAPP_ENABLED") or "true").strip().lower() == "true",
    }


def normalize_phone(raw: str | None, default_country_code: str | None = None) -> str | None:
    """
    Normalize raw phone number:
    - Strips spaces, dashes, brackets, dots, and '+'
    - Converts leading '0' to default country code (default '92' from env)
    - Returns cleaned digits if plausible (10-15 digits), else None.
    """
    if not raw:
        return None

    cleaned = re.sub(r"[\s\-\(\)\[\]\+\.]", "", str(raw))
    if not cleaned:
        return None

    cc = (default_country_code or os.getenv("OPENWA_DEFAULT_COUNTRY_CODE", "92") or "92").strip()

    if cleaned.startswith("0"):
        cleaned = cc + cleaned[1:]

    # Plausible check: strictly digits and length between 10 and 15
    if not cleaned.isdigit() or not (10 <= len(cleaned) <= 15):
        return None

    return cleaned


def send_whatsapp_message(phone: str, text: str) -> tuple[bool, str]:
    """
    Send a WhatsApp message via OpenWA.
    Never raises an exception; logs errors at WARNING and returns (ok: bool, detail: str).
    """
    config = get_whatsapp_config()

    if not config["enabled"]:
        msg = "WhatsApp send skipped: WHATSAPP_ENABLED is not 'true' in .env (no-op)"
        logger.info(msg)
        print(f"[WhatsApp Realtime] {msg}")
        return False, "WhatsApp disabled"

    normalized = normalize_phone(phone, str(config["default_country_code"]))
    if not normalized:
        msg = f"WhatsApp send skipped: Invalid or implausible phone number '{phone}'"
        logger.warning(msg)
        print(f"[WhatsApp Realtime WARNING] {msg}")
        return False, "Invalid phone number"

    base_url = str(config["url"])
    if not base_url:
        msg = "WhatsApp send skipped: OPENWA_URL environment variable is not configured"
        logger.warning(msg)
        print(f"[WhatsApp Realtime WARNING] {msg}")
        return False, "OPENWA_URL not set"

    session_val = str(config["session"] or "default").strip()
    send_path = str(config["send_path"]).strip()
    if "{session}" in send_path:
        send_path = send_path.replace("{session}", session_val)

    if not send_path.startswith("/"):
        send_path = "/" + send_path
    url = f"{base_url.rstrip('/')}{send_path}"

    headers = {"Content-Type": "application/json"}
    if config["api_key"]:
        api_key_str = str(config["api_key"])
        headers["x-api-key"] = api_key_str
        headers["X-API-Key"] = api_key_str

    # When using session-routed endpoints (/messages/send-text), modern OpenWA
    # validates strict DTO and rejects extra 'session' property in the request body.
    if "/messages/send-text" in send_path or "/sessions/" in send_path:
        payload = {
            "chatId": f"{normalized}@c.us",
            "text": text,
        }
    else:
        payload = {
            "session": session_val,
            "chatId": f"{normalized}@c.us",
            "text": text,
        }

    try:
        print(f"[WhatsApp Realtime] Sending message to {normalized}@c.us via {url}...")
        resp = requests.post(
            url,
            json=payload,
            headers=headers,
            timeout=DEFAULT_TIMEOUT,
        )
        resp.raise_for_status()
        logger.info("WhatsApp message successfully dispatched to %s@c.us", normalized)
        print(f"[WhatsApp Realtime] Message successfully delivered to {normalized}@c.us (status={resp.status_code})")
        return True, "Message sent successfully"
    except requests.RequestException as exc:
        status_code = getattr(getattr(exc, "response", None), "status_code", "N/A")
        err_msg = f"Failed to send WhatsApp message to {normalized}@c.us (status={status_code}): {exc}"
        logger.warning(err_msg)
        print(f"[WhatsApp Realtime WARNING] {err_msg}")
        return False, f"Request failed: {exc}"
    except Exception as exc:
        err_msg = f"Unexpected error sending WhatsApp message to {normalized}@c.us: {exc}"
        logger.warning(err_msg)
        print(f"[WhatsApp Realtime WARNING] {err_msg}")
        return False, f"Unexpected error: {exc}"


def send_whatsapp_async(phone: str, text: str) -> threading.Thread:
    """
    Non-blocking async wrapper that delivers a WhatsApp message via a daemon thread.
    IMPORTANT: Must not touch db, session, or flask.g.
    Accepts only plain python values.
    """
    thread = threading.Thread(
        target=send_whatsapp_message,
        args=(phone, text),
        daemon=True,
    )
    thread.start()
    return thread


def build_referral_booking_message(
    doctor_name: str,
    patient_name: str = "",
    mr_no: str = "",
    branch_name: str = "",
    test_names: Sequence[str] | str = "",
    booking_date: str = "",
    is_appointment: bool = False,
) -> str:
    """
    Build a general notification for referring doctors on new booking creation.
    Short and general (not detailed).
    """
    d_name = doctor_name.strip() if doctor_name else "Doctor"
    if not d_name.lower().startswith("dr.") and not d_name.lower().startswith("dr "):
        d_name = f"Dr {d_name}"

    return (
        f"Dear {d_name},\n\n"
        f"Thank you for referring your patient to *{BRAND_NAME}* .\n\n"
        f"We are committed to providing the highest quality diagnostic care.\n\n"
        f"Please contact us at 0308-2112767 for any sort of issues.\n\n"
        f"Warm regards,\n"
        f"{BRAND_NAME}"
    )


def build_referral_change_message(
    doctor_name: str,
    patient_name: str = "",
    mr_no: str = "",
    branch_name: str = "",
    test_names: Sequence[str] | str = "",
    booking_date: str = "",
    is_appointment: bool = False,
) -> str:
    """
    Build a general notification for referring doctors when a referral/share is assigned to them.
    Short and general (not detailed).
    """
    d_name = doctor_name.strip() if doctor_name else "Doctor"
    if not d_name.lower().startswith("dr.") and not d_name.lower().startswith("dr "):
        d_name = f"Dr {d_name}"

    return (
        f"Dear {d_name},\n\n"
        f"Thank you for referring your patient to *{BRAND_NAME}* .\n\n"
        f"We are committed to providing the highest quality diagnostic care.\n\n"
        f"Please contact us at 0308-2112767 for any sort of issues.\n\n"
        f"Warm regards,\n"
        f"{BRAND_NAME}"
    )

