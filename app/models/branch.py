from app.extensions import db
from datetime import datetime

class Branch(db.Model):
    __tablename__ = "branch"

    id = db.Column(db.Integer, primary_key=True)
    branch_name = db.Column(db.String(225), nullable=False)
    contact_number = db.Column(db.String(50))
    additional_contact_number = db.Column(db.String(50))
    address = db.Column(db.String(225))
    description = db.Column(db.String(225))
    is_active = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.String(225))
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = db.Column(db.String(225))
