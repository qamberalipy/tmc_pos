from venv import logger
from datetime import datetime, timedelta, timezone
from app.extensions import db
from app.models import Branch, Role, User, Department, TestBooking, TestBookingDetails, Referred, Test_registration
from app.models.referred import ReferralShare
from app.models.expenses import Expenses
from sqlalchemy import cast, Integer, func
from sqlalchemy.exc import SQLAlchemyError
from app.utils.timezone import to_local

def create_branch(data):
    branch = Branch(
        branch_name=data.get('branch_name'),
        contact_number=data.get('contact_number'),
        additional_contact_number=data.get('additional_contact_number'),
        address=data.get('address'),
        description=data.get('description'),
        created_by=data.get('created_by')  # assuming this is a user.id
    )
    db.session.add(branch)
    db.session.commit()
    return {"message": "Branch created successfully", "id": branch.id}

# 2. Update Branch
def update_branch(branch_id, data):
    branch = Branch.query.get(branch_id)
    if not branch:
        return {"error": "Branch not found"}

    branch.branch_name = data.get('branch_name', branch.branch_name)
    branch.contact_number = data.get('contact_number', branch.contact_number)
    branch.additional_contact_number = data.get('additional_contact_number', branch.additional_contact_number)
    branch.address = data.get('address', branch.address)
    branch.description = data.get('description', branch.description)
    branch.updated_by = data.get('updated_by', branch.updated_by)

    db.session.commit()
    return {"message": "Branch updated successfully"}

# 3. Get All Branches

def get_all_branches():
    try:
        # Cast branch.created_by to Integer to match user.id
        results = db.session.query(
            Branch, 
            User.name.label('created_by_name')
        ).join(
            User, 
            User.id == cast(Branch.created_by, Integer) # Use cast here
        ).all()

        return [
            {
                "id": b.Branch.id,
                "branch_name": b.Branch.branch_name,
                "contact_number": b.Branch.contact_number,
                "additional_contact_number": b.Branch.additional_contact_number,
                "address": b.Branch.address,
                "description": b.Branch.description,
                "created_by": b.created_by_name,
                "is_active": b.Branch.is_active
            }
            for b in results
        ]
    except Exception as e:
        print(f"Error: {str(e)}")
        raise e

# 4. Get Branch by ID
def get_branch_by_id(branch_id):
    try:
        branch = (
            db.session.query(
                Branch.id,
                Branch.branch_name,
                Branch.contact_number,
                Branch.additional_contact_number,
                Branch.address,
                Branch.description,
                User.name.label("created_by_name"),
                Branch.is_active,
                Branch.created_at
            )
            .outerjoin(User, User.id == cast(Branch.created_by, Integer))
            .filter(Branch.id == branch_id)
            .first()
        )
    except SQLAlchemyError as e:
        logger.error(f"SQL error in get_branch_by_id for branch {branch_id}. Bad data in Branch.created_by? Error: {e}")
        db.session.rollback()
        # Fallback without the User join
        branch = (
            db.session.query(
                Branch.id,
                Branch.branch_name,
                Branch.contact_number,
                Branch.additional_contact_number,
                Branch.address,
                Branch.description,
                Branch.is_active,
                Branch.created_at,
                Branch.created_by
            )
            .filter(Branch.id == branch_id)
            .first()
        )
        if not branch:
            return {"error": "Branch not found"}
            
        return {
            "id": branch.id,
            "branch_name": branch.branch_name,
            "contact_number": branch.contact_number,
            "additional_contact_number": branch.additional_contact_number,
            "address": branch.address,
            "description": branch.description,
            "created_by": f"Invalid ID: {branch.created_by}",
            "is_active": branch.is_active,
            "created_at": branch.created_at
        }

    if not branch:
        return {"error": "Branch not found"}

    return {
        "id": branch.id,
        "branch_name": branch.branch_name,
        "contact_number": branch.contact_number,
        "additional_contact_number": branch.additional_contact_number,
        "address": branch.address,
        "description": branch.description,
        "created_by": branch.created_by_name,
        "is_active": branch.is_active,
        "created_at": branch.created_at
    }

# 5. Activate / Deactivate Branch
def toggle_branch_status(branch_id, is_active):
    branch = Branch.query.get(branch_id)
    if not branch:
        return {"error": "Branch not found"}

    branch.is_active = bool(is_active)
    db.session.commit()

    return {
        "message": f"Branch {'activated' if branch.is_active else 'deactivated'} successfully",
        "is_active": branch.is_active
    }

