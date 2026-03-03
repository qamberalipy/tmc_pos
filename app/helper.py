from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from werkzeug.exceptions import BadRequest
import pytz

def get_lab_date_bounds(from_date_str, to_date_str, branch_id):
    """
    Takes logical date strings (YYYY-MM-DD) and a branch ID, 
    returns exact UTC datetime bounds for the 8:00 AM to 4:00 AM lab window.
    """
    # Import inside function to prevent circular import issues in __init__
    from app.models.branch import Branch 
    
    if not from_date_str or not to_date_str:
        return None, None

    try:
        from_date = datetime.strptime(from_date_str, "%Y-%m-%d")
        to_date = datetime.strptime(to_date_str, "%Y-%m-%d")
    except ValueError:
        raise BadRequest("Date format must be YYYY-MM-DD.")

    if from_date > to_date:
        raise BadRequest("from_date cannot be greater than to_date.")

    # 1. Fetch Branch Timezone safely
    branch = Branch.query.get(branch_id) if branch_id else None
    tz_string = branch.timezone if branch and hasattr(branch, 'timezone') and branch.timezone else 'Asia/Karachi'
    
    try:
        local_tz = ZoneInfo(tz_string)
    except Exception:
        local_tz = ZoneInfo('Asia/Karachi') # Fallback

    # 2. Calculate Exact Local Boundaries
    # Start: from_date at 08:00:00
    start_local = from_date.replace(hour=8, minute=0, second=0, tzinfo=local_tz)
    
    # End: to_date at 08:00:00 PLUS 20 hours (Resulting in 04:00 AM the NEXT day)
    end_local_base = to_date.replace(hour=8, minute=0, second=0, tzinfo=local_tz)
    end_local = end_local_base + timedelta(hours=20)

    # 3. Return Absolute UTC
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)

def convert_to_utc(datetime_string: str, timezone: str = "Asia/Karachi"):

    if not datetime_string:
        return None

    local_tz = datetime.timezone(timezone)

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
