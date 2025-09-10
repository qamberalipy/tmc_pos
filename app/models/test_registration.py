from app.extensions import db
from sqlalchemy import JSON 

class Test_registration(db.Model):
    __tablename__ = 'test_registration'

    id = db.Column(db.Integer, primary_key=True)
    test_name = db.Column(db.String(225), nullable=False)
    sample_collection = db.Column(db.String(50), nullable=True)  
    department_id = db.Column(db.Integer, nullable=True)  
    charges = db.Column(db.Float, nullable=False)
    required_days = db.Column(db.String(225), nullable=False)
    sequence_no = db.Column(db.String(225), nullable=True)
    no_of_films = db.Column(db.Integer, nullable=True)  
    description = db.Column(db.String(225), nullable=True)
    branch_id = db.Column(db.Integer, nullable=False)  
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=db.func.current_timestamp())
    updated_at = db.Column(
        db.DateTime,
        default=db.func.current_timestamp(),
        onupdate=db.func.current_timestamp()
    )
    created_by = db.Column(db.Integer, nullable=True)
    updated_by = db.Column(db.Integer, nullable=True)
