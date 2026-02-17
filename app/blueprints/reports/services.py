from flask import session
from sqlalchemy import func, cast, Date, desc, Integer, and_,String
from app.extensions import db
from app.models import TestBookingDetails
from decimal import Decimal
from datetime import datetime, date,time
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import aliased
from app.models.test_booking import TestFilmUsage, TestBooking, FilmInventoryTransaction
from app.models.test_registration import Test_registration
from app.models.doctor_reporting_details import DoctorReportingdetails, DoctorReportData
from app.models.user import User
from app.models.expenses import Expenses
from app.models.branch import Branch
from collections import defaultdict
from app.models.expense_head import Expense_head
from app.helper import convert_to_utc
from werkzeug.exceptions import BadRequest, NotFound
from app.models.expenses import PaymentTransaction

def _to_float(value):
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except Exception:
        return 0.0

def get_expenses_report(branch_id: int, date, user_id=None):
    if not branch_id or not date:
        raise ValueError("branch_id and date are required")

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
                Expenses.is_deleted == False,
                func.date(Expenses.created_at) == date
            )
        )

        # --- NEW: Filter by User ---
        if user_id:
            q = q.filter(Expenses.created_by == user_id)

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

# ... (imports remain same)

def get_daily_films_report(branch_id: int, date_obj, user_id=None):
    try:
        target_date = date_obj

        # ---------------------------------------------------------
        # 1. Calculate Opening Stock (All transactions BEFORE today)
        # ---------------------------------------------------------
        before_query = (
            db.session.query(
                FilmInventoryTransaction.transaction_type,
                func.sum(FilmInventoryTransaction.quantity)
            )
            .filter(cast(FilmInventoryTransaction.transaction_date, Date) < target_date)
            .filter(FilmInventoryTransaction.branch_id == branch_id)
            .group_by(FilmInventoryTransaction.transaction_type)
        )
        
        # Note: Inventory Balance is branch-wide, we typically don't filter Opening Stock by User
        before_data = before_query.all()

        total_in_before = sum(q for t, q in before_data if t == "IN") or 0
        total_out_before = sum(q for t, q in before_data if t == "OUT") or 0
        
        film_start = total_in_before - total_out_before

        # ---------------------------------------------------------
        # 2. Calculate Today's Activity (IN / OUT)
        # ---------------------------------------------------------
        day_query = (
            db.session.query(
                FilmInventoryTransaction.transaction_type,
                func.sum(FilmInventoryTransaction.quantity)
            )
            .filter(cast(FilmInventoryTransaction.transaction_date, Date) == target_date)
            .filter(FilmInventoryTransaction.branch_id == branch_id)
        )
        
        day_data_branch = day_query.group_by(FilmInventoryTransaction.transaction_type).all()

        in_today_branch = sum(q for t, q in day_data_branch if t == "IN") or 0
        out_today_branch = sum(q for t, q in day_data_branch if t == "OUT") or 0
        
        # Branch Closing
        film_closing = film_start + in_today_branch - out_today_branch

        # ---------------------------------------------------------
        # 3. Determine "Usage" to display
        # ---------------------------------------------------------
        displayed_usage = out_today_branch
        
        if user_id:
            # If a specific user is selected, calculate specifically their usage
            user_usage = (
                db.session.query(func.sum(FilmInventoryTransaction.quantity))
                .filter(cast(FilmInventoryTransaction.transaction_date, Date) == target_date)
                .filter(FilmInventoryTransaction.branch_id == branch_id)
                .filter(FilmInventoryTransaction.handled_by == user_id)
                .filter(FilmInventoryTransaction.transaction_type == "OUT")
                .scalar()
            ) or 0
            displayed_usage = user_usage

        return {
            "film_start": int(film_start),
            "film_closing": int(film_closing),
            "film_use": int(displayed_usage),
            "film_added": int(in_today_branch) # Added bonus info if you want it
        }

    except Exception as e:
        print(f"Error in films report: {str(e)}")
        raise e
    
def get_daily_test_report(branch_id, date_obj, user_id=None):
    try:
        query = (
            db.session.query(
                Test_registration.test_name,
                func.count(TestBookingDetails.id).label("total_count"),
                func.sum(TestBookingDetails.amount).label("total_amount")
            )
            .join(TestBooking, TestBookingDetails.booking_id == TestBooking.id)
            .join(Test_registration, TestBookingDetails.test_id == Test_registration.id)
            .filter(
                TestBooking.branch_id == branch_id,
                func.date(TestBooking.create_at) == date_obj
            )
        )

        # --- NEW: Filter by User ---
        if user_id:
            query = query.filter(TestBooking.create_by == user_id)

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
# ... (existing imports)

