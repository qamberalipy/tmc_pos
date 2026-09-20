from flask import session
from sqlalchemy import func, cast, Date, desc, Integer, and_, String, or_
from app.extensions import db
from app.models import TestBookingDetails
from decimal import Decimal
from datetime import datetime, date, time, timezone
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import aliased
from app.models.test_booking import TestFilmUsage, TestBooking, FilmInventoryTransaction
from app.models.test_registration import Test_registration, CATEGORY_CHOICES
from app.models.doctor_reporting_details import DoctorReportingdetails, DoctorReportData
from app.models.user import User
from app.models.expenses import Expenses
from app.models.branch import Branch
from collections import defaultdict
from app.models.expense_head import Expense_head
from app.helper import get_lab_date_bounds
from app.models.referred import Referred
from werkzeug.exceptions import BadRequest, NotFound
from app.models.expenses import PaymentTransaction
from app.models.doctor_category_rate import DoctorCategoryRate

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
                "time": r.payment_date.strftime("%Y-%m-%d %I:%M %p"), # Sending full UTC timestamp string for frontend format
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
                "assigned_at": row.assigned_at.strftime('%Y-%m-%d %I:%M %p') if row.assigned_at else None,
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
            "assigned_at": dr_detail.report_at.strftime("%Y-%m-%d %H:%M:%S") if dr_detail.report_at else None,
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
        "assigned_at": assigned_at.strftime("%Y-%m-%d %H:%M:%S") if assigned_at else None,
        "reported_at": report_obj.created_at.strftime("%Y-%m-%d %H:%M:%S") if report_obj.created_at else None,

        "created_by": report_obj.created_by,
        "updated_by": report_obj.updated_by,
        "created_at": report_obj.created_at.strftime("%Y-%m-%d %H:%M:%S") if report_obj.created_at else None,
        "updated_at": report_obj.updated_at.strftime("%Y-%m-%d %H:%M:%S") if report_obj.updated_at else None,
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
                "date":          f"{booking.create_at.day}-{booking.create_at.strftime('%b-%Y')}"
                                 if hasattr(booking.create_at, "strftime")
                                 else "",
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
        "date": r.create_at.strftime("%Y-%m-%d") if r.create_at else "",
        "patient_name": r.patient_name or "",
        "mr_no": r.mr_no or "",
        "referred_dr": r.referred_dr_name or "-",
        "referred_non_dr": r.referred_non_dr_name or "-",
        "charge": float(r.net_receivable or 0),
        "discount": float(r.discount_value or 0),
        "paid": float(r.paid_amount or 0),
        "due": float(r.due_amount or 0)
    } for i, r in enumerate(rows, 1)]