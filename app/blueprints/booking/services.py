import json
from flask import session
from sqlalchemy import func, and_, cast, String
from app.blueprints import booking
from app.extensions import db
from app.models import TestBookingDetails,User,Branch,Referred
from werkzeug.security import generate_password_hash
from sqlalchemy.exc import SQLAlchemyError
from decimal import Decimal, InvalidOperation
from datetime import datetime
from sqlalchemy.ext.mutable import MutableDict, MutableList
from app.models.test_booking import TestFilmUsage, TestBooking,FilmInventoryTransaction
from app.models.test_registration import Test_registration


def create_test_booking(data):
    try:
        # --- Required fields validation ---
        required = ["patient_name", "gender", "contact_no", "branch_id", "net_receivable", "create_by"]
        missing = [f for f in required if not data.get(f)]
        if missing:
            raise ValueError(f"Missing: {', '.join(missing)}")

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
                mr_no=data.get("mr_no"),
                patient_name=data["patient_name"],
                gender=data["gender"],
                age=data.get("age"),
                contact_no=data["contact_no"],
                referred_dr=data.get("referred_dr"),
                referred_non_dr=data.get("referred_non_dr"),
                give_share_to=data.get("give_share_to"),
                branch_id=data["branch_id"],
                discount_type=data.get("discount_type", "None"),
                discount_value=discount_value,
                net_receivable=net_receivable,
                payment_type=data.get("payment_type", "Cash"),
                paid_amount=paid_amount,
                due_amount=due_amount,
                create_by=data["create_by"]
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
            
            initial_films = int(data.get("total_no_of_films", 0))
            if initial_films > 0:
                add_film_usage(
                    booking_id=booking.id,
                    films_used=initial_films,
                    usage_type="Normal",
                    used_by=data["create_by"],
                    branch_id=data["branch_id"]
                )

            # Recalculate anyway
            #update_booking_total_films(booking.id)

        # --- Commit happens automatically at the end of with block ---
        return {
            "message": "Booking created successfully",
            "booking_id": booking.id,
            "total_tests": len(test_details_list)
        }
    except SQLAlchemyError as e:
        db.session.rollback()
        print("Database error creating booking:", str(e.__dict__.get("orig", e)))
        return {"error": str(e.__dict__.get("orig", e))}, 500
    except Exception as e:
        print("Error creating booking:", str(e))
        return {"error": str(e)}, 400  
    

def update_booking_total_films(booking_id):
    total = db.session.query(
        db.func.sum(TestFilmUsage.films_used)
    ).filter_by(booking_id=booking_id).scalar() or 0

    booking = TestBooking.query.get(booking_id)
    booking.total_no_of_films_used = total
    db.session.add(booking)

    return total

def add_film_usage(booking_id, films_used, usage_type, used_by, branch_id, reason=None):
    usage = TestFilmUsage(
        booking_id=booking_id,
        films_used=films_used,
        films_required=films_used,
        usage_type=usage_type,
        reason=reason,
        used_by=used_by,
        branch_id=branch_id
    )
    db.session.add(usage)
    db.session.flush()  # usage.id created

    # Inventory OUT
    inventory_transaction(
        quantity=films_used,
        transaction_type="OUT",
        booking_id=booking_id,
        handled_by=used_by,
        branch_id=branch_id,
        reason="Films consumed"
    )

    # Recalculate totals
    update_booking_total_films(booking_id)

    return usage

def inventory_transaction(quantity, transaction_type, handled_by, branch_id, booking_id=None, reason=""):
    if transaction_type not in ["IN", "OUT", "ADJUST"]:
        raise ValueError("Invalid transaction_type")

    txn = FilmInventoryTransaction(
        transaction_type=transaction_type,
        quantity=quantity,
        handled_by=handled_by,
        branch_id=branch_id,
        booking_id=booking_id,
        reason=reason
    )
    
    db.session.add(txn)
    return txn