def get_daily_summary(branch_id, date_obj, user_id=None):
    """
    Calculates Total Cash IN and Total Cash OUT from PaymentTransactions.
    IN = Initial Booking Payments + Due Clearance
    OUT = Expenses + Refunds
    """
    try:
        query = db.session.query(
            PaymentTransaction.direction,
            func.sum(PaymentTransaction.amount).label("total")
        ).filter(
            PaymentTransaction.branch_id == branch_id,
            func.date(PaymentTransaction.payment_date) == date_obj
        )

        # Apply Staff Filter
        if user_id:
            query = query.filter(PaymentTransaction.created_by == user_id)

        results = query.group_by(PaymentTransaction.direction).all()
        
        summary = {
            "total_income": 0.0, 
            "total_expense": 0.0,
            "net_cash": 0.0
        }

        for direction, total in results:
            val = _to_float(total)
            if direction == 'IN':
                summary["total_income"] = val
            elif direction == 'OUT':
                summary["total_expense"] = val
                
        summary["net_cash"] = summary["total_income"] - summary["total_expense"]
        return summary

    except Exception as e:
        print(f"Error in daily summary: {str(e)}")
        raise e

def get_due_clearance_report(branch_id, date_obj, user_id=None):
    try:
        # 1. Query PaymentTransaction table
        query = (
            db.session.query(
                PaymentTransaction.amount,
                PaymentTransaction.payment_type,
                PaymentTransaction.payment_date,  # <--- FIXED: Was created_at
                TestBooking.patient_name,
                TestBooking.mr_no,
                User.name.label("collected_by")
            )
            .join(TestBooking, PaymentTransaction.booking_id == TestBooking.id)
            .join(User, PaymentTransaction.created_by == User.id)
            .filter(
                PaymentTransaction.branch_id == branch_id,
                # Filter specifically for Due Clearance
                PaymentTransaction.transaction_type == 'DueClearance', 
                func.date(PaymentTransaction.payment_date) == date_obj
            )
        )

        # 2. Apply User Filter if selected
        if user_id:
            query = query.filter(PaymentTransaction.created_by == user_id)

        rows = query.all()

        return [
            {
                "patient_name": r.patient_name,
                "mr_no": r.mr_no,
                "amount": _to_float(r.amount),
                "type": r.payment_type,
                "time": r.payment_date.strftime("%I:%M %p"), # <--- FIXED: Was created_at
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
        # --- 1. Date Filtering Logic ---
        start_dt = None
        end_dt = None

        if from_date and to_date:
            try:
                from_date_obj = datetime.strptime(from_date, "%Y-%m-%d").date()
                to_date_obj   = datetime.strptime(to_date, "%Y-%m-%d").date()
            except ValueError:
                return {"status": "error", "message": "Date format must be YYYY-MM-DD."}

            if from_date_obj > to_date_obj:
                return {"status": "error", "message": "from_date cannot be greater than to_date."}

            start_dt = datetime.combine(from_date_obj, time.min)
            end_dt   = datetime.combine(to_date_obj, time.max)

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
            
            # --- NEW: Fetch Due Amount ---
            TestBooking.due_amount.label("booking_balance")
        ).join(
            Test_registration, DoctorReportingdetails.test_id == Test_registration.id
        ).join(
            # --- NEW: Join Booking Table to get Balance ---
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

        if start_dt and end_dt:
            query = query.filter(DoctorReportingdetails.report_at.between(start_dt, end_dt))

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
                "assigned_at": row.assigned_at.strftime('%Y-%m-%d %H:%M:%S') if row.assigned_at else None,
                "report_details_id": row.report_details_id,
                "id": row.reported_id,
                
                # --- NEW: Pass Balance to Frontend ---
                "balance": float(row.booking_balance or 0)
            })

        return response_data, 200

    except Exception as e:
        print(f"Error fetching assigned reports: {str(e)}")
        return {
            "status": "error",
            "message": str(e)
        }
    
    
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

    now = datetime.utcnow()

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
    # ... (Keep query logic same as original) ...
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
        "incidental_findings": report_obj.incidental_findings, # <--- NEW
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
        "incidental_findings",  # <--- Add this comma
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

def get_radiologist_performance_data(doctor_id, start_date_str=None, end_date_str=None):
    from_date = datetime.strptime(start_date_str, "%Y-%m-%d")
    to_date = datetime.strptime(end_date_str, "%Y-%m-%d").replace(hour=23, minute=59, second=59)

    query = db.session.query(
        func.date(DoctorReportingdetails.report_at).label('report_date'),
        User.name.label('radiologist_name'),
        Test_registration.test_name,
        DoctorReportingdetails.status,
        TestBookingDetails.no_of_films,
        # --- NEW FIELD: Fetch the charge for this test ---
        Test_registration.report_charges 
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
        test_name = row.test_name
        
        # Determine price (Default to 0 if null)
        price = row.report_charges if row.report_charges else 0.0

        key = (date_str, doctor)

        if key not in grouped_data:
            grouped_data[key] = {
                "date": date_str,
                "radiologist_name": doctor,
                "tests_counts": defaultdict(int),
                "total_tests": 0,
                "reports_made": 0,
                "films_issued": 0,
                "total_revenue": 0.0  # <--- Initialize Total
            }

        # Count the test
        grouped_data[key]["tests_counts"][test_name] += 1
        grouped_data[key]["total_tests"] += 1
        
        # Add price to daily total
        grouped_data[key]["total_revenue"] += price

        if row.status == "Reported":
            grouped_data[key]["reports_made"] += 1

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
            "total_amount": round(data["total_revenue"], 2) # <--- Final Total
        })

    return final_report