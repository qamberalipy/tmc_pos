def get_active_shift(user_id):
    from app.models.shift import ShiftSession
    from app.extensions import db
    from datetime import datetime, timezone, timedelta
    shift = ShiftSession.query.filter_by(user_id=user_id, status='Open').first()
    if shift:
        st = shift.start_time
        if st and st.tzinfo is None:
            st = st.replace(tzinfo=timezone.utc)
        if st and (datetime.now(timezone.utc) - st) > timedelta(hours=15):
            shift.end_time = shift.start_time + timedelta(hours=15)
            shift.status = 'Closed'
            db.session.commit()
            return None
    return shift
