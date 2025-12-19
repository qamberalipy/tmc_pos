from app.extensions import db

class TestBookingDetails(db.Model):
    __tablename__ = "test_booking_details"

    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.Integer, nullable=False)
    test_id = db.Column(db.Integer, nullable=False)

    quantity = db.Column(db.Integer, default=1)
    no_of_films = db.Column(db.Integer)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    film_issued = db.Column(db.Boolean, default=False)
    required_days = db.Column(db.Integer)
    reporting_date = db.Column(db.Date)
    sample_to_follow = db.Column(db.String(225))
