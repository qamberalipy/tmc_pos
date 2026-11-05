"""
app/utils/email.py
------------------
Email dispatch utility for TMC Diagnostic Center using Gmail SMTP.
Includes:
- Branded responsive HTML email layout
- Case assignment notification template
- Synchronous and asynchronous email delivery via standard library smtplib
"""
from __future__ import annotations

import html
import logging
import os
import smtplib
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from typing import Iterable, Sequence

from dotenv import load_dotenv

# Ensure environment variables are loaded
load_dotenv()

logger = logging.getLogger(__name__)

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
DEFAULT_TIMEOUT = 10.0
BRAND_NAME = "TMC Diagnostic Center"
BRAND_PRIMARY_COLOR = "#021a71"


def _clean_addresses(addresses: str | Iterable[str] | None) -> list[str]:
    """Clean, filter, and deduplicate email addresses preserving order."""
    if not addresses:
        return []

    if isinstance(addresses, str):
        # Support comma or semicolon delimited strings
        raw_list = [addr.strip() for addr in addresses.replace(";", ",").split(",")]
    else:
        raw_list = [str(addr).strip() for addr in addresses if addr]

    cleaned: list[str] = []
    seen = set()
    for addr in raw_list:
        if addr and "@" in addr and "." in addr:
            lower = addr.lower()
            if lower not in seen:
                seen.add(lower)
                cleaned.append(addr)
    return cleaned


def send_email(
    to: str | Sequence[str],
    subject: str,
    html_body: str,
    text_body: str | None = None,
    cc: str | Sequence[str] | None = None,
    bcc: str | Sequence[str] | None = None,
) -> bool:
    """
    Send an email via Gmail SMTP using STARTTLS.
    Never raises an exception; logs errors and returns True/False.
    """
    sender_email = (os.getenv("GMAIL_SENDER_EMAIL") or "").strip()
    sender_password = (os.getenv("GMAIL_APP_PASSWORD") or "").strip()

    if not sender_email or not sender_password:
        logger.warning(
            "Cannot send email: GMAIL_SENDER_EMAIL or GMAIL_APP_PASSWORD environment variable is missing."
        )
        return False

    to_addrs = _clean_addresses(to)
    cc_addrs = _clean_addresses(cc)
    bcc_addrs = _clean_addresses(bcc)

    if not to_addrs:
        logger.warning("Cannot send email: No valid recipient (to) address provided.")
        return False

    all_recipients = to_addrs + cc_addrs + bcc_addrs

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = formataddr((BRAND_NAME, sender_email))
        msg["To"] = ", ".join(to_addrs)
        if cc_addrs:
            msg["Cc"] = ", ".join(cc_addrs)

        # Plain text fallback
        if text_body:
            msg.attach(MIMEText(text_body, "plain", "utf-8"))

        # HTML body
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=DEFAULT_TIMEOUT) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(sender_email, sender_password)
            server.sendmail(sender_email, all_recipients, msg.as_string())

        logger.info("Email '%s' sent successfully to: %s", subject, ", ".join(to_addrs))
        return True
    except Exception as exc:
        logger.error("Failed to send email '%s' to %s: %s", subject, to_addrs, exc, exc_info=True)
        return False


def send_email_async(
    to: str | Sequence[str],
    subject: str,
    html_body: str,
    text_body: str | None = None,
    cc: str | Sequence[str] | None = None,
    bcc: str | Sequence[str] | None = None,
) -> threading.Thread:
    """
    Non-blocking async wrapper that delivers an email via a daemon thread.
    Accepts only plain python values.
    """
    thread = threading.Thread(
        target=send_email,
        kwargs={
            "to": to,
            "subject": subject,
            "html_body": html_body,
            "text_body": text_body,
            "cc": cc,
            "bcc": bcc,
        },
        daemon=True,
    )
    thread.start()
    return thread


