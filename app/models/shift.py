from app.extensions import db
from datetime import datetime,timezone

class ShiftSession(db.Model):
    __tablename__ = "shift_sessions"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    branch_id = db.Column(db.Integer, nullable=False)
    start_time = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    end_time = db.Column(db.DateTime(timezone=True), nullable=True)
    status = db.Column(db.Enum('Open', 'Closed', name='shift_status'), default='Open')
    
    @property
    def is_active(self):
        return self.status == 'Open'