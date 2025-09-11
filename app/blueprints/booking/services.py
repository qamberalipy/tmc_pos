from flask import session
from app.extensions import db
from app.models import TestBooking, TestBookingDetails
from werkzeug.security import generate_password_hash
from sqlalchemy.exc import SQLAlchemyError
from decimal import Decimal, InvalidOperation
from datetime import datetime


def create_test_booking(data):
    # --- Required fields validation ---
    required_fields = ["patient_name", "gender", "contact_no", "branch_id", "net_receivable", "create_by"]
    missing = [f for f in required_fields if not data.get(f)]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")

    # --- Validate gender ---
    if data["gender"] not in ["Male", "Female", "Other"]:
        raise ValueError("Invalid gender value. Must be Male, Female, or Other.")

    # --- Validate discount type ---
    if data.get("discount_type") and data["discount_type"] not in ["None", "Amount", "Percentage"]:
        raise ValueError("Invalid discount_type. Must be None, Amount, or Percentage.")

    # --- Validate payment type ---
    if data.get("payment_type") and data["payment_type"] not in ["Cash", "Card", "Online", "Other"]:
        raise ValueError("Invalid payment_type. Must be Cash, Card, Online, or Other.")

    # --- Safe Decimal conversion helper ---
    def to_decimal(value, field_name):
        if value is None:
            return Decimal("0.00")
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError):
            raise ValueError(f"{field_name} must be a valid number")

    net_receivable = to_decimal(data["net_receivable"], "net_receivable")
    discount_value = to_decimal(data.get("discount_value", 0), "discount_value")
    paid_amount = to_decimal(data.get("paid_amount", 0), "paid_amount")
    due_amount = to_decimal(data.get("due_amount", 0), "due_amount")

    # --- Start transaction ---
    with db.session.begin():
        # Create booking
        booking = TestBooking(
            mr_no=data.get('mr_no'),
            patient_name=data['patient_name'],
            gender=data['gender'],
            age=data.get('age'),
            contact_no=data['contact_no'],

            referred_dr=data.get('referred_dr'),
            referred_non_dr=data.get('referred_non_dr'),
            give_share_to=data.get('give_share_to', None),

            branch_id=data['branch_id'],
            total_no_of_films=data.get('total_no_of_films', 0),
            total_no_of_films_used=data.get('total_no_of_films', 0),
            discount_type=data.get('discount_type', 'None'),
            discount_value=discount_value,
            net_receivable=net_receivable,
            payment_type=data.get('payment_type', 'Cash'),
            paid_amount=paid_amount,
            due_date=data.get('due_date'),
            due_amount=due_amount,

            create_by=data['create_by']
        )

        db.session.add(booking)
        db.session.flush()  # ensures booking.id is available

        # Prepare test details
        test_details_list = data.get('tests', [])
        details = []

        for idx, test in enumerate(test_details_list, start=1):
            if not test.get("test_id"):
                raise ValueError(f"Test #{idx} missing test_id")
            if not test.get("amount"):
                raise ValueError(f"Test #{idx} missing amount")

            amount = to_decimal(test["amount"], f"tests[{idx}].amount")

            reporting_date = None
            if test.get("reporting_date"):
                try:
                    reporting_date = (
                        datetime.strptime(test["reporting_date"], "%Y-%m-%d").date()
                        if isinstance(test["reporting_date"], str)
                        else test["reporting_date"]
                    )
                except ValueError:
                    raise ValueError(f"tests[{idx}].reporting_date must be YYYY-MM-DD")

            details.append(TestBookingDetails(
                booking_id=booking.id,
                test_id=test["test_id"],
                quantity=test.get("quantity", 1),
                amount=amount,
                no_of_films=test.get("no_of_films"),
                required_days=test.get("required_days"),
                reporting_date=reporting_date,
                sample_to_follow=test.get("sample_to_follow")
            ))

        if details:
            db.session.add_all(details)

    # --- Commit happens automatically at the end of with block ---
    return {
        "message": "Booking created successfully",
        "booking_id": booking.id,
        "total_tests": len(test_details_list)
    }
