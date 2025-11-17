from app.extensions import db

class Branch(db.Model):
    __tablename__ = "branch"

    id = db.Column(db.Integer, primary_key=True)
    branch_name = db.Column(db.String(225), nullable=False)
    contact_number = db.Column(db.String(50))
    additional_contact_number = db.Column(db.String(50))
    address = db.Column(db.String(225))
    description = db.Column(db.String(225))
    is_active = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.DateTime, default=db.func.now())
    created_by = db.Column(db.String(225))
    updated_at = db.Column(db.DateTime, default=db.func.now(), onupdate=db.func.now())
    updated_by = db.Column(db.String(225))
