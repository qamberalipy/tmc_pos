from app.extensions import db

class TestBookingDetails(db.Model):
    __tablename__ = 'test_booking_details'

    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.Integer)
    test_id = db.Column(db.Integer)
    quantity = db.Column(db.Integer)
    rate = db.Column(db.Numeric)
    amount = db.Column(db.Numeric)
    required_days = db.Column(db.Integer)
    reporting_date = db.Column(db.Date)
    sample_to_follow = db.Column(db.String(225))
