from app.extensions import db

class Expenses(db.Model):
    __tablename__ = 'expenses'

    id = db.Column(db.Integer, primary_key=True)
    Branch_id = db.Column(db.String(225), nullable=False)
    expense_head_id = db.Column(db.Integer, nullable=False) 
    amount = db.Column(db.Integer, nullable=False)
    description = db.Column(db.String(225), nullable=True)
    is_deleted = db.Column(db.Boolean, default=True)
    ref_no = db.Column(db.String(50), nullable=True)
    payment_method = db.Column(db.Enum("Cash", "Card", "Online", "Other", name="payment_enum"), default="Cash")
    paid_to = db.Column(db.String(225), nullable=True)
    created_at = db.Column(db.DateTime, default=db.func.current_timestamp())
    created_by = db.Column(db.String(225), nullable=True)
    updated_at = db.Column(db.DateTime, default=db.func.current_timestamp(), onupdate=db.func.current_timestamp())
    updated_by = db.Column(db.String(225), nullable=True)