def get_all_branches_service():
    try:
        branches = Branch.query.filter(Branch.is_active == True).all()
        return [
            {
                "id": branch.id,
                "name": branch.branch_name
            }
            for branch in branches
        ]
    except SQLAlchemyError as e:
        print(f"Database error while fetching branches: {str(e)}")
        raise
    except Exception as e:
        print(f"Unexpected error in get_all_branches_service: {str(e)}")
        raise


def get_all_roles_service():
    try:
        roles = Role.query.all()
        return [
            {
                "id": role.id,
                "name": role.role
            }
            for role in roles
        ]
    except SQLAlchemyError as e:
        print(f"Database error while fetching roles: {str(e)}")
        raise
    except Exception as e:
        print(f"Unexpected error in get_all_roles_service: {str(e)}")
        raise

def get_all_department_service():
    try:
        departments = Department.query.all()
        return [
            {
                "id": department.id,
                "name": department.name
            }
            for department in departments
        ]
    except SQLAlchemyError as e:
        print(f"Database error while fetching departments: {str(e)}")
        raise
    except Exception as e:
        print(f"Unexpected error in get_all_departments_service: {str(e)}")
        raise


def get_dashboard_summary(branch_id):
    today = datetime.now(timezone.utc).date()
    month_start = today.replace(day=1)

    todays_bookings = TestBooking.query.filter(
        TestBooking.branch_id == branch_id,
        func.date(TestBooking.create_at) == today
    ).count()

    todays_collection = db.session.query(
        func.coalesce(func.sum(TestBooking.paid_amount), 0)
    ).filter(
        TestBooking.branch_id == branch_id,
        func.date(TestBooking.create_at) == today
    ).scalar()

    total_due = db.session.query(
        func.coalesce(func.sum(TestBooking.due_amount), 0)
    ).filter(
        TestBooking.branch_id == branch_id,
        TestBooking.due_amount > 0
    ).scalar()

    month_expenses = db.session.query(
        func.coalesce(func.sum(Expenses.amount), 0)
    ).filter(
        Expenses.branch_id == branch_id,
        Expenses.is_deleted == False,
        Expenses.created_at >= month_start
    ).scalar()

    # Last 14 days revenue trend
    trend_rows = db.session.query(
        func.date(TestBooking.create_at).label('d'),
        func.sum(TestBooking.paid_amount)
    ).filter(
        TestBooking.branch_id == branch_id,
        TestBooking.create_at >= today - timedelta(days=13)
    ).group_by('d').order_by('d').all()

    # Test category breakdown (this month)
    category_rows = db.session.query(
        Test_registration.category,
        func.count(TestBookingDetails.id)
    ).join(
        TestBookingDetails, TestBookingDetails.test_id == Test_registration.id
    ).join(
        TestBooking, TestBooking.id == TestBookingDetails.booking_id
    ).filter(
        TestBooking.branch_id == branch_id,
        TestBooking.create_at >= month_start
    ).group_by(Test_registration.category).all()

    # Top referring doctors (this month)
    top_doctors = db.session.query(
        Referred.name,
        func.count(ReferralShare.id)
    ).join(
        ReferralShare, ReferralShare.referred_id == Referred.id
    ).join(
        TestBooking, TestBooking.id == ReferralShare.booking_id
    ).filter(
        TestBooking.branch_id == branch_id,
        TestBooking.create_at >= month_start
    ).group_by(Referred.name).order_by(func.count(ReferralShare.id).desc()).limit(5).all()

    recent = TestBooking.query.filter(
        TestBooking.branch_id == branch_id
    ).order_by(TestBooking.create_at.desc()).limit(6).all()

    return {
        "todays_bookings": todays_bookings,
        "todays_collection": float(todays_collection),
        "total_due": float(total_due),
        "month_expenses": float(month_expenses),
        "trend": [{"date": str(r.d), "amount": float(r[1])} for r in trend_rows],
        "categories": [{"label": c[0] or "Other", "count": c[1]} for c in category_rows],
        "top_doctors": [{"name": d[0], "count": d[1]} for d in top_doctors],
        "recent_bookings": [
            {
                "patient": b.patient_name,
                "amount": float(b.net_receivable or 0),
                "date": to_local(b.create_at, "%d-%b-%Y"),
                "status": "Paid" if (b.due_amount or 0) == 0 else "Due"
            }
            for b in recent
        ]
    }


