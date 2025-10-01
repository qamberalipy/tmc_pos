from app.extensions import db
from datetime import datetime
from sqlalchemy.ext.mutable import MutableDict
class TestBooking(db.Model):
    __tablename__ = 'test_booking'

    id = db.Column(db.Integer, primary_key=True)
    mr_no = db.Column(db.String(225), nullable=True, unique=True)
    patient_name = db.Column(db.String(225), nullable=False)
    gender = db.Column(db.Enum("Male", "Female", "Other", name="gender_enum"), nullable=False)
    age = db.Column(db.Integer, nullable=True)   # only years
    contact_no = db.Column(db.String(15), nullable=False)
    technician_comments = db.Column(MutableDict.as_mutable(db.JSON), nullable=True)
    referred_dr = db.Column(db.Integer, nullable=True)
    referred_non_dr = db.Column(db.Integer, nullable=True)
    give_share_to = db.Column(db.Integer, default=True)
    branch_id = db.Column(db.Integer, nullable=False)
    total_no_of_films = db.Column(db.Integer, default=0)
    total_no_of_films_used = db.Column(db.Integer, default=0)
    reason_for_more_films = db.Column(db.String(225), nullable=True)
    discount_type = db.Column(db.Enum("None", "Amount", "Percentage", name="discount_enum"), default="None")
    discount_value = db.Column(db.Numeric(10, 2), default=0)
    net_receivable = db.Column(db.Numeric(10, 2), nullable=False)
    payment_type = db.Column(db.Enum("Cash", "Card", "Online", "Other", name="payment_enum"), default="Cash")
    paid_amount = db.Column(db.Numeric(10, 2), default=0)
    due_date = db.Column(db.Date, nullable=True)
    due_amount = db.Column(db.Numeric(10, 2), default=0)

    create_by = db.Column(db.Integer, nullable=False)
    create_at = db.Column(db.DateTime, default=datetime.utcnow)
    update_by = db.Column(db.Integer, nullable=True)
    update_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)