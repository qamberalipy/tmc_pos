from venv import logger
from datetime import datetime, timedelta, timezone
from app.extensions import db
from app.models import Branch, Role, User, Department, TestBooking, TestBookingDetails, Referred, Test_registration
from app.models.referred import ReferralShare
from app.models.expenses import Expenses
from sqlalchemy import cast, Integer, func
from sqlalchemy.exc import SQLAlchemyError

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
        .join(User, User.id == Branch.created_by)
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
                "date": b.create_at.strftime("%d-%b-%Y"),
                "status": "Paid" if (b.due_amount or 0) == 0 else "Due"
            }
            for b in recent
        ]
    }
