from app.extensions import db
from datetime import datetime

class User(db.Model):
    __tablename__ = "user"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(225), nullable=False)
    email = db.Column(db.String(225), unique=True, nullable=False)
    password = db.Column(db.String(225), nullable=False)

    branch_id = db.Column(db.Integer)
    role_id = db.Column(db.Integer)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    doctor_signature = db.Column(db.Text, nullable=True, default=None)  # New field for storing doctor's signature