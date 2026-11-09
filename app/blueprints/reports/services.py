from flask import session
from sqlalchemy import func, cast, Date, desc, Integer, and_, String, or_
from app.extensions import db
from app.models import TestBookingDetails
from decimal import Decimal
from datetime import datetime, date, time, timezone, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import aliased
from app.models.test_booking import TestFilmUsage, TestBooking, FilmInventoryTransaction, BookingTransferLog
from app.models.test_registration import Test_registration, CATEGORY_CHOICES
from app.models.doctor_reporting_details import DoctorReportingdetails, DoctorReportData
from app.models.user import User
from app.models.role import Role
from app.models.shift import ShiftSession
from app.models.expenses import Expenses
from app.models.branch import Branch
from collections import defaultdict
from app.models.expense_head import Expense_head
from app.helper import get_lab_date_bounds
from app.models.referred import Referred
from werkzeug.exceptions import BadRequest, NotFound
from app.models.expenses import PaymentTransaction
from app.models.doctor_category_rate import DoctorCategoryRate
from app.utils.timezone import to_local

def _to_float(value):
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except Exception:
        return 0.0

def get_expenses_report(branch_id: int, start_utc, end_utc, shift_ranges=None, user_id=None):
    try:
        q = (
            db.session.query(
                Expenses.expense_head_id.label("head_id"),
                Expense_head.name.label("head_name"),
                func.sum(Expenses.amount).label("total_amount")
            )
            .join(Expense_head, Expenses.expense_head_id == Expense_head.id)
            .filter(
                Expenses.branch_id == branch_id,
                Expenses.is_deleted == False
            )
        )

        if shift_ranges:
            shift_conditions = [and_(Expenses.created_at >= s, Expenses.created_at <= e) for s, e in shift_ranges]
            q = q.filter(or_(*shift_conditions))
            if user_id:
                q = q.filter(Expenses.created_by == user_id)
        else:
            q = q.filter(Expenses.created_at >= start_utc, Expenses.created_at <= end_utc)

        rows = q.group_by(Expenses.expense_head_id, Expense_head.name).all()

        return [
            {
                "head_id": r.head_id,
                "head_name": r.head_name,
                "total_amount": _to_float(r.total_amount)
            }
            for r in rows
        ]
    except SQLAlchemyError as e:
        raise e


def get_daily_films_report(branch_id: int, start_utc, end_utc, shift_ranges=None, user_id=None):
    try:
        # 1. Opening Stock (Before bounds)
        period_start = min([r[0] for r in shift_ranges]) if shift_ranges else start_utc
        
        before_query = (
            db.session.query(
                FilmInventoryTransaction.transaction_type,
                func.sum(FilmInventoryTransaction.quantity)
            )
            .filter(FilmInventoryTransaction.transaction_date < period_start)
            .filter(FilmInventoryTransaction.branch_id == branch_id)
            .group_by(FilmInventoryTransaction.transaction_type)
        )
        before_data = before_query.all()
        total_in_before = sum(q for t, q in before_data if t == "IN") or 0
        total_out_before = sum(q for t, q in before_data if t == "OUT") or 0
        film_start = total_in_before - total_out_before

        # 2. Today's Activity queries
        day_query = db.session.query(
            FilmInventoryTransaction.transaction_type,
            func.sum(FilmInventoryTransaction.quantity)
        ).filter(FilmInventoryTransaction.branch_id == branch_id)

        user_usage_query = db.session.query(func.sum(FilmInventoryTransaction.quantity)).filter(
            FilmInventoryTransaction.branch_id == branch_id,
            FilmInventoryTransaction.transaction_type == "OUT"
        )

        # Apply Time Bounds
        if shift_ranges:
            shift_conditions = [and_(FilmInventoryTransaction.transaction_date >= s, FilmInventoryTransaction.transaction_date <= e) for s, e in shift_ranges]
            day_query = day_query.filter(or_(*shift_conditions))
            user_usage_query = user_usage_query.filter(or_(*shift_conditions))
            if user_id:
                user_usage_query = user_usage_query.filter(FilmInventoryTransaction.handled_by == user_id)
        else:
            day_query = day_query.filter(FilmInventoryTransaction.transaction_date >= start_utc, FilmInventoryTransaction.transaction_date <= end_utc)
            user_usage_query = user_usage_query.filter(FilmInventoryTransaction.transaction_date >= start_utc, FilmInventoryTransaction.transaction_date <= end_utc)

        # Get results
        day_data_branch = day_query.group_by(FilmInventoryTransaction.transaction_type).all()
        in_today_branch = sum(q for t, q in day_data_branch if t == "IN") or 0
        out_today_branch = sum(q for t, q in day_data_branch if t == "OUT") or 0
        
        film_closing = film_start + in_today_branch - out_today_branch

        # User Usage Display
        displayed_usage = out_today_branch
        if user_id and shift_ranges:
            user_usage = user_usage_query.scalar() or 0
            displayed_usage = user_usage

        return {
            "film_start": int(film_start),
            "film_closing": int(film_closing),
            "film_use": int(displayed_usage),
            "film_added": int(in_today_branch) 
        }

    except Exception as e:
        print(f"Error in films report: {str(e)}")
        raise e
    

def get_daily_test_report(branch_id, start_utc, end_utc, shift_ranges=None, user_id=None, filters=None):
    try:
        query = (
            db.session.query(
                Test_registration.test_name,
                func.count(TestBookingDetails.id).label("total_count"),
                func.sum(TestBookingDetails.amount).label("total_amount")
            )
            .join(TestBooking, TestBookingDetails.booking_id == TestBooking.id)
            .join(Test_registration, TestBookingDetails.test_id == Test_registration.id)
            .filter(TestBooking.branch_id == branch_id)
        )

        if filters and filters.get('category'):
            query = query.filter(Test_registration.category == filters['category'])

        if shift_ranges:
            shift_conditions = [and_(TestBooking.create_at >= s, TestBooking.create_at <= e) for s, e in shift_ranges]
            query = query.filter(or_(*shift_conditions))
            if user_id:
                query = query.filter(TestBooking.create_by == user_id)
        else:
            query = query.filter(TestBooking.create_at >= start_utc, TestBooking.create_at <= end_utc)

        rows = query.group_by(Test_registration.test_name).all()

        return [
            {
                "test_name": r.test_name,
                "count": r.total_count,
                "amount": _to_float(r.total_amount)
            }
            for r in rows
        ]
    except Exception as e:
        print(f"Error in daily test report: {str(e)}")
        raise e


def get_daily_summary(branch_id, start_utc, end_utc, shift_ranges=None, user_id=None):
    try:
        # 1. Update query to group by BOTH direction and transaction_type
        query = db.session.query(
            PaymentTransaction.direction,
            PaymentTransaction.transaction_type,
            func.sum(PaymentTransaction.amount).label("total")
        ).filter(PaymentTransaction.branch_id == branch_id)

        if shift_ranges:
            shift_conditions = [and_(PaymentTransaction.payment_date >= s, PaymentTransaction.payment_date <= e) for s, e in shift_ranges]
            query = query.filter(or_(*shift_conditions))
            if user_id:
                query = query.filter(PaymentTransaction.created_by == user_id)
        else:
            query = query.filter(PaymentTransaction.payment_date >= start_utc, PaymentTransaction.payment_date <= end_utc)

        results = query.group_by(PaymentTransaction.direction, PaymentTransaction.transaction_type).all()
        
        # 2. Add new granular keys for the frontend
        summary = {
            "regular_income": 0.0,          # Money from native tests & dues
            "transferred_held_cash": 0.0,   # Money kept from Transferred-Out cases
            "total_income": 0.0,            # Combined Total IN cash
            "total_expense": 0.0,           # Combined Total OUT cash
            "net_cash": 0.0                 # Exact Physical Drawer Balance
        }

        # 3. Safely map the cash buckets
        for direction, trans_type, total in results:
            val = _to_float(total)
            if direction == 'IN':
                if trans_type == 'TransferOut_Held':
                    summary["transferred_held_cash"] += val
                else:
                    summary["regular_income"] += val
                    
                summary["total_income"] += val
            elif direction == 'OUT':
                summary["total_expense"] += val
                
        summary["net_cash"] = summary["total_income"] - summary["total_expense"]
        
        return summary
    except Exception as e:
        print(f"Error in daily summary: {str(e)}")
        raise e