def get_staff_dashboard_summary(branch_id):
    """Lightweight summary for the Staff Dashboard."""
    import datetime
    from app.blueprints.transactions import services as transaction_services
    from app.blueprints.booking import services as booking_services

    today = datetime.datetime.now(timezone.utc).date()
    today_str = str(today)

    # --- Outstanding dues (all-time unpaid, most recent first, capped to 10) ---
    outstanding_dues = db.session.query(
        TestBooking.id,
        TestBooking.mr_no,
        TestBooking.patient_name,
        TestBooking.due_amount,
        TestBooking.create_at,
    ).filter(
        TestBooking.branch_id == branch_id,
        TestBooking.due_amount > 0
    ).order_by(TestBooking.create_at.desc()).limit(10).all()

    dues_data = [
        {
            "booking_id": b.id,
            "mr_no": b.mr_no,
            "patient_name": b.patient_name,
            "due_amount": float(b.due_amount or 0),
            "date": to_local(b.create_at, "%d-%b-%Y") if b.create_at else None,
        }
        for b in outstanding_dues
    ]

    # --- Today's expenses (reuse transaction service) ---
    expenses_result, _status = transaction_services.get_all_expenses(
        branch_id_str=str(branch_id),
        from_date=today_str,
        to_date=today_str
    )
    if isinstance(expenses_result, list):
        today_expense_total = sum(float(e.get("amount", 0)) for e in expenses_result)
    else:
        today_expense_total = 0.0

    # --- Films balance (today's closing from inventory report; reuse booking service) ---
    films_balance = 0
    last_packet_date = None
    try:
        film_report, _fstatus = booking_services.get_film_inventory_report(
            branch_id=branch_id,
            from_date=today_str,
            to_date=today_str
        )
        report_rows = film_report.get("data", []) if isinstance(film_report, dict) else []
        normal_rows = [r for r in report_rows if r.get("type") == "normal"]
        if normal_rows:
            films_balance = normal_rows[-1].get("closing", 0)
        packet_rows = [r for r in report_rows if r.get("type") == "packet"]
        if packet_rows:
            last_packet_date = packet_rows[-1].get("date")
    except Exception:
        films_balance = 0

    # --- Recent bookings today (latest 5, direct query) ---
    recent_rows = db.session.query(
        TestBooking.id,
        TestBooking.mr_no,
        TestBooking.patient_name,
        TestBooking.net_receivable,
        TestBooking.due_amount,
        TestBooking.create_at,
    ).filter(
        TestBooking.branch_id == branch_id,
        func.date(TestBooking.create_at) == today
    ).order_by(TestBooking.create_at.desc()).limit(5).all()

    recent_bookings = [
        {
            "booking_id": b.id,
            "mr_no": b.mr_no,
            "patient_name": b.patient_name,
            "net_amount": float(b.net_receivable or 0),
            "due_amount": float(b.due_amount or 0),
            "status": "Paid" if (b.due_amount or 0) == 0 else "Due",
            "date": to_local(b.create_at, "%d-%b %I:%M %p") if b.create_at else None,
        }
        for b in recent_rows
    ]

    # --- Recent results (bookings sent to doctor, latest 5) ---
    from app.models.doctor_reporting_details import DoctorReportingdetails
    reported_ids_subq = db.session.query(
        db.cast(DoctorReportingdetails.booking_id, db.Integer)
    ).filter(DoctorReportingdetails.is_active == True).subquery()

    result_rows = db.session.query(
        TestBooking.id,
        TestBooking.mr_no,
        TestBooking.patient_name,
        TestBooking.update_at,
    ).filter(
        TestBooking.branch_id == branch_id,
        TestBooking.id.in_(reported_ids_subq)
    ).order_by(TestBooking.update_at.desc()).limit(5).all()

    recent_results = [
        {
            "booking_id": b.id,
            "mr_no": b.mr_no,
            "patient_name": b.patient_name,
            "updated_at": to_local(b.update_at, "%d-%b %I:%M %p") if b.update_at else None,
        }
        for b in result_rows
    ]

    return {
        "dues": dues_data,
        "today_expense_total": today_expense_total,
        "films_balance": films_balance,
        "last_packet_date": last_packet_date,
        "recent_bookings": recent_bookings,
        "recent_results": recent_results,
    }
