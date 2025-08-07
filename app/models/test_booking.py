from app.extensions import db
from datetime import datetime

class TestBooking(db.Model):
    __tablename__ = 'test_booking'

    id = db.Column(db.Integer, primary_key=True)
    mr_no = db.Column(db.String(225))
    panel_name = db.Column(db.String(225))
    password = db.Column(db.String(225))
    gender = db.Column(db.String(225))
    age = db.Column(db.Integer)
    dob = db.Column(db.Date)

    referred_dr_id = db.Column(db.Integer)
    branch_id = db.Column(db.Integer)
    create_by = db.Column(db.Integer)

    create_at = db.Column(db.DateTime, default=datetime.utcnow)
    discount_type = db.Column(db.String(225))
    discount_value = db.Column(db.Numeric)
    net_receivable = db.Column(db.Numeric)
    payment_type = db.Column(db.String(225))
    paid_amount = db.Column(db.Numeric)
    due_amount = db.Column(db.Numeric)
    due_date = db.Column(db.Date)
    update_by = db.Column(db.Integer)
    update_at = db.Column(db.DateTime)