def get_due_clearance_report(branch_id, start_utc, end_utc, shift_ranges=None, user_id=None):
    try:
        query = (
            db.session.query(
                PaymentTransaction.amount,
                PaymentTransaction.payment_type,
                PaymentTransaction.payment_date,  
                TestBooking.patient_name,
                TestBooking.mr_no,
                User.name.label("collected_by")
            )
            .join(TestBooking, PaymentTransaction.booking_id == TestBooking.id)
            .join(User, PaymentTransaction.created_by == User.id)
            .filter(
                PaymentTransaction.branch_id == branch_id,
                PaymentTransaction.transaction_type == 'DueClearance'
            )
        )

        if shift_ranges:
            shift_conditions = [and_(PaymentTransaction.payment_date >= s, PaymentTransaction.payment_date <= e) for s, e in shift_ranges]
            query = query.filter(or_(*shift_conditions))
            if user_id:
                query = query.filter(PaymentTransaction.created_by == user_id)
        else:
            query = query.filter(PaymentTransaction.payment_date >= start_utc, PaymentTransaction.payment_date <= end_utc)

        # Get user's local timezone for display mapping (assuming frontend wants to see PKT format on receipt display)
        # Note: Frontend handles UTC to Local mapping best, but we'll leave strftime formatted here
        rows = query.all()

        return [
            {
                "patient_name": r.patient_name,
                "mr_no": r.mr_no,
                "amount": _to_float(r.amount),
                "type": r.payment_type,
                "time": to_local(r.payment_date, "%Y-%m-%d %I:%M %p"),
                "collected_by": r.collected_by
            }
            for r in rows
        ]
    except Exception as e:
        print(f"Error in due clearance report: {str(e)}")
        raise e
  
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
    newly_assigned_pairs = []

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
                newly_assigned_pairs.append((b_id, t_id_int))
                
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

    return assigned_count, newly_assigned_pairs

def get_doctor_assigned_reports_service(branch_id=None, status=None, from_date=None, to_date=None):
    try:
        # --- 1. NEW LOGIC: Use Shift Bounds ---
        start_utc = None
        end_utc = None

        if from_date and to_date:
            # Use the helper function to get precise UTC bounds for the 8 AM - 4 AM shift
            start_utc, end_utc = get_lab_date_bounds(from_date, to_date, branch_id)
        elif from_date or to_date:
            return {"status": "error", "message": "Both from_date and to_date are required for date filtering."}

        # --- 2. Setup Aliases ---
        DoctorUser = aliased(User)   # Alias for "Assign To"
        AssignerUser = aliased(User) # Alias for "Assign By"

        # --- 3. Build Base Query ---
        query = db.session.query(
            DoctorReportingdetails.booking_id,
            DoctorReportingdetails.test_id,
            Test_registration.test_name.label("test_name"),
            DoctorReportingdetails.status,
            DoctorUser.name.label("doctor_name"),    
            AssignerUser.name.label("assign_by"),    
            DoctorReportingdetails.report_at.label("assigned_at"),
            DoctorReportingdetails.report_details_id,
            DoctorReportingdetails.id.label("reported_id"),
            
            # Patient Details
            TestBooking.due_amount.label("booking_balance"),
            TestBooking.patient_name,
            TestBooking.age,
            TestBooking.gender,
            TestBooking.contact_no
        ).join(
            Test_registration, DoctorReportingdetails.test_id == Test_registration.id
        ).join(
            TestBooking, TestBooking.id == cast(DoctorReportingdetails.booking_id, Integer)
        ).join(
            DoctorUser, cast(DoctorReportingdetails.doctor_id, Integer) == DoctorUser.id
        ).outerjoin(
            AssignerUser, DoctorReportingdetails.assign_by == AssignerUser.id
        )

        # --- 4. Filters ---
        if branch_id:
            query = query.filter(DoctorReportingdetails.branch_id == branch_id)

        if status:
            if isinstance(status, (list, tuple)):
                query = query.filter(DoctorReportingdetails.status.in_(status))
            else:
                query = query.filter(DoctorReportingdetails.status == status)

        # --- APPLY UTC BOUNDS HERE ---
        if start_utc and end_utc:
            # Note: Verify if your model uses report_at or created_at. I'm using report_at based on your previous code.
            query = query.filter(DoctorReportingdetails.report_at.between(start_utc, end_utc))

        # --- 5. Execute ---
        results = query.order_by(DoctorReportingdetails.report_at.desc()).all()

        response_data = []
        for row in results:
            response_data.append({
                "booking_id": row.booking_id,
                "test_id": row.test_id,
                "test_name": row.test_name,
                "status": row.status,
                "assign_to": row.doctor_name,
                "assign_by": row.assign_by if row.assign_by else "System",
                "assigned_at": to_local(row.assigned_at, '%Y-%m-%d %I:%M %p') if row.assigned_at else None,
                "report_details_id": row.report_details_id,
                "id": row.reported_id,
                
                # Pass Data to Frontend
                "balance": float(row.booking_balance or 0),
                "patient_name": row.patient_name,
                "age": row.age,
                "gender": row.gender,
                "contact_no": row.contact_no
            })

        return response_data, 200

    except Exception as e:
        print(f"Error fetching assigned reports: {str(e)}")
        return {
            "status": "error",
            "message": str(e)
        }
# --- NEW FUNCTION TO DELETE ASSIGNMENT ---
def delete_doctor_assignment(assignment_id):
    try:
        record = DoctorReportingdetails.query.get(assignment_id)
        if not record:
            return {"error": "Assignment not found"}, 404
        
        # Optional: Prevent deleting if already reported (Uncomment if needed)
        # if record.status == 'Reported':
        #     return {"error": "Cannot delete a reported assignment"}, 400

        db.session.delete(record)
        db.session.commit()
        return {"message": "Assignment request deleted successfully"}, 200
    except Exception as e:
        db.session.rollback()
        return {"error": str(e)}, 500    
