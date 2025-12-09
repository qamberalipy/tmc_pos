# helper.py
from datetime import datetime
import pytz

def convert_to_utc(datetime_string: str, timezone: str = "Asia/Karachi"):

    if not datetime_string:
        return None

    local_tz = pytz.timezone(timezone)

    # Try multiple datetime formats
    try:
        # Handles full ISO format including "T"
        dt = datetime.fromisoformat(datetime_string)
    except ValueError:
        # Fallback for date-only input "YYYY-MM-DD"
        dt = datetime.strptime(datetime_string, "%Y-%m-%d")

    # Attach local timezone
    local_dt = local_tz.localize(dt)

    # Convert → UTC
    return local_dt.astimezone(pytz.utc)
