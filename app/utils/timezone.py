"""
app/utils/timezone.py
---------------------
Single source of truth for Pakistan Standard Time (PKT / Asia/Karachi, UTC+5)
display conversions.

WHY THIS EXISTS
---------------
The app runs on two live domains that share one Neon Postgres database:
  • Render (US)   – OS timezone = UTC
  • Ubuntu tunnel (Pakistan) – OS timezone = PKT (+05:00)

datetime.now() / datetime.utcnow() silently depend on the OS clock and
therefore produce divergent timestamps when called from the two servers.

RULE
----
  • Every database WRITE uses  datetime.now(timezone.utc)       (aware, UTC)
  • Every display/format call  uses  to_local(dt, fmt)          (converts → PKT)

This module is the *only* place that knows about Asia/Karachi.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

_PKT = ZoneInfo("Asia/Karachi")


def to_local(dt, fmt: str | None = None):
    """
    Convert a stored UTC datetime to Pakistan Standard Time (Asia/Karachi,
    UTC+05:00) and optionally format it as a string.

    Parameters
    ----------
    dt : datetime | date | None
        • None          → returns "" (if fmt given) or None
        • date (not datetime) → no timezone concept; formatted/returned as-is
        • naive datetime → treated as UTC (legacy rows written by utcnow())
        • aware datetime → converted from its stored tz to PKT

    fmt : str | None
        strftime format string.  If provided, returns a formatted string.
        If omitted, returns the converted datetime object (or date as-is).

    Examples
    --------
    >>> to_local(booking.create_at, "%d-%b-%Y %I:%M %p")
    '21-Sep-2026 10:30 PM'
    >>> to_local(datetime.now(timezone.utc))         # returns aware PKT datetime
    """
    if dt is None:
        return "" if fmt else None

    # Plain date objects carry no time-of-day / timezone; format directly.
    if type(dt) is date and not isinstance(dt, datetime):
        return dt.strftime(fmt) if fmt else dt

    # Attach UTC tzinfo to legacy naive rows (written by datetime.utcnow()).
    if isinstance(dt, datetime) and dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    local_dt = dt.astimezone(_PKT)
    return local_dt.strftime(fmt) if fmt else local_dt
