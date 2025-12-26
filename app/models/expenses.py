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

class PaymentTransaction(db.Model):
    __tablename__ = "payment_transactions"

    id = db.Column(db.Integer, primary_key=True)
    branch_id = db.Column(db.Integer, nullable=False, index=True) 
    booking_id = db.Column(db.Integer, nullable=True, index=True) 
    expense_id = db.Column(db.Integer, nullable=True, index=True) 
    amount = db.Column(db.Numeric(10, 2), nullable=False) #
    direction = db.Column(db.Enum("IN", "OUT", name="direction_enum"), nullable=False) #
    payment_date = db.Column(db.DateTime, default=datetime.utcnow, index=True) #
    payment_type = db.Column(db.Enum("Cash", "Card", "Online", "Other", name="payment_enum")) # 
    transaction_type = db.Column(db.Enum("Initial", "DueClearance", "Expense", name="trans_type")) #
    created_by = db.Column(db.Integer) #