def get_doctor_pending_bookings(doctor_id):
    doctor_id_str = str(doctor_id)
    results = (
        db.session.query(
            DoctorReportingdetails,
            TestBooking,
            User,
            Test_registration.test_name,  # Select the specific test name
            Referred.name.label("referred_by")
        )
        .join(TestBooking, TestBooking.id == cast(DoctorReportingdetails.booking_id, Integer))
        .join(User, User.id == DoctorReportingdetails.assign_by)
        .join(Test_registration, Test_registration.id == DoctorReportingdetails.test_id) # Direct Link
        .outerjoin(Referred, and_(Referred.id == TestBooking.referred_dr, Referred.is_doctor == True))
        .filter(
            DoctorReportingdetails.doctor_id == doctor_id_str,
            DoctorReportingdetails.status == "Pending"
        )
        .order_by(DoctorReportingdetails.report_at.desc())
        .all()
    )

    output = []
    
    # Unpack the 5 items returned by the query
    for dr_detail, booking, user, test_name, referred_by in results:
        output.append({
            "reporting_id": dr_detail.id,
            "booking_id": dr_detail.booking_id,
            "status": dr_detail.status,
            "assigned_by": user.name,
            "assigned_at": to_local(dr_detail.report_at, "%Y-%m-%d %H:%M:%S") if dr_detail.report_at else None,
            "patient_name": booking.patient_name,
            "mr_no": booking.mr_no,
            "age": booking.age,
            "age_unit": booking.age_unit or "Years",
            "gender": booking.gender,
            "technician_comments": booking.technician_comments,
            "test_name": test_name, # The specific name for this assigned row
            "test_id": dr_detail.test_id,
            "referred_by": referred_by or "Self"
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
            "age_unit": "Years",  # DoctorReportData doesn't store age_unit; default safe

            "assigned_by": user.name if hasattr(user, "name") else None,
            "assigned_at": to_local(details.report_at, "%Y-%m-%d %H:%M:%S") if details.report_at else None,
            "reported_at": to_local(report.created_at, "%Y-%m-%d %H:%M:%S") if report.created_at else None,

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

# ... (imports)

# 1. Update save_doctor_report
def save_doctor_report(data, user_id):

    # Required fields
    validate_required(data, [
        "booking_id", "doctor_id",
        "patient_name", "gender",
        "age", "test_id"
    ])

    booking_id = data["booking_id"]
    doctor_id = data["doctor_id"]

    dr_details = DoctorReportingdetails.query.filter(
        DoctorReportingdetails.booking_id == booking_id,
        DoctorReportingdetails.doctor_id == doctor_id,
        DoctorReportingdetails.is_active.is_(True)
    ).first()

    if not dr_details:
        raise NotFound("No active doctor reporting record found.")

    now = datetime.now(timezone.utc)

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
        incidental_findings=data.get("incidental_findings"), # <--- NEW
        conclusion=data.get("conclusion"),
        created_by=user_id,
        updated_by=user_id,
        created_at=now,
        updated_at=now
    )

    db.session.add(report)
    db.session.flush()

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

# 2. Update get_doctor_report_by_id
def get_doctor_report_by_id(report_id):
    # ... (Keep the query logic the same) ...
    report = (
        db.session.query(DoctorReportData, Test_registration.test_name, DoctorReportingdetails.report_at, User)
        .join(Test_registration, Test_registration.id == DoctorReportData.test_id)
        .join(DoctorReportingdetails, and_(DoctorReportingdetails.report_details_id == DoctorReportData.id, DoctorReportingdetails.is_active.is_(True)))
        .join(User, User.id == cast(DoctorReportingdetails.doctor_id, Integer)) 
        .filter(DoctorReportData.id == report_id)
        .first()
    )

    if not report:
        raise NotFound("Report not found.")

    # Unpack the results
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
        
        # Text fields
        "clinical_info": report_obj.clinical_info,
        "scanning_protocols": report_obj.scanning_protocols,
        "findings": report_obj.findings,
        "incidental_findings": report_obj.incidental_findings, 
        "conclusion": report_obj.conclusion,

        # --- ADD THESE 4 NEW LINES FOR FILE SUPPORT ---
        "report_file_url": getattr(report_obj, 'report_file_url', None),
        "report_file_name": getattr(report_obj, 'report_file_name', None),
        "file_mime_type": getattr(report_obj, 'file_mime_type', None),
        "file_size_bytes": getattr(report_obj, 'file_size_bytes', None),
        # ----------------------------------------------

        # Tracking fields
        "assigned_at": to_local(assigned_at, "%Y-%m-%d %H:%M:%S") if assigned_at else None,
        "reported_at": to_local(report_obj.created_at, "%Y-%m-%d %H:%M:%S") if report_obj.created_at else None,

        "created_by": report_obj.created_by,
        "updated_by": report_obj.updated_by,
        "created_at": to_local(report_obj.created_at, "%Y-%m-%d %H:%M:%S") if report_obj.created_at else None,
        "updated_at": to_local(report_obj.updated_at, "%Y-%m-%d %H:%M:%S") if report_obj.updated_at else None,
        "doctor_signature": doctor_user.signature_data if hasattr(doctor_user, 'signature_data') else None
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
        "incidental_findings",  # <--- Add this comma
        "conclusion"
    }

    # Apply provided fields
    for field in update_fields:
        if field in data:
            setattr(report, field, data[field])

    now = datetime.now(timezone.utc)
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

def get_radiologist_performance_data(doctor_id, start_date_str=None, end_date_str=None):
    from_date = datetime.strptime(start_date_str, "%Y-%m-%d")
    to_date = datetime.strptime(end_date_str, "%Y-%m-%d").replace(hour=23, minute=59, second=59)

    query = db.session.query(
        func.date(DoctorReportingdetails.report_at).label('report_date'),
        User.name.label('radiologist_name'),
        Test_registration.category,
        DoctorReportingdetails.status,
        TestBookingDetails.no_of_films,
        # Per-radiologist, per-category rate from DoctorCategoryRate
        db.session.query(DoctorCategoryRate.rate)
            .filter(
                DoctorCategoryRate.doctor_id == cast(DoctorReportingdetails.doctor_id, Integer),
                DoctorCategoryRate.category == Test_registration.category
            )
            .correlate(DoctorReportingdetails, Test_registration)
            .scalar_subquery()
            .label("report_charges")
    ).select_from(DoctorReportingdetails)\
    .join(User, cast(User.id, String) == DoctorReportingdetails.doctor_id)\
    .join(Test_registration, Test_registration.id == DoctorReportingdetails.test_id)\
    .outerjoin(TestBookingDetails, 
        (cast(TestBookingDetails.booking_id, String) == DoctorReportingdetails.booking_id) & 
        (TestBookingDetails.test_id == DoctorReportingdetails.test_id)
    ).filter(
        DoctorReportingdetails.doctor_id == str(doctor_id), 
        DoctorReportingdetails.report_at >= from_date,
        DoctorReportingdetails.report_at <= to_date
    )

    results = query.all()

    # --- Python Data Aggregation (Pivot Logic) ---
    grouped_data = {}

    for row in results:
        date_str = str(row.report_date)
        doctor = row.radiologist_name
        category = row.category if row.category in CATEGORY_CHOICES else "Other"

        key = (date_str, doctor)

        if key not in grouped_data:
            grouped_data[key] = {
                "date": date_str,
                "radiologist_name": doctor,
                "tests_counts": {"Contrast": 0, "Full Study": 0, "Screening": 0, "Other": 0},
                "total_tests": 0,
                "reports_made": 0,
                "films_issued": 0,
                "total_revenue": 0.0,
                "rate_missing": False
            }

        # Count the category
        grouped_data[key]["tests_counts"][category] += 1
        grouped_data[key]["total_tests"] += 1

        if row.status == "Reported":
            grouped_data[key]["reports_made"] += 1
            if row.report_charges is None:
                # Rate row absent in DoctorCategoryRate — flag for frontend warning
                grouped_data[key]["rate_missing"] = True
            else:
                # Charge accrues only for completed reports, at that report's category rate
                grouped_data[key]["total_revenue"] += float(row.report_charges)

        if row.no_of_films:
            grouped_data[key]["films_issued"] += row.no_of_films

    final_report = []
    sorted_keys = sorted(grouped_data.keys(), key=lambda x: x[0])

    for index, key in enumerate(sorted_keys, 1):
        data = grouped_data[key]
        
        # Create a breakdown string with prices if needed, or just counts
        # Current logic just sends counts: {"MRI": 2, "CT": 1}
        
        final_report.append({
            "s_no": index,
            "date": data["date"],
            "radiologist_name": data["radiologist_name"],
            "test_breakdown": dict(data["tests_counts"]),
            "total_tests": data["total_tests"],
            "reports_made": data["reports_made"],
            "films_issued": data["films_issued"],
            "report_charges": round(data["total_revenue"], 2),
            "rate_missing": data["rate_missing"]
        })

    return final_report

