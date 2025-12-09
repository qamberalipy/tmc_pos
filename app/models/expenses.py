from app.extensions import db
from datetime import datetime

class Expenses(db.Model):
    __tablename__ = "expenses"

    id = db.Column(db.Integer, primary_key=True)
    branch_id = db.Column(db.Integer, nullable=False)
    expense_head_id = db.Column(db.Integer, nullable=False)
    amount = db.Column(db.Integer, nullable=False)
    description = db.Column(db.String(225))
    is_deleted = db.Column(db.Boolean, default=False)

    ref_no = db.Column(db.String(50))
    payment_method = db.Column(
        db.Enum("Cash", "Card", "Online", "Other", name="payment_enum"),
        default="Cash"
    )
    paid_to = db.Column(db.String(225))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.Integer)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = db.Column(db.Integer)