def render_email_layout(title: str, body_html: str) -> str:
    """
    Reusable branded email layout wrapper.
    Features:
    - Primary brand colour #021a71
    - Font 'Segoe UI', Arial, sans-serif
    - Centered card max-width 640px on light grey #f4f6fa background
    - Table-based inline CSS for robust rendering across email clients
    """
    safe_title = html.escape(title)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{safe_title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6fa; font-family: 'Segoe UI', Arial, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; color: #2d3748;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f6fa; padding: 28px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 640px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
          <!-- Header Band -->
          <tr>
            <td style="background-color: {BRAND_PRIMARY_COLOR}; padding: 24px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; font-family: 'Segoe UI', Arial, sans-serif; letter-spacing: 0.5px; text-transform: uppercase;">
                {BRAND_NAME}
              </h1>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 30px 28px 30px; color: #2d3748; font-size: 15px; line-height: 1.6; font-family: 'Segoe UI', Arial, sans-serif;">
              {body_html}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 30px; text-align: center; font-size: 12px; color: #64748b; font-family: 'Segoe UI', Arial, sans-serif; border-top: 1px solid #edf2f7;">
              <p style="margin: 0 0 6px 0;">This is an automated message from TMC Diagnostic Center. Please do not reply.</p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">&copy; TMC Diagnostic Center. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def build_assignment_email(
    doctor_name: str,
    assigned_by_name: str,
    branch_name: str,
    assigned_at_str: str,
    items: list[dict],
    pending_cases_url: str,
) -> tuple[str, str]:
    """
    Build HTML and plain-text email bodies for a doctor case assignment notification.
    `items` is a list of dicts: [{'booking_id': ..., 'mr_no': ..., 'patient_name': ..., 'test_name': ...}, ...]
    All dynamic strings are escaped for HTML safety.
    Returns (html_body, text_body).
    """
    safe_doctor_name = html.escape(doctor_name or "Doctor")
    safe_assigned_by = html.escape(assigned_by_name or "Staff")
    safe_branch = html.escape(branch_name or "Main Branch")
    safe_assigned_at = html.escape(assigned_at_str or "")
    safe_pending_cases_url = html.escape(pending_cases_url, quote=True)

    test_count = len(items)
    unique_booking_ids = {str(item.get("booking_id")) for item in items if item.get("booking_id")}
    booking_count = len(unique_booking_ids)

    # Build Table Rows
    table_rows_html = []
    for idx, item in enumerate(items):
        bg = "#ffffff" if idx % 2 == 0 else "#f8fafc"
        b_id = html.escape(str(item.get("booking_id", "")))
        mr_no = html.escape(str(item.get("mr_no", "-")))
        patient = html.escape(str(item.get("patient_name", "-")))
        test_name = html.escape(str(item.get("test_name", "-")))

        row_html = f"""<tr style="background-color: {bg};">
  <td style="padding: 10px 12px; border: 1px solid #e2e8f0; font-size: 13px; font-weight: 600; color: #1e293b; text-align: center;">{b_id}</td>
  <td style="padding: 10px 12px; border: 1px solid #e2e8f0; font-size: 13px; color: #334155; white-space: nowrap;">{mr_no}</td>
  <td style="padding: 10px 12px; border: 1px solid #e2e8f0; font-size: 13px; color: #334155;">{patient}</td>
  <td style="padding: 10px 12px; border: 1px solid #e2e8f0; font-size: 13px; color: #021a71; font-weight: 600;">{test_name}</td>
</tr>"""
        table_rows_html.append(row_html)

    table_body = "\n".join(table_rows_html)

    body_html = f"""
<p style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #1e293b;">
  Dear Dr. {safe_doctor_name},
</p>

<p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #475569;">
  You have been assigned <strong>{test_count}</strong> new test{'s' if test_count != 1 else ''} across <strong>{booking_count}</strong> booking{'s' if booking_count != 1 else ''} for reporting.
</p>

<!-- Assignment Summary Card -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; margin: 0 0 24px 0; padding: 14px 18px;">
  <tr>
    <td style="font-size: 13px; color: #64748b; padding: 4px 0; width: 35%;"><strong>Assigned By:</strong></td>
    <td style="font-size: 13px; color: #1e293b; padding: 4px 0;">{safe_assigned_by}</td>
  </tr>
  <tr>
    <td style="font-size: 13px; color: #64748b; padding: 4px 0;"><strong>Branch:</strong></td>
    <td style="font-size: 13px; color: #1e293b; padding: 4px 0;">{safe_branch}</td>
  </tr>
  <tr>
    <td style="font-size: 13px; color: #64748b; padding: 4px 0;"><strong>Assigned At:</strong></td>
    <td style="font-size: 13px; color: #1e293b; padding: 4px 0;">{safe_assigned_at}</td>
  </tr>
  <tr>
    <td style="font-size: 13px; color: #64748b; padding: 4px 0;"><strong>Total Tests:</strong></td>
    <td style="font-size: 13px; color: #021a71; font-weight: 700; padding: 4px 0;">{test_count} test{'s' if test_count != 1 else ''} ({booking_count} booking{'s' if booking_count != 1 else ''})</td>
  </tr>
</table>

<!-- Assigned Tests Table -->
<h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px;">
  Assigned Cases
</h3>

<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin: 0 0 28px 0;">
  <thead>
    <tr style="background-color: #f1f5f9;">
      <th style="padding: 10px 12px; border: 1px solid #cbd5e1; font-size: 12px; font-weight: 700; color: #475569; text-align: center; width: 15%;">ID</th>
      <th style="padding: 10px 12px; border: 1px solid #cbd5e1; font-size: 12px; font-weight: 700; color: #475569; text-align: left; width: 25%;">MR No</th>
      <th style="padding: 10px 12px; border: 1px solid #cbd5e1; font-size: 12px; font-weight: 700; color: #475569; text-align: left; width: 30%;">Patient Name</th>
      <th style="padding: 10px 12px; border: 1px solid #cbd5e1; font-size: 12px; font-weight: 700; color: #475569; text-align: left; width: 30%;">Test</th>
    </tr>
  </thead>
  <tbody>
    {table_body}
  </tbody>
</table>

<!-- Call to Action Button -->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 16px 0;">
  <tr>
    <td align="center">
      <a href="{safe_pending_cases_url}" target="_blank" style="display: inline-block; background-color: {BRAND_PRIMARY_COLOR}; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600; letter-spacing: 0.3px; box-shadow: 0 2px 4px rgba(2, 26, 113, 0.25);">
        View Pending Cases &rarr;
      </a>
    </td>
  </tr>
</table>

<p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
  Or visit: <a href="{safe_pending_cases_url}" style="color: #021a71; text-decoration: underline;">{safe_pending_cases_url}</a>
</p>
"""

    full_html = render_email_layout(
        title=f"New Cases Assigned – Dr. {doctor_name}",
        body_html=body_html,
    )

    # Plain-text alternative
    plain_items = "\n".join(
        f"  - Booking #{it.get('booking_id')} | MR: {it.get('mr_no')} | Patient: {it.get('patient_name')} | Test: {it.get('test_name')}"
        for it in items
    )
    text_body = f"""TMC Diagnostic Center
==================================================
Dear Dr. {doctor_name},

You have been assigned {test_count} new test(s) across {booking_count} booking(s) for reporting.

Assignment Summary:
- Assigned By: {assigned_by_name}
- Branch: {branch_name}
- Assigned At: {assigned_at_str}
- Total Tests: {test_count}

Assigned Cases:
{plain_items}

Please log in to the doctor portal to review and complete reports:
{pending_cases_url}

==================================================
This is an automated message from TMC Diagnostic Center. Please do not reply.
"""
    return full_html, text_body