def save_doctor_report(data, user_id):
    """Creates a new report record using the file URL generated by the uploads module."""
    
    # 1. Validate required fields (now including the file URL from the frontend)
    required_fields = ["booking_id", "doctor_id", "patient_name", "gender", "age", "test_id", "report_file_url", "report_file_name"]
    missing = [f for f in required_fields if not data.get(f)]
    if missing:
        raise BadRequest(f"Missing required fields: {', '.join(missing)}")

    booking_id = data["booking_id"]
    doctor_id = data["doctor_id"]

    # 2. Verify Assignment
    dr_details = DoctorReportingdetails.query.filter(
        DoctorReportingdetails.booking_id == booking_id,
        DoctorReportingdetails.doctor_id == str(doctor_id),
        DoctorReportingdetails.is_active.is_(True),
        DoctorReportingdetails.status == "Pending"
    ).first()

    if not dr_details:
        raise NotFound("No active pending assignment found for this booking and doctor.")
    
    now = datetime.now(timezone.utc)

    # 3. Save Report Data
    report = DoctorReportData(
        patient_name=data["patient_name"],
        gender=data["gender"],
        age=int(data["age"]),
        referred_doctor=data.get("referred_doctor"),
        test_id=int(data["test_id"]),
        booking_id=str(booking_id),
        
        # Cloud Media Fields (Provided by frontend after upload module finishes)
        report_file_url=data["report_file_url"],
        report_file_name=data["report_file_name"],
        file_mime_type=data.get("file_mime_type"),
        file_size_bytes=data.get("file_size_bytes"),
        
        # Text fields
        clinical_info=data.get("clinical_info"),
        findings=data.get("findings"),
        conclusion=data.get("conclusion"),
        
        created_by=user_id,
        updated_by=user_id,
        created_at=now,
        updated_at=now
    )

    db.session.add(report)
    db.session.flush() # Get report.id

    # 4. Update Assignment Status
    dr_details.status = "Reported"
    dr_details.report_details_id = report.id
    dr_details.report_at = now
    dr_details.assign_by = user_id

    db.session.commit()

    return {
        "message": "Report saved successfully.",
        "report_id": report.id,
        "file_url": report.report_file_url
    }

def update_doctor_report(report_id, data, user_id):
    """Updates report metadata or replaces the file URL."""
    report = DoctorReportData.query.get(report_id)
    if not report:
        raise NotFound("Report not found.")

    # Update any provided fields (including file URL if they uploaded a new one)
    updateable_fields = {
        "patient_name", "gender", "age", "referred_doctor", 
        "clinical_info", "findings", "conclusion",
        "report_file_url", "report_file_name", "file_mime_type", "file_size_bytes"
    }
    
    for field in updateable_fields:
        if field in data:
            setattr(report, field, data[field])

    now = datetime.now(timezone.utc)
    report.updated_by = user_id
    report.updated_at = now

    db.session.commit()

    return {"message": "Report updated successfully.", "report_id": report_id}


# ---------------------------------------------------------------------------
# Monthly Commission Sheet
# ---------------------------------------------------------------------------
def get_monthly_commission_sheet(branch_id, month_str):
    """
    Return commission-sheet rows for a given branch and calendar month.

    Parameters
    ----------
    branch_id : int
    month_str : str  – "YYYY-MM"  (e.g. "2026-07")

    Returns
    -------
    (list[dict], int)  –  (rows, http_status_code)

    Row keys
    --------
    s_no, date, patient_name, ref_by_dr, investigations,
    charges, grand_total, cut_incentive
    """
    try:
        # ── 1. Parse month boundaries ─────────────────────────────────────
        try:
            month_start = datetime.strptime(month_str, "%Y-%m")
        except (ValueError, TypeError):
            return {"error": "Invalid month format. Use YYYY-MM."}, 400

        # Calendar-month end: first second of the *next* month, exclusive
        if month_start.month == 12:
            month_end = month_start.replace(year=month_start.year + 1, month=1, day=1)
        else:
            month_end = month_start.replace(month=month_start.month + 1, day=1)

        # ── 2. Alias Referred twice: once for referred_dr, once for referred_non_dr ──
        ReferredDr    = aliased(Referred)
        ReferredNonDr = aliased(Referred)

        from app.models.referred import ReferralShare  # local import to avoid circular deps

        # ── 3. Main query ─────────────────────────────────────────────────
        rows = (
            db.session.query(
                TestBooking,
                ReferredDr.name.label("ref_dr_name"),
                ReferredNonDr.name.label("ref_non_dr_name"),
                ReferralShare.share_amount.label("cut_incentive"),
            )
            .outerjoin(
                ReferredDr,
                and_(
                    TestBooking.referred_dr != None,       # noqa: E711
                    ReferredDr.id == TestBooking.referred_dr,
                )
            )
            .outerjoin(
                ReferredNonDr,
                and_(
                    TestBooking.referred_dr == None,       # noqa: E711
                    ReferredNonDr.id == TestBooking.referred_non_dr,
                )
            )
            .outerjoin(
                ReferralShare,
                ReferralShare.booking_id == TestBooking.id,
            )
            .filter(
                TestBooking.branch_id == int(branch_id),
                TestBooking.create_at >= month_start,
                TestBooking.create_at < month_end,
            )
            .order_by(TestBooking.create_at.asc())
            .all()
        )

        # ── 4. Build output rows ──────────────────────────────────────────
        data = []
        for idx, (booking, ref_dr_name, ref_non_dr_name, cut_incentive) in enumerate(rows, start=1):
            # 4a. Investigations: fetch test names via TestBookingDetails
            try:
                test_names = [
                    t[0]
                    for t in db.session.query(Test_registration.test_name)
                    .join(
                        TestBookingDetails,
                        Test_registration.id == TestBookingDetails.test_id,
                    )
                    .filter(TestBookingDetails.booking_id == booking.id)
                    .all()
                ]
            except Exception:
                test_names = []

            investigations = " / ".join(test_names) if test_names else ""

            # 4b. Referring doctor name: prefer referred_dr, fallback to referred_non_dr
            ref_by_dr = ref_dr_name or ref_non_dr_name or ""

            # 4c. Cut incentive: blank string when 0 or null
            if cut_incentive and float(cut_incentive) != 0:
                cut_incentive_val = float(cut_incentive)
            else:
                cut_incentive_val = ""

            net = _to_float(booking.net_receivable)

            data.append({
                "s_no":          idx,
                "date":          to_local(booking.create_at, "%d-%b-%Y")
                                 if booking.create_at else "",
                "patient_name":  booking.patient_name or "",
                "ref_by_dr":     ref_by_dr,
                "investigations": investigations,
                "charges":       net,
                "grand_total":   net,
                "cut_incentive": cut_incentive_val,
            })

        return data, 200

    except Exception as exc:
        print(f"Error in monthly_commission_sheet: {str(exc)}")
        return {"error": str(exc)}, 500