def edit_film_usage_by_booking(booking_id, new_films_used, usage_type, edited_by, reason="Edited film usage"):
    print("Editing film usage:", booking_id, new_films_used, usage_type, edited_by, reason)

    # ---- Basic Validations ----
    if not booking_id:
        return {"error": "booking_id is required"}, 400
        
    if new_films_used is None or new_films_used < 0:
        return {"error": "Invalid new_films_used value"}, 400

    if usage_type not in ['Normal', 'Extra', 'Repeat', 'Error']:
        return {"error": "Invalid usage_type value"}, 400

    usage = TestFilmUsage.query.filter_by(booking_id=booking_id).first()
    if not usage:
        return {"error": "Film usage not found for this booking"}, 404

    old_value = usage.films_used
    difference = new_films_used - old_value

    try:
        # ❗ NO db.session.begin() HERE ❗

        # STORE LAST EDIT
        usage.last_edited_old_value = old_value
        usage.last_edited_at = datetime.utcnow()
        usage.last_edited_by = edited_by
        usage.usage_type = usage_type

        # UPDATE REQUIRED FIELDS
        usage.used_by = edited_by
        usage.used_at = datetime.utcnow()

        # UPDATE FILMS USED
        usage.films_used = new_films_used
        usage.reason = reason
        db.session.add(usage)

        # INVENTORY IMPACT
        if difference > 0:
            inventory_transaction(
                quantity=difference,
                transaction_type="OUT",
                handled_by=edited_by,
                branch_id=usage.branch_id,
                booking_id=booking_id,
                reason="Film usage increased"
            )

        elif difference < 0:
            inventory_transaction(
                quantity=abs(difference),
                transaction_type="ADJUST",
                handled_by=edited_by,
                branch_id=usage.branch_id,
                booking_id=booking_id,
                reason="Film usage reduced"
            )

        # UPDATE BOOKING TOTAL FILMS
        update_booking_total_films(booking_id)

        # FINAL COMMIT
        db.session.commit()

        return {
            "message": "Film usage updated",
            "old_value": old_value,
            "new_value": new_films_used,
            "difference": difference,
            "previous_edit_stored": old_value
        },201

    except Exception as e:
        db.session.rollback()
        print("Film usage update error:", str(e))
        return {"error": str(e)}, 500


def get_booking_details(booking_id: int):
    """
    Fetch a booking with related branch, referred doctor, and test details.
    Optimized for speed and safe error handling.
    """

    if not booking_id:
        return {"error": "Invalid booking id"}, 400

    try:
        # --- Fetch booking ---
        booking = (
            db.session.query(TestBooking)
            .filter(TestBooking.id == booking_id)
            .first()
        )

        if not booking:
            return {"error": "Booking not found"}, 404

        # --- Branch ---
        branch = (
            db.session.query(Branch)
            .with_entities(
                Branch.branch_name,
                Branch.contact_number,
                Branch.address,
                Branch.additional_contact_number,
            )
            .filter(Branch.id == booking.branch_id)
            .first()
        )

        # --- Referred doctor ---
        referred_name = None
        if booking.referred_dr:
            referred = (
                db.session.query(Referred)
                .with_entities(Referred.name)
                .filter(Referred.id == booking.referred_dr)
                .first()
            )
            referred_name = referred.name if referred else None

        # --- Tests ---
        tests = (
            db.session.query(
                TestBookingDetails.test_id,
                TestBookingDetails.quantity,
                TestBookingDetails.no_of_films,
                TestBookingDetails.amount,
                TestBookingDetails.reporting_date,
                TestBookingDetails.sample_to_follow,
            )
            .filter(TestBookingDetails.booking_id == booking.id)
            .all()
        )

        test_list = [
            {
                "test_id": t.test_id,
                "quantity": t.quantity,
                "no_of_films": t.no_of_films,
                "amount": float(t.amount or 0),
                "reporting_date": (
                    t.reporting_date.strftime("%d-%b-%Y %I:%M %p")
                    if t.reporting_date else None
                ),
                "sample_to_follow": t.sample_to_follow,
            }
            for t in tests
        ]

        # --- Deserialize technician comments ---
        try:
            technician_comments = (
                json.loads(booking.technician_comments)
                if booking.technician_comments
                else {"comments": []}
            )
        except (json.JSONDecodeError, TypeError):
            technician_comments = {"comments": []}

        # --- Final structured response ---
        return {
            "booking_id": booking.id,
            "mr_no": booking.mr_no,
            "patient_name": booking.patient_name,
            "technician_comments": technician_comments,
            "gender": booking.gender,
            "age": booking.age,
            "contact_no": booking.contact_no,
            "referred_by": referred_name or "Self",
            "branch": {
                "name": branch.branch_name if branch else None,
                "contact": branch.contact_number if branch else None,
                "address": branch.address if branch else None,
                "additional_contact": branch.additional_contact_number if branch else None,
            },
            "financials": {
                "discount_type": booking.discount_type,
                "discount_value": float(booking.discount_value or 0),
                "net_payable": float(booking.net_receivable or 0),
                "received": float(booking.paid_amount or 0),
                "balance": float(booking.due_amount or 0),
            },
            "tests": test_list,
            "printed_at": datetime.now().strftime("%d-%b-%Y %I:%M %p"),
            "current_user": session.get("user_name"),
        }, 200

    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": "Database error: " + str(e.__dict__.get("orig", e))}, 500

    except Exception as e:
        return {"error": "Unexpected error: " + str(e)}, 500


