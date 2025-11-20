from app.extensions import db
from datetime import datetime

class TestBooking(db.Model):
    __tablename__ = "test_booking"

    id = db.Column(db.Integer, primary_key=True)
    mr_no = db.Column(db.String(225), unique=True)
    patient_name = db.Column(db.String(225), nullable=False)

    gender = db.Column(
        db.Enum("Male", "Female", "Other", name="gender_enum"),
        nullable=False
    )

    age = db.Column(db.Integer)
    contact_no = db.Column(db.String(15), nullable=False)
    technician_comments = db.Column(db.Text)

    referred_dr = db.Column(db.Integer)
    referred_non_dr = db.Column(db.Integer)

    give_share_to = db.Column(db.Integer, default=None)

    branch_id = db.Column(db.Integer, nullable=False)

    total_no_of_films = db.Column(db.Integer, default=0)
    total_no_of_films_used = db.Column(db.Integer, default=0)
    reason_for_more_films = db.Column(db.String(225))

    discount_type = db.Column(
        db.Enum("None", "Amount", "Percentage", name="discount_enum"),
        default="None"
    )
    discount_value = db.Column(db.Numeric(10, 2), default=0)

    net_receivable = db.Column(db.Numeric(10, 2), nullable=False)

    payment_type = db.Column(
        db.Enum("Cash", "Card", "Online", "Other", name="payment_enum"),
        default="Cash"
    )

    paid_amount = db.Column(db.Numeric(10, 2), default=0)
    due_date = db.Column(db.Date)
    due_amount = db.Column(db.Numeric(10, 2), default=0)

    create_by = db.Column(db.Integer, nullable=False)
    create_at = db.Column(db.DateTime, default=datetime.utcnow)
    update_by = db.Column(db.Integer)
    update_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class TestFilmUsage(db.Model):
    __tablename__ = "test_film_usage"

    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.Integer, db.ForeignKey('test_booking.id'), nullable=False)
    films_required = db.Column(db.Integer, default=0)
    films_used = db.Column(db.Integer, nullable=False)
    last_edited_old_value = db.Column(db.Integer, nullable=True)
    usage_type = db.Column(db.Enum('Normal', 'Extra', 'Repeat', 'Error', name='usage_type_enum'), nullable=False)
    reason = db.Column(db.String(255))  
    used_by = db.Column(db.Integer, nullable=False)
    used_at = db.Column(db.DateTime, default=datetime.utcnow)
    branch_id = db.Column(db.Integer, nullable=False)
    last_edited_by = db.Column(db.Integer, nullable=True)
    last_edited_at = db.Column(db.DateTime, nullable=True)


class FilmInventoryTransaction(db.Model):
    __tablename__ = "film_inventory_transactions"

    id = db.Column(db.Integer, primary_key=True)
    transaction_date = db.Column(db.DateTime, default=datetime.utcnow)
    transaction_type = db.Column(db.Enum('IN', 'OUT', 'ADJUST', name='trans_type_enum'),nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    booking_id = db.Column(db.Integer, db.ForeignKey('test_booking.id'), nullable=True)
    reason = db.Column(db.String(255))
    handled_by = db.Column(db.Integer, nullable=False)
    branch_id = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)