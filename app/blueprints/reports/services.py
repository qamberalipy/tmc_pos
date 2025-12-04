from flask import session
from sqlalchemy import func, cast, Date, desc, Integer
from app.extensions import db
from app.models import TestBookingDetails
from decimal import Decimal
from datetime import datetime, date
from sqlalchemy.exc import SQLAlchemyError
from app.models.test_booking import TestFilmUsage, TestBooking, FilmInventoryTransaction
from app.models.test_registration import Test_registration
from app.models.doctor_reporting_details import DoctorReportingdetails, DoctorReportData
from app.models.user import User
from app.models.expenses import Expenses
from app.models.branch import Branch
from app.models.expense_head import Expense_head
from app.helper import convert_to_utc
from werkzeug.exceptions import BadRequest, NotFound


def _to_float(value):
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except Exception:
        return 0.0


def get_expenses_report(branch_id: int, date):
    if not branch_id or not date:
        raise ValueError("branch_id and date are required")
    # date = convert_to_utc(date.strftime("%Y-%m-%d"))
    print("Converted date to UTC:", date)
    try:
        q = (
            db.session.query(
                Expenses.expense_head_id.label("head_id"),
                Expense_head.name.label("head_name"),
                func.coalesce(func.sum(Expenses.amount), 0).label("amount")
            )
            .join(Expense_head, Expense_head.id == Expenses.expense_head_id)
            .filter(
                Expenses.is_deleted.isnot(True),
                Expenses.branch_id == branch_id,
                cast(Expenses.created_at, Date) == date
            )
            .group_by(Expenses.expense_head_id, Expense_head.name)
            .order_by(Expense_head.name)
        )

        rows = q.all()
        items = []
        total = 0

        for r in rows:
            amt = _to_float(r.amount)
            items.append({
                "id": int(r.head_id),
                "name": r.head_name,
                "amount": amt
            })
            total += amt
        user_branch=db.session.query(Branch).filter(Branch.id == branch_id).first()
        return {
            "branch_id": branch_id,
            "branch_name": user_branch.branch_name if user_branch else None,
            "date": date.strftime("%Y-%m-%d"),
            "total_expenses": total,
            "items": items
        }

    except SQLAlchemyError as e:
        print(f"Error in get_expenses_report: {str(e)}")
        db.session.rollback()
        raise


def get_films_report(branch_id: int, date):
    """date is a datetime.date object."""
    # date = convert_to_utc(date.strftime("%Y-%m-%d"))
    target_date = date

    # 1) Opening stock
    before_data = (
        db.session.query(
            FilmInventoryTransaction.transaction_type,
            func.sum(FilmInventoryTransaction.quantity)
        )
        .filter(cast(FilmInventoryTransaction.transaction_date, Date) < target_date)
        .filter(FilmInventoryTransaction.branch_id == branch_id)
        .group_by(FilmInventoryTransaction.transaction_type)
        .all()
    )

    total_in_before = sum(q for t, q in before_data if t == "IN")
    total_out_before = sum(q for t, q in before_data if t == "OUT")

    film_start = total_in_before - total_out_before

    # 2) IN/OUT Today
    day_data = (
        db.session.query(
            FilmInventoryTransaction.transaction_type,
            func.sum(FilmInventoryTransaction.quantity)
        )
        .filter(cast(FilmInventoryTransaction.transaction_date, Date) == target_date)
        .filter(FilmInventoryTransaction.branch_id == branch_id)
        .group_by(FilmInventoryTransaction.transaction_type)
        .all()
    )

    in_today = sum(q for t, q in day_data if t == "IN")
    out_today = sum(q for t, q in day_data if t == "OUT")

    # 3) Closing
    film_closing = film_start + in_today - out_today

    return {
        "film_start": film_start,
        "film_closing": film_closing,
        "film_use": out_today
    }


def get_test_report(branch_id: int, date):
    if not branch_id or not date:
        raise ValueError("branch_id and date are required")
    # date = convert_to_utc(date.strftime("%Y-%m-%d"))
    try:
        # 1) Total income
        income_row = (
            db.session.query(
                func.coalesce(func.sum(TestBooking.net_receivable), 0).label("total")
            )
            .filter(
                TestBooking.branch_id == branch_id,
                cast(TestBooking.create_at, Date) == date
            )
            .one()
        )

        total_income = _to_float(income_row.total)

        # 2) Test frequency
        t_q = (
            db.session.query(
                TestBookingDetails.test_id.label("test_id"),
                Test_registration.test_name.label("test_name"),
                func.coalesce(func.sum(TestBookingDetails.quantity), 0).label("frequency")
            )
            .join(TestBooking, TestBooking.id == TestBookingDetails.booking_id)
            .join(Test_registration, Test_registration.id == TestBookingDetails.test_id)
            .filter(
                TestBooking.branch_id == branch_id,
                cast(TestBooking.create_at, Date) == date
            )
            .group_by(TestBookingDetails.test_id, Test_registration.test_name)
            .order_by(desc("frequency"))
        )

        tests = [{
            "id": int(r.test_id),
            "test_name": r.test_name,
            "frequency": int(r.frequency)
        } for r in t_q.all()]

        return {
            "total_income": total_income,
            "tests": tests
        }

    except SQLAlchemyError:
        db.session.rollback()
        raise