def _format_test_booking(row):
    return {
        "booking_id": row.id,
        "patient_name": row.patient_name,
        "date": row.create_at.strftime("%Y-%m-%d") if row.create_at else None,
        "referred_dr": row.referred_dr,
        "mr_no": row.mr_no,
        "test_name": row.test_names,   # already aggregated string
        "technician_comments": row.technician_comments,
        "total_amount": float(row.net_receivable),
        "total_films": row.total_no_of_films_used,
        "discount": float(row.discount_value) if row.discount_value else 0,
        "net_amount": float(row.net_receivable - row.discount_value) if row.discount_value else float(row.net_receivable),
        "received": float(row.paid_amount),
        "balance": float(row.due_amount),
        "branch": row.branch_name,
        "created_by": row.created_by_name,
        "created_at": row.create_at,
        "updated_at": row.update_at
    }


# 🔹 Get All Bookings (optimized with join + aggregation)
def get_all_test_bookings(branch_id=None):
    try:
        # PostgreSQL-compatible aggregation of test names
        query = (
            db.session.query(
                TestBooking.id,
                TestBooking.patient_name,
                TestBooking.mr_no,
                Referred.name.label("referred_dr"),
                TestBooking.net_receivable,
                TestBooking.discount_value,
                TestBooking.paid_amount,
                TestBooking.due_amount,
                TestBooking.create_at,
                TestBooking.total_no_of_films_used,
                TestBooking.technician_comments,
                TestBooking.update_at,
                Branch.branch_name.label("branch_name"),
                User.name.label("created_by_name"),
                func.string_agg(
                    func.distinct(cast(Test_registration.test_name, String)),
                    ', '
                ).label("test_names")
            )
            .join(TestBookingDetails, TestBookingDetails.booking_id == TestBooking.id)
            .join(Test_registration, Test_registration.id == TestBookingDetails.test_id)
            .outerjoin(Referred, and_(Referred.id == TestBooking.referred_dr, Referred.is_doctor == True))
            .outerjoin(Branch, Branch.id == TestBooking.branch_id)
            .outerjoin(User, User.id == TestBooking.create_by)
            .group_by(
                TestBooking.id,
                Branch.branch_name,
                User.name,
                Referred.name
            )
            .order_by(TestBooking.create_at.desc())
        )

        if branch_id:
            query = query.filter(TestBooking.branch_id == branch_id)

        rows = query.all()
        return [_format_test_booking(r) for r in rows], 200

    except SQLAlchemyError as e:
        return {"error": str(e.__dict__.get("orig", e))}, 500

def add_booking_comment(booking_id: int, data):
    try:
        comment_text = data.get("comment", "").strip()
        if not comment_text:
            return {"error": "Comment is required"}, 400

        booking = TestBooking.query.get_or_404(booking_id)

        # load existing comments or init
        if booking.technician_comments:
            comments = json.loads(booking.technician_comments)
        else:
            comments = {"comments": []}

        new_comment = {
            "user_id": session.get("user_id"),
            "user_name": session.get("user_name"),
            "role": session.get("user_role"),
            "comment": comment_text,
            "datetime": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        }

        comments["comments"].append(new_comment)

        # save back as string
        booking.technician_comments = json.dumps(comments)

        db.session.add(booking)
        db.session.commit()
        db.session.refresh(booking)

        print("Saved:", booking.technician_comments)

        return {"message": "Comment added successfully", "data": new_comment}, 201

    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get("orig", e))}, 500

    except Exception as e:
        db.session.rollback()
        return {"error": str(e)}, 500

