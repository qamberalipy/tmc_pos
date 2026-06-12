from app.extensions import db
from datetime import datetime, timezone

class TechnicianChatLog(db.Model):
    __tablename__ = "technician_chat_log"

    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.Integer, db.ForeignKey('test_booking.id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    
    # The actual chat message
    message = db.Column(db.Text, nullable=True)
    
    # Standard Chat Timestamps
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    is_deleted = db.Column(db.Boolean, default=False)

    # Relationships
    user = db.relationship("User", lazy="joined")
    # Link media directly to this specific chat bubble
    media_attachments = db.relationship("TechnicianBookingMedia", backref="chat_log", lazy="select")