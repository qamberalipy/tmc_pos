from app.extensions import db
from sqlalchemy import JSON

class Referred(db.Model):
    __tablename__ = "referred"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(225), nullable=False)
    contact_no = db.Column(db.String(50))
    is_doctor = db.Column(db.Boolean, default=False)
    location = db.Column(db.String(225), nullable=False)
    specialization = db.Column(db.String(225), nullable=False)

    branch_id = db.Column(db.Integer)

    discount_to_patient = db.Column(
        JSON,
        default=lambda: {"give_discount": False, "value": 0}
    )

    is_active = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.DateTime, default=db.func.now())
    updated_at = db.Column(db.DateTime, default=db.func.now(), onupdate=db.func.now())
    created_by = db.Column(db.Integer)
    updated_by = db.Column(db.Integer)