def get_doctor_reporting_logs(doctor_id, start_date_str=None, end_date_str=None):
    """
    Category-pivoted doctor reporting log (mirrors get_radiologist_performance_data).
    Returns one row per day with counts broken down by CATEGORY_CHOICES
    (Contrast, Full Study, Screening, Other) plus summary totals.
    """
    from_date = datetime.strptime(start_date_str, "%Y-%m-%d")
    to_date = datetime.strptime(end_date_str, "%Y-%m-%d").replace(hour=23, minute=59, second=59)

    # 1. Assigned cases pivoted by category
    query = db.session.query(
        func.date(DoctorReportingdetails.report_at).label('report_date'),
        User.name.label('radiologist_name'),
        Test_registration.category,
        DoctorReportingdetails.status,
        TestBookingDetails.no_of_films
    ).select_from(DoctorReportingdetails)\
    .join(User, cast(User.id, String) == DoctorReportingdetails.doctor_id)\
    .join(Test_registration, Test_registration.id == DoctorReportingdetails.test_id)\
    .outerjoin(TestBookingDetails,
        (cast(TestBookingDetails.booking_id, String) == DoctorReportingdetails.booking_id) &
        (TestBookingDetails.test_id == DoctorReportingdetails.test_id)
    ).filter(
        DoctorReportingdetails.doctor_id == str(doctor_id),
        DoctorReportingdetails.report_at >= from_date,
        DoctorReportingdetails.report_at <= to_date
    )
    results = query.all()

    grouped = {}
    for row in results:
        date_str = str(row.report_date)
        key = date_str
        if key not in grouped:
            grouped[key] = {
                "date": date_str,
                "radiologist_name": row.radiologist_name,
                "Contrast": 0,
                "Full Study": 0,
                "Screening": 0,
                "Other": 0,
                "total_case": 0,
                "films_issued": 0,
                "reports_made": 0,
                "not_sent": 0
            }
        cat = row.category if row.category in CATEGORY_CHOICES else "Other"
        grouped[key][cat] += 1
        grouped[key]["total_case"] += 1
        if row.no_of_films:
            grouped[key]["films_issued"] += row.no_of_films
        if row.status == "Reported":
            grouped[key]["reports_made"] += 1

    # 2. "Case Not Sent to Dr" = booking tests in this date range never assigned to ANY doctor
    not_sent_q = db.session.query(
        func.date(TestBooking.create_at).label('d'),
        func.count(TestBookingDetails.id)
    ).select_from(TestBookingDetails)\
    .join(TestBooking, TestBooking.id == TestBookingDetails.booking_id)\
    .outerjoin(DoctorReportingdetails,
        (DoctorReportingdetails.booking_id == cast(TestBooking.id, String)) &
        (DoctorReportingdetails.test_id == TestBookingDetails.test_id)
    ).filter(
        TestBooking.create_at >= from_date,
        TestBooking.create_at <= to_date,
        DoctorReportingdetails.id.is_(None)
    ).group_by(func.date(TestBooking.create_at)).all()

    not_sent_map = {str(d): c for d, c in not_sent_q}
    for key in grouped:
        grouped[key]["not_sent"] = not_sent_map.get(key, 0)

    final = []
    for i, key in enumerate(sorted(grouped.keys()), 1):
        d = grouped[key]
        d["s_no"] = i
        final.append(d)
    return final


def get_monthly_case_logs(branch_id, from_date_str, to_date_str, referred_dr_id=None, referred_non_dr_id=None):
    """
    Returns one row per booking (flat case sheet) filtered by date range and
    optional referred-doctor / referred-non-doctor.  Uses the double-alias
    Referred join pattern shared with the commission-sheet service.
    """
    from sqlalchemy.orm import aliased
    from app.models.test_booking import TestBooking

    ReferredDr = aliased(Referred)
    ReferredNonDr = aliased(Referred)

    from_date = datetime.strptime(from_date_str, "%Y-%m-%d")
    to_date = datetime.strptime(to_date_str, "%Y-%m-%d").replace(hour=23, minute=59, second=59)

    query = db.session.query(
        TestBooking.id.label("booking_id"),
        TestBooking.create_at,
        TestBooking.patient_name,
        TestBooking.mr_no,
        ReferredDr.name.label("referred_dr_name"),
        ReferredNonDr.name.label("referred_non_dr_name"),
        TestBooking.net_receivable,
        TestBooking.discount_value,
        TestBooking.paid_amount,
        TestBooking.due_amount
    ).outerjoin(ReferredDr, and_(ReferredDr.id == TestBooking.referred_dr, ReferredDr.is_doctor == True))\
     .outerjoin(ReferredNonDr, ReferredNonDr.id == TestBooking.referred_non_dr)\
     .filter(
         TestBooking.branch_id == branch_id,
         TestBooking.create_at >= from_date,
         TestBooking.create_at <= to_date
     )

    if referred_dr_id:
        query = query.filter(TestBooking.referred_dr == referred_dr_id)
    if referred_non_dr_id:
        query = query.filter(TestBooking.referred_non_dr == referred_non_dr_id)

    query = query.order_by(TestBooking.create_at.desc())
    rows = query.all()

    return [{
        "s_no": i,
        "booking_id": r.booking_id,
        "date": to_local(r.create_at, "%Y-%m-%d") if r.create_at else "",
        "patient_name": r.patient_name or "",
        "mr_no": r.mr_no or "",
        "referred_dr": r.referred_dr_name or "-",
        "referred_non_dr": r.referred_non_dr_name or "-",
        "charge": float(r.net_receivable or 0),
        "discount": float(r.discount_value or 0),
        "paid": float(r.paid_amount or 0),
        "due": float(r.due_amount or 0)
    } for i, r in enumerate(rows, 1)]


def format_closing_number(value, decimals=0):
    """Formats numeric values with thousands separators, safely handling None."""
    if value is None:
        return "-"
    try:
        val = float(value)
        if decimals > 0:
            return f"{val:,.{decimals}f}"
        return f"{int(round(val)):,}"
    except Exception:
        return str(value)


