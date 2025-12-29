from app.extensions import db
from sqlalchemy import JSON
from datetime import datetime

class Test_registration(db.Model):
    __tablename__ = "test_registration"

    id = db.Column(db.Integer, primary_key=True)
    test_name = db.Column(db.String(225), nullable=False)
    sample_collection = db.Column(db.String(50))

    department_id = db.Column(db.Integer)
    charges = db.Column(db.Float, nullable=False)
    report_charges = db.Column(db.Float, default=0.0)

    required_days = db.Column(db.String(225), nullable=False)
    sequence_no = db.Column(db.String(225))
    no_of_films = db.Column(db.Integer)

    description = db.Column(db.String(225))
    branch_id = db.Column(db.Integer, nullable=False)

    is_active = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(db.Integer)
    updated_by = db.Column(db.Integer)