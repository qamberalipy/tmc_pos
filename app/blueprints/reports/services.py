from flask import session
from sqlalchemy import func, cast, Date, desc, Integer, and_
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

def assign_bookings_to_doctor(bookings_payload, doctor_id, assigned_by, branch_id):
  
    doctor_id_str = str(doctor_id)
    target_booking_ids = [str(item['booking_id']) for item in bookings_payload]
    existing_records = db.session.query(
        DoctorReportingdetails.booking_id, 
        DoctorReportingdetails.test_id
    ).filter(
        DoctorReportingdetails.doctor_id == doctor_id_str,
        DoctorReportingdetails.branch_id == branch_id,
        DoctorReportingdetails.status == "Pending",
        DoctorReportingdetails.booking_id.in_(target_booking_ids)
    ).all()

    # 3. Create a set of (booking_id, test_id) tuples for fast lookup
    # e.g., {('13', 2), ('13', 5), ('14', 23)}
    existing_combinations = {(row.booking_id, row.test_id) for row in existing_records}

    assigned_count = 0

    # 4. Nested Loop: Booking -> Test IDs
    for item in bookings_payload:
        b_id = str(item['booking_id'])
        t_ids = item.get('test_ids', []) # Get list, default to empty

        for t_id in t_ids:
            # Ensure t_id is an integer
            t_id_int = int(t_id)

            # Check if this specific Booking+Test combination exists
            if (b_id, t_id_int) not in existing_combinations:
                new_record = DoctorReportingdetails(
                    booking_id=b_id,
                    test_id=t_id_int,  # Saving the specific Test ID
                    doctor_id=doctor_id_str,
                    branch_id=branch_id,
                    assign_by=assigned_by,
                    status="Pending"
                )
                db.session.add(new_record)
                assigned_count += 1
                
                # Update our local set so we don't add the same one twice in this loop
                existing_combinations.add((b_id, t_id_int))

    # 5. Commit
    if assigned_count > 0:
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f"Error committing to DB: {e}")
            raise e

    return assigned_count

from sqlalchemy import cast, Integer

def get_doctor_pending_bookings(doctor_id):
    doctor_id_str = str(doctor_id)
    results = (
        db.session.query(
            DoctorReportingdetails,
            TestBooking,
            User,
            Test_registration.test_name  # Select the specific test name
        )
        .join(TestBooking, TestBooking.id == cast(DoctorReportingdetails.booking_id, Integer))
        .join(User, User.id == DoctorReportingdetails.assign_by)
        .join(Test_registration, Test_registration.id == DoctorReportingdetails.test_id) # Direct Link
        .filter(
            DoctorReportingdetails.doctor_id == doctor_id_str,
            DoctorReportingdetails.status == "Pending"
        )
        .order_by(DoctorReportingdetails.report_at.desc())
        .all()
    )

    output = []
    
    # Unpack the 4 items returned by the query
    for dr_detail, booking, user, test_name in results:
        output.append({
            "reporting_id": dr_detail.id,
            "booking_id": dr_detail.booking_id,
            "status": dr_detail.status,
            "assigned_by": user.name,
            "assigned_at": dr_detail.report_at.strftime("%Y-%m-%d %H:%M:%S") if dr_detail.report_at else None,
            "patient_name": booking.patient_name, # Added this (usually very helpful for doctors)
            "technician_comments": booking.technician_comments,
            "test_name": test_name, # The specific name for this assigned row
            "test_id": dr_detail.test_id
        })

    return output

def get_doctor_reported_bookings(doctor_id):
    doctor_id_str = str(doctor_id)

    records = (
        db.session.query(DoctorReportData,DoctorReportingdetails,Test_registration,User)
        .join(DoctorReportingdetails,DoctorReportingdetails.report_details_id == DoctorReportData.id)
        .join(Test_registration, Test_registration.id == cast(DoctorReportData.test_id, Integer))
        .join(User,User.id == DoctorReportingdetails.assign_by)
        .filter(DoctorReportingdetails.doctor_id == doctor_id_str,DoctorReportingdetails.status == "Reported",DoctorReportingdetails.is_active.is_(True))
        .all()
    )

    result = []

    for report, details, test, user in records:

        result.append({
            "booking_id": details.booking_id,
            "status": details.status,
            "report_details_id": details.report_details_id,

            "patient_name": report.patient_name,
            "gender": report.gender,
            "age": report.age,

            "assigned_by": user.name if hasattr(user, "name") else None,
            "assigned_at": details.report_at.strftime("%Y-%m-%d %H:%M:%S") if details.report_at else None,
            "reported_at": report.created_at.strftime("%Y-%m-%d %H:%M:%S") if report.created_at else None,

            "tests": {
                "test_id": test.id,
                "test_name": test.test_name
            }
        })

    return result

def decline_doctor_assignment(reporting_id, doctor_id):
    try:
        doctor_id_str = str(doctor_id)
        
        # 1. Find the specific assignment record
        record = DoctorReportingdetails.query.filter_by(
            id=reporting_id, 
            doctor_id=doctor_id_str,
            status="Pending"
        ).first()

        if not record:
            return False

        # 2. Update status
        record.status = "Declined"
        
        # 3. Commit
        db.session.commit()
        return True

    except Exception as e:
        db.session.rollback()
        raise e

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


def get_doctor_report_by_id(report_id):
    report = (
        db.session.query(
            DoctorReportData,
            Test_registration.test_name,
            DoctorReportingdetails.report_at,
            User  # <--- 1. Select the User model to access signature
        )
        .join(Test_registration, Test_registration.id == DoctorReportData.test_id)
        .join(
            DoctorReportingdetails,
            and_(
                DoctorReportingdetails.report_details_id == DoctorReportData.id,
                DoctorReportingdetails.is_active.is_(True)
            )
        )
        # 2. Join User table: Cast the string doctor_id to Integer to match User.id
        .join(User, User.id == cast(DoctorReportingdetails.doctor_id, Integer)) 
        .filter(DoctorReportData.id == report_id)
        .first()
    )

    if not report:
        raise NotFound("Report not found.")

    # 3. Unpack the results (now includes doctor_user)
    report_obj, test_name, assigned_at, doctor_user = report

    return {
        "id": report_obj.id,
        "patient_name": report_obj.patient_name,
        "gender": report_obj.gender,
        "age": report_obj.age,
        "referred_doctor": report_obj.referred_doctor,

        "test_id": report_obj.test_id,
        "test_name": test_name,

        "booking_id": report_obj.booking_id,
        "clinical_info": report_obj.clinical_info,
        "scanning_protocols": report_obj.scanning_protocols,
        "findings": report_obj.findings,
        "conclusion": report_obj.conclusion,

        # Tracking fields
        "assigned_at": assigned_at.strftime("%Y-%m-%d %H:%M:%S") if assigned_at else None,
        "reported_at": report_obj.created_at.strftime("%Y-%m-%d %H:%M:%S") if report_obj.created_at else None,

        "created_by": report_obj.created_by,
        "updated_by": report_obj.updated_by,
        "created_at": report_obj.created_at.strftime("%Y-%m-%d %H:%M:%S") if report_obj.created_at else None,
        "updated_at": report_obj.updated_at.strftime("%Y-%m-%d %H:%M:%S") if report_obj.updated_at else None,
        "doctor_signature": doctor_user.signature_data 
    }


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