def build_closing_sheet_data(branch_id: int, date_str: str, shift_ids_str=None, user_id=None, sheet_type='day'):
    """
    Builds a complete, self-contained data dictionary for:
      - Day End Sheet (2-page A4)
      - Shift End Sheet (1-page A4)
      - Cash Envelope Sticker (5x4 in)
    Guarantees no N+1 per-row queries, strict branch-scoping, and mathematical
    consistency between summary totals and breakdown rows.
    """
    if not branch_id:
        branch_id = session.get("branch_id")
    if branch_id:
        try:
            branch_id = int(branch_id)
        except (ValueError, TypeError):
            branch_id = None
    if not branch_id:
        first_b = Branch.query.first()
        branch_id = first_b.id if first_b else 1

    if user_id:
        try:
            user_id = int(user_id)
        except (ValueError, TypeError):
            user_id = None

    branch = db.session.get(Branch, branch_id) if branch_id else None
    branch_name = branch.branch_name if branch and branch.branch_name else "TMC Diagnostic Center"
    tz_string = branch.timezone if branch and branch.timezone else 'Asia/Karachi'

    try:
        local_tz = ZoneInfo(tz_string)
    except Exception:
        local_tz = ZoneInfo('Asia/Karachi')

    date_obj = datetime.strptime(date_str, "%Y-%m-%d")
    day_name = date_obj.strftime("%A")
    date_formatted = date_obj.strftime("%d %B %Y")
    date_short = date_obj.strftime("%d %b %Y")

    start_utc, end_utc = get_lab_date_bounds(date_str, date_str, branch_id)

    # 1. Shifts parsing
    shift_ranges = []
    shifts = []
    shift_label = "All Day (08:00 – 04:00+1)"
    am_pm = "AM"
    if shift_ids_str:
        s_ids = [int(s) for s in str(shift_ids_str).split(',') if s.strip()]
        if s_ids:
            shifts = ShiftSession.query.filter(ShiftSession.id.in_(s_ids)).all()
            for s in shifts:
                e_time = s.end_time if s.end_time else datetime.now(timezone.utc)
                shift_ranges.append((s.start_time, e_time))
            if shifts:
                first_shift = shifts[0]
                s_start_local = to_local(first_shift.start_time)
                am_pm = "AM" if (s_start_local and s_start_local.hour < 12) else "PM"
                s_end_local = to_local(first_shift.end_time) if first_shift.end_time else None
                start_str = s_start_local.strftime("%H:%M") if s_start_local else "08:00"
                end_str = s_end_local.strftime("%H:%M") if s_end_local else "Active"
                shift_label = f"{'Morning' if am_pm == 'AM' else 'Evening'} ({start_str} – {end_str})"

    # Doc Ref format
    if sheet_type == 'shift':
        doc_ref = f"TMC-SFT-{date_str}-{am_pm}"
    else:
        doc_ref = f"TMC-DAY-{date_str}"

    # Current user / printed by
    cur_user_id = session.get("user_id") or user_id
    if cur_user_id:
        try:
            cur_user_id = int(cur_user_id)
        except (ValueError, TypeError):
            cur_user_id = None
    cur_user_name = session.get("user_name") or "Staff"
    cur_user = db.session.get(User, cur_user_id) if cur_user_id else None
    if cur_user:
        cur_user_name = cur_user.name

    # Helper: Apply time bounds
    def _apply_time(q, col):
        if shift_ranges:
            conds = [and_(col >= s, col <= e) for s, e in shift_ranges]
            return q.filter(or_(*conds))
        return q.filter(col >= start_utc, col <= end_utc)

    # 2. Financial Collections (PaymentTransaction)
    pt_query = db.session.query(
        PaymentTransaction.direction,
        PaymentTransaction.transaction_type,
        PaymentTransaction.payment_type,
        func.sum(PaymentTransaction.amount).label("total")
    ).filter(PaymentTransaction.branch_id == branch_id)

    pt_query = _apply_time(pt_query, PaymentTransaction.payment_date)
    if user_id:
        pt_query = pt_query.filter(PaymentTransaction.created_by == user_id)

    pt_results = pt_query.group_by(
        PaymentTransaction.direction,
        PaymentTransaction.transaction_type,
        PaymentTransaction.payment_type
    ).all()

    cash_income = 0.0
    card_income = 0.0
    online_income = 0.0
    other_income = 0.0
    regular_income = 0.0
    transferred_held_cash = 0.0
    total_income = 0.0
    db_out_expenses = 0.0

    for direction, trans_type, p_type, total in pt_results:
        val = _to_float(total)
        if direction == 'IN':
            if trans_type == 'TransferOut_Held':
                transferred_held_cash += val
            else:
                regular_income += val
            total_income += val

            p_norm = (p_type or 'Cash').strip().capitalize()
            if p_norm == 'Cash':
                cash_income += val
            elif p_norm == 'Card':
                card_income += val
            elif p_norm == 'Online':
                online_income += val
            else:
                other_income += val
        elif direction == 'OUT':
            db_out_expenses += val

    # 3. Expenses Breakdown & Patient Discounts / Refunds
    exp_query = db.session.query(
        Expense_head.name.label("head_name"),
        func.sum(Expenses.amount).label("total_amount")
    ).join(Expense_head, Expenses.expense_head_id == Expense_head.id)\
     .filter(Expenses.branch_id == branch_id, Expenses.is_deleted == False)

    exp_query = _apply_time(exp_query, Expenses.created_at)
    if user_id:
        exp_query = exp_query.filter(Expenses.created_by == user_id)

    exp_rows = exp_query.group_by(Expense_head.name).order_by(func.sum(Expenses.amount).desc()).all()

    # Patient Discounts from TestBooking
    disc_query = db.session.query(func.sum(TestBooking.discount_value)).filter(
        TestBooking.branch_id == branch_id
    )
    disc_query = _apply_time(disc_query, TestBooking.create_at)
    if user_id:
        disc_query = disc_query.filter(TestBooking.create_by == user_id)
    patient_discounts = _to_float(disc_query.scalar())

    refunds_amt = 0.0
    refunds_count = 0
    expense_items = []

    for r in exp_rows:
        h_name = r.head_name
        amt = _to_float(r.total_amount)
        if "refund" in h_name.lower():
            refunds_amt += amt
            refunds_count += 1
            expense_items.append({"name": "Patient Refunds", "amount": amt})
        else:
            expense_items.append({"name": h_name, "amount": amt})

    # If patient discounts were granted, append line
    if patient_discounts > 0:
        expense_items.append({"name": "Patient Discounts", "amount": patient_discounts})

    # Ensure total_expenses matches the breakdown total exactly
    if expense_items:
        total_expense = sum(it["amount"] for it in expense_items)
    else:
        total_expense = db_out_expenses

    # Net drawer cash = cash income minus actual cash paid out for expenses/refunds
    cash_expenses_paid = sum(it["amount"] for it in expense_items if it["name"] != "Patient Discounts")
    net_cash = max(0.0, cash_income - cash_expenses_paid)

    # 4. Appointments (Box 01)
    appt_query = db.session.query(
        func.count(TestBooking.id),
        func.sum(TestBooking.paid_amount)
    ).filter(
        TestBooking.branch_id == branch_id,
        TestBooking.is_appointment == True,
        TestBooking.is_transferred_in == False
    )
    appt_query = _apply_time(appt_query, TestBooking.create_at)
    if user_id:
        appt_query = appt_query.filter(TestBooking.create_by == user_id)
    appt_cnt, appt_adv = appt_query.first() or (0, 0)
    appointments_data = {
        "given": appt_cnt or 0,
        "advance_collected": _to_float(appt_adv)
    }

    # 5. Branch Transfers (Box 02)
    xfer_out_query = db.session.query(
        func.count(BookingTransferLog.id),
        func.sum(BookingTransferLog.transferred_cash_held)
    ).filter(BookingTransferLog.from_branch_id == branch_id)
    xfer_out_query = _apply_time(xfer_out_query, BookingTransferLog.transferred_at)
    if user_id:
        xfer_out_query = xfer_out_query.filter(BookingTransferLog.transferred_by_user_id == user_id)
    xfer_out_cases, xfer_out_cash = xfer_out_query.first() or (0, 0)

    xfer_in_query = db.session.query(
        func.count(TestBooking.id),
        func.sum(TestBooking.paid_amount)
    ).filter(
        TestBooking.branch_id == branch_id,
        TestBooking.is_transferred_in == True
    )
    xfer_in_query = _apply_time(xfer_in_query, TestBooking.create_at)
    if user_id:
        xfer_in_query = xfer_in_query.filter(TestBooking.create_by == user_id)
    xfer_in_cases, xfer_in_cash = xfer_in_query.first() or (0, 0)

    transfers_data = {
        "transferred_out_cases": xfer_out_cases or 0,
        "transferred_out_cash": _to_float(xfer_out_cash),
        "transferred_in_cases": xfer_in_cases or 0,
        "transferred_in_cash": _to_float(xfer_in_cash)
    }

    # 6. MRI Breakdown & Other Category Tests (Box 03 & Box 04)
    test_query = db.session.query(
        Test_registration.category,
        Test_registration.test_name,
        func.count(TestBookingDetails.id).label("cnt"),
        func.sum(TestBookingDetails.amount).label("charges")
    ).join(Test_registration, TestBookingDetails.test_id == Test_registration.id)\
     .join(TestBooking, TestBookingDetails.booking_id == TestBooking.id)\
     .filter(TestBooking.branch_id == branch_id)

    test_query = _apply_time(test_query, TestBooking.create_at)
    if user_id:
        test_query = test_query.filter(TestBooking.create_by == user_id)

    test_rows = test_query.group_by(Test_registration.category, Test_registration.test_name).all()

    mri_screening = {"cases": 0, "amount": 0.0}
    mri_full_study = {"cases": 0, "amount": 0.0}
    mri_contrast = {"cases": 0, "amount": 0.0}
    other_tests_list = []
    other_tests_total_cnt = 0
    other_tests_total_amt = 0.0

    for cat, t_name, cnt, charges in test_rows:
        cnt_val = int(cnt or 0)
        amt_val = _to_float(charges)
        cat_norm = (cat or "Other").strip()

        if cat_norm == "Screening":
            mri_screening["cases"] += cnt_val
            mri_screening["amount"] += amt_val
        elif cat_norm == "Full Study":
            mri_full_study["cases"] += cnt_val
            mri_full_study["amount"] += amt_val
        elif cat_norm == "Contrast":
            mri_contrast["cases"] += cnt_val
            mri_contrast["amount"] += amt_val
        else:
            other_tests_list.append({
                "category": cat_norm,
                "test_name": t_name or "Test",
                "count": cnt_val,
                "amount": amt_val
            })
            other_tests_total_cnt += cnt_val
            other_tests_total_amt += amt_val

    other_tests_list.sort(key=lambda x: x["amount"], reverse=True)

    mri_total = {
        "cases": mri_screening["cases"] + mri_full_study["cases"] + mri_contrast["cases"],
        "amount": mri_screening["amount"] + mri_full_study["amount"] + mri_contrast["amount"]
    }

    # 7. Referring Doctors & Non-Doctors (Box 06 on Page 1 & Top 5 on Page 2)
    ReferredDr = aliased(Referred)
    ReferredNonDr = aliased(Referred)

    ref_query = db.session.query(
        TestBooking.id,
        TestBooking.net_receivable,
        TestBooking.paid_amount,
        ReferredDr.name.label("dr_name"),
        ReferredNonDr.name.label("non_dr_name")
    ).outerjoin(ReferredDr, and_(ReferredDr.id == TestBooking.referred_dr, ReferredDr.is_doctor == True))\
     .outerjoin(ReferredNonDr, ReferredNonDr.id == TestBooking.referred_non_dr)\
     .filter(TestBooking.branch_id == branch_id)

    ref_query = _apply_time(ref_query, TestBooking.create_at)
    if user_id:
        ref_query = ref_query.filter(TestBooking.create_by == user_id)

    ref_bookings = ref_query.all()

    doctors_map = defaultdict(lambda: {"pts": 0, "amount": 0.0})
    non_doctors_map = defaultdict(lambda: {"pts": 0, "amount": 0.0})

    for b in ref_bookings:
        amt = _to_float(b.net_receivable or b.paid_amount)
        if b.dr_name:
            doctors_map[b.dr_name]["pts"] += 1
            doctors_map[b.dr_name]["amount"] += amt
        elif b.non_dr_name:
            non_doctors_map[b.non_dr_name]["pts"] += 1
            non_doctors_map[b.non_dr_name]["amount"] += amt
        else:
            non_doctors_map["Self Walk-in"]["pts"] += 1
            non_doctors_map["Self Walk-in"]["amount"] += amt

    all_referrals = []
    for d_name, d_data in doctors_map.items():
        all_referrals.append({
            "name": d_name,
            "badge": "Ref",
            "pts": d_data["pts"],
            "amount": d_data["amount"]
        })
    for nd_name, nd_data in non_doctors_map.items():
        all_referrals.append({
            "name": nd_name,
            "badge": "Non",
            "pts": nd_data["pts"],
            "amount": nd_data["amount"]
        })

    all_referrals.sort(key=lambda x: x["amount"], reverse=True)
    total_ref_pts = sum(x["pts"] for x in all_referrals)
    total_ref_amt = sum(x["amount"] for x in all_referrals)

    top_doctors_sorted = sorted(doctors_map.items(), key=lambda x: x[1]["amount"], reverse=True)[:5]
    top_doctors = [
        {"rank": i, "name": name, "pts": data["pts"], "amount": data["amount"]}
        for i, (name, data) in enumerate(top_doctors_sorted, 1)
    ]
    top_doctors_total = {
        "pts": sum(d["pts"] for d in top_doctors),
        "amount": sum(d["amount"] for d in top_doctors)
    }

    top_non_doctors_sorted = sorted(non_doctors_map.items(), key=lambda x: x[1]["amount"], reverse=True)[:5]
    top_non_doctors = [
        {"rank": i, "name": name, "pts": data["pts"], "amount": data["amount"]}
        for i, (name, data) in enumerate(top_non_doctors_sorted, 1)
    ]
    top_non_doctors_total = {
        "pts": sum(nd["pts"] for nd in top_non_doctors),
        "amount": sum(nd["amount"] for nd in top_non_doctors)
    }

    # 8. Radiologist Reporting Log (Box 07 on Page 2 & Box 06 in Shift Sheet)
    rad_query = db.session.query(
        User.id.label("doctor_id"),
        User.name.label("doctor_name"),
        User.branch_id.label("doctor_branch_id"),
        Test_registration.category,
        func.count(DoctorReportingdetails.id).label("assigned_count")
    ).select_from(DoctorReportingdetails)\
     .join(User, cast(User.id, String) == DoctorReportingdetails.doctor_id)\
     .join(Test_registration, Test_registration.id == DoctorReportingdetails.test_id)\
     .join(TestBooking, cast(TestBooking.id, String) == DoctorReportingdetails.booking_id)\
     .filter(TestBooking.branch_id == branch_id)

    rad_query = _apply_time(rad_query, DoctorReportingdetails.report_at)

    rad_rows = rad_query.group_by(
        User.id, User.name, User.branch_id, Test_registration.category
    ).all()

    rad_map = {}
    for doc_id, doc_name, doc_branch, cat, count in rad_rows:
        if doc_id not in rad_map:
            rad_map[doc_id] = {
                "name": doc_name,
                "badge": "In-hs" if doc_branch == branch_id else "Tele",
                "screening": 0,
                "full_study": 0,
                "contrast": 0,
                "other": 0,
                "total": 0
            }
        c = int(count or 0)
        cat_norm = (cat or "Other").strip()
        if cat_norm == "Screening":
            rad_map[doc_id]["screening"] += c
        elif cat_norm == "Full Study":
            rad_map[doc_id]["full_study"] += c
        elif cat_norm == "Contrast":
            rad_map[doc_id]["contrast"] += c
        else:
            rad_map[doc_id]["other"] += c
        rad_map[doc_id]["total"] += c

    radiologists_list = list(rad_map.values())
    radiologists_list.sort(key=lambda x: x["total"], reverse=True)

    total_assigned = {
        "screening": sum(r["screening"] for r in radiologists_list),
        "full_study": sum(r["full_study"] for r in radiologists_list),
        "contrast": sum(r["contrast"] for r in radiologists_list),
        "other": sum(r["other"] for r in radiologists_list),
        "total": sum(r["total"] for r in radiologists_list)
    }

    unassigned = {
        "screening": max(0, mri_screening["cases"] - total_assigned["screening"]),
        "full_study": max(0, mri_full_study["cases"] - total_assigned["full_study"]),
        "contrast": max(0, mri_contrast["cases"] - total_assigned["contrast"]),
        "other": max(0, other_tests_total_cnt - total_assigned["other"]),
    }
    unassigned["total"] = unassigned["screening"] + unassigned["full_study"] + unassigned["contrast"] + unassigned["other"]

    # 9. Complete Inventory (Box 08 on Page 2)
    films_data = get_daily_films_report(branch_id, start_utc, end_utc, shift_ranges, user_id)

    film_in_query = db.session.query(
        FilmInventoryTransaction.transaction_date,
        User.name.label("scanner_name")
    ).join(User, FilmInventoryTransaction.handled_by == User.id)\
     .filter(
         FilmInventoryTransaction.branch_id == branch_id,
         FilmInventoryTransaction.transaction_type == 'IN'
     )
    film_in_query = _apply_time(film_in_query, FilmInventoryTransaction.transaction_date)
    film_in_latest = film_in_query.order_by(FilmInventoryTransaction.transaction_date.desc()).first()

    if film_in_latest and film_in_latest.transaction_date:
        scanned_time_str = to_local(film_in_latest.transaction_date, "%I:%M %p")
        scanned_by_text = f"{scanned_time_str} · {film_in_latest.scanner_name}"
    else:
        scanned_by_text = "—"

    # 10. Working Staff (Box 09 on Page 2)
    staff_query = db.session.query(
        ShiftSession,
        User.name.label("staff_name"),
        Role.role.label("role_name")
    ).join(User, ShiftSession.user_id == User.id)\
     .outerjoin(Role, User.role_id == Role.id)\
     .filter(
         ShiftSession.branch_id == branch_id,
         ShiftSession.start_time <= end_utc,
         or_(ShiftSession.end_time >= start_utc, ShiftSession.end_time.is_(None))
     )
    staff_rows = staff_query.order_by(ShiftSession.start_time.asc()).all()

    tech_cases_map = defaultdict(int)
    tech_cases_query = db.session.query(
        TestBooking.create_by,
        func.count(TestBooking.id)
    ).filter(TestBooking.branch_id == branch_id)
    tech_cases_query = _apply_time(tech_cases_query, TestBooking.create_at)
    for u_id, c in tech_cases_query.group_by(TestBooking.create_by).all():
        tech_cases_map[u_id] = c

    working_staff_list = []
    for s_sess, s_name, r_name in staff_rows:
        r_name_clean = (r_name or "Staff").strip().lower()
        if r_name_clean == 'techician':
            display_role = "Tech"
        elif r_name_clean == 'staff':
            display_role = "Counter"
        elif r_name_clean == 'doctor':
            display_role = "Doctor"
        elif r_name_clean == 'admin':
            display_role = "Admin"
        else:
            display_role = r_name or "Staff"

        in_local = to_local(s_sess.start_time)
        in_time_str = in_local.strftime("%H:%M") if in_local else "08:00"

        is_active = (s_sess.status == 'Open' or s_sess.end_time is None)
        if is_active:
            out_time_str = "Act"
            now_utc = datetime.now(timezone.utc)
            duration_delta = now_utc - s_sess.start_time
        else:
            out_local = to_local(s_sess.end_time)
            out_time_str = out_local.strftime("%H:%M") if out_local else "15:00"
            duration_delta = s_sess.end_time - s_sess.start_time

        hours = int(duration_delta.total_seconds() // 3600)
        minutes = int((duration_delta.total_seconds() % 3600) // 60)
        dur_str = f"{hours}h" + (f"{minutes}" if minutes > 0 else "")

        tech_count = tech_cases_map.get(s_sess.user_id) if display_role == "Tech" else None

        working_staff_list.append({
            "name": s_name,
            "role": display_role,
            "tech_count": tech_count,
            "in_time": in_time_str,
            "out_time": out_time_str,
            "is_active": is_active,
            "duration": dur_str
        })

    # 11. Activity Summary (for Shift Sheet Box 05 & Sticker)
    activity_summary = [
        {"category": "Contrast", "cases": mri_contrast["cases"], "amount": mri_contrast["amount"]},
        {"category": "Screening", "cases": mri_screening["cases"], "amount": mri_screening["amount"]},
        {"category": "Full Study", "cases": mri_full_study["cases"], "amount": mri_full_study["amount"]},
        {"category": "Other Tests", "cases": other_tests_total_cnt, "amount": other_tests_total_amt}
    ]

    # 12. Cash Reconciliation (for Shift Sheet Box 03)
    cash_expenses_ex_refunds = max(0.0, cash_expenses_paid - refunds_amt)
    expected_drawer = max(0.0, cash_income - cash_expenses_paid)

    reconciliation = {
        "cash_collections": cash_income,
        "cash_expenses": cash_expenses_ex_refunds,
        "cash_refunds": refunds_amt,
        "expected_drawer": expected_drawer,
        "counted_cash": expected_drawer,
        "variance": 0.0
    }

    # Assembling final dictionary
    return {
        "meta": {
            "branch_id": branch_id,
            "branch_name": branch_name,
            "day_name": day_name,
            "date_formatted": date_formatted,
            "date_short": date_short,
            "date_str": date_str,
            "doc_ref": doc_ref,
            "printed_by": cur_user_name,
            "printed_by_id": cur_user_id or "—",
            "sheet_type": "Shift Closing" if sheet_type == 'shift' else "Daily Closing",
            "shift_label": shift_label,
            "supervisor_name": "Supervisor"
        },
        "summary": {
            "regular_income": regular_income,
            "transferred_held_cash": transferred_held_cash,
            "total_income": total_income,
            "cash_income": cash_income,
            "card_income": card_income,
            "online_income": online_income,
            "other_income": other_income,
            "total_expense": total_expense,
            "net_cash": net_cash,
            "total_handover": net_cash
        },
        "appointments": appointments_data,
        "transfers": transfers_data,
        "mri": {
            "screening": mri_screening,
            "full_study": mri_full_study,
            "contrast": mri_contrast,
            "total": mri_total
        },
        "other_tests": {
            "rows": other_tests_list,
            "items": other_tests_list,
            "total_count": other_tests_total_cnt,
            "total_amount": other_tests_total_amt
        },
        "expenses": {
            "rows": expense_items,
            "items": expense_items,
            "total_amount": total_expense,
            "refund_count": refunds_count,
            "refund_amount": refunds_amt
        },
        "referrals": {
            "all": all_referrals,
            "total_pts": total_ref_pts,
            "total_amount": total_ref_amt,
            "top_doctors": top_doctors,
            "top_doctors_total": top_doctors_total,
            "top_non_doctors": top_non_doctors,
            "top_non_doctors_total": top_non_doctors_total
        },
        "radiologists": {
            "rows": radiologists_list,
            "items": radiologists_list,
            "total_assigned": total_assigned,
            "unassigned": unassigned
        },
        "inventory": {
            "films": {
                "opening": films_data.get("film_start", 0),
                "new_packet": films_data.get("film_added", 0),
                "scanned_by": scanned_by_text,
                "used": films_data.get("film_use", 0),
                "closing": films_data.get("film_closing", 0)
            },
            "contrast": None
        },
        "working_staff": working_staff_list,
        "activity_summary": activity_summary,
        "reconciliation": reconciliation,
        "fn": {
            "num": format_closing_number,
            "curr": lambda v: format_closing_number(v, decimals=2)
        }
    }
