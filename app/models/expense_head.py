from app.extensions import db

class Expense_head(db.Model):
    __tablename__ = "expense_head"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(225), nullable=False)
    is_active = db.Column(db.Boolean, default=True)

    branch_id = db.Column(db.Integer) 
    created_at = db.Column(db.DateTime, default=db.func.now())
    updated_at = db.Column(db.DateTime, default=db.func.now(), onupdate=db.func.now())
    created_by = db.Column(db.Integer)
    updated_by = db.Column(db.Integer)