def assign_bookings_to_doctor(booking_ids, doctor_id, assigned_by, branch_id):
    # 1. FIX: Convert input list to STRINGS because your DB column is String(225)
    target_ids = [str(bid) for bid in booking_ids]
    
    # Ensure doctor_id is also a string to match the model definition
    doctor_id_str = str(doctor_id)

    # 2. Get all booking_ids that ALREADY exist for this doctor/branch/status
    # SQL: SELECT booking_id FROM ... WHERE booking_id IN ('20', '17', '16')
    existing_records = db.session.query(DoctorReportingdetails.booking_id).filter(
        DoctorReportingdetails.doctor_id == doctor_id_str,
        DoctorReportingdetails.branch_id == branch_id,
        DoctorReportingdetails.status == "Pending",
        DoctorReportingdetails.booking_id.in_(target_ids)
    ).all()

    # 3. Create a clean set of IDs that are already in the DB
    existing_ids = {row.booking_id for row in existing_records}

    assigned_count = 0
    
    # 4. Loop through requested IDs and only add if NOT in existing_ids set
    for booking_id in target_ids:
        if booking_id not in existing_ids:
            new_record = DoctorReportingdetails(
                booking_id=booking_id,
                doctor_id=doctor_id_str,
                branch_id=branch_id,
                assign_by=assigned_by,
                status="Pending"
            )
            db.session.add(new_record)
            assigned_count += 1

    # 5. Commit only if we actually added something
    if assigned_count > 0:
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f"Error committing to DB: {e}")
            raise e

    return assigned_count



def get_doctor_bookings(doctor_id):
    doctor_id_str = str(doctor_id)

    # 1. Fetch the main list
    records = (
        db.session.query(
            DoctorReportingdetails,
            TestBooking,
            User
        )
        .join(TestBooking, TestBooking.id == cast(DoctorReportingdetails.booking_id, Integer))
        .join(User, User.id == DoctorReportingdetails.assign_by)
        .filter(DoctorReportingdetails.doctor_id == doctor_id_str,DoctorReportingdetails.status == "Pending")
        .all()
    )

    if not records:
        return []

    # 2. Extract all Booking IDs to fetch tests in ONE go
    # Convert to int for the query
    booking_ids = [int(r[0].booking_id) for r in records] 

    # 3. Fetch all tests for these bookings in a single query
    test_data = (
        db.session.query(
            TestBookingDetails.booking_id, 
            Test_registration.test_name
        )
        .join(Test_registration, Test_registration.id == TestBookingDetails.test_id)
        .filter(TestBookingDetails.booking_id.in_(booking_ids))
        .all()
    )

    # 4. Organize tests into a dictionary: { booking_id: [test1, test2] }
    tests_map = {}
    for bid, t_name in test_data:
        if bid not in tests_map:
            tests_map[bid] = []
        tests_map[bid].append(t_name)

    # 5. Build final result
    result = []
    for dr_detail, booking, user in records:
        # Get tests from our map using the ID
        b_id_int = int(dr_detail.booking_id)
        
        result.append({
            "booking_id": dr_detail.booking_id,
            "status": dr_detail.status,
            "assigned_by": user.name,
            "assigned_at": dr_detail.report_at.strftime("%Y-%m-%d %H:%M:%S") if dr_detail.report_at else None,
            "technician_comments": booking.technician_comments,
            "tests": tests_map.get(b_id_int, []) # Default to empty list if no tests
        })

    return result

def validate_required(data, fields):
    missing = [f for f in fields if not data.get(f)]
    if missing:
        raise BadRequest(f"Missing required fields: {', '.join(missing)}")

def save_doctor_report(data, user_id):

    # Required fields
    validate_required(data, [
        "booking_id", "doctor_id",
        "patient_name", "gender",
        "age", "test_id"
    ])

    booking_id = data["booking_id"]
    doctor_id = data["doctor_id"]

    # Find active doctor reporting record
    dr_details = DoctorReportingdetails.query.filter(
        DoctorReportingdetails.booking_id == booking_id,
        DoctorReportingdetails.doctor_id == doctor_id,
        DoctorReportingdetails.is_active.is_(True)
    ).first()

    if not dr_details:
        raise NotFound("No active doctor reporting record found.")

    now = datetime.utcnow()

    # Create report with updated fields
    report = DoctorReportData(
        patient_name=data["patient_name"],
        gender=data["gender"],
        age=data["age"],
        referred_doctor=data.get("referred_doctor"),
        test_id=data["test_id"],
        booking_id=booking_id,
        clinical_info=data.get("clinical_info"),
        scanning_protocols=data.get("scanning_protocols"),
        findings=data.get("findings"),
        conclusion=data.get("conclusion"),
        created_by=user_id,
        updated_by=user_id,
        created_at=now,
        updated_at=now
    )

    db.session.add(report)
    db.session.flush()  # get report.id before commit

    # Update reporting details
    dr_details.status = "Reported"
    dr_details.report_details_id = report.id
    dr_details.report_at = now
    dr_details.assign_by = user_id

    db.session.commit()

    return {
        "message": "Report saved successfully.",
        "report_id": report.id
    }


# ---------------------------------------------------------
#   UPDATE REPORT (Updated for new fields)
# ---------------------------------------------------------
def update_doctor_report(report_id, data, user_id):

    # Fetch existing report
    report = DoctorReportData.query.get(report_id)
    if not report:
        raise NotFound("Report not found.")

    # Allowed fields for update (updated list)
    update_fields = {
        "patient_name",
        "gender",
        "age",
        "referred_doctor",
        "test_id",
        "clinical_info",
        "scanning_protocols",
        "findings",
        "conclusion"
    }

    # Apply provided fields
    for field in update_fields:
        if field in data:
            setattr(report, field, data[field])

    now = datetime.utcnow()
    report.updated_by = user_id
    report.updated_at = now

    # Update timestamp on doctor reporting details
    dr_details = DoctorReportingdetails.query.filter_by(
        report_details_id=report_id
    ).first()

    if dr_details:
        dr_details.report_at = now

    db.session.commit()

    return {
        "message": "Report updated successfully.",
        "report_id": report_id
    }