from app.extensions import db

class TestBookingDetails(db.Model):
    __tablename__ = 'test_booking_details'

    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.Integer, nullable=False)   # reference to TestBooking.id
    test_id = db.Column(db.Integer, nullable=False)      # reference to TestRegistration.id
    quantity = db.Column(db.Integer, default=1)
    no_of_films = db.Column(db.Integer, nullable=True)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    required_days = db.Column(db.Integer, nullable=True)
    reporting_date = db.Column(db.Date, nullable=True)
    sample_to_follow = db.Column(db.String(225), nullable=True)
