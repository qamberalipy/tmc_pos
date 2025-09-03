from flask import session
from app.extensions import db
from app.models import Expense_head, Branch, User ,Referred,Test_registration
from werkzeug.security import generate_password_hash
from sqlalchemy.exc import SQLAlchemyError

# Helper: format expense head
def _format_expense_head(head, branch_name=None, created_by_name=None):
    return {
        "id": head.id,
        "name": head.name,
        "is_active": head.is_active,
        "branch": branch_name,
        "created_by": created_by_name,
        "updated_by": head.updated_by,
        "created_at": head.created_at,
        "updated_at": head.updated_at
    }

# Create
def create_expense_head(data):
    try:
        if not data.get("name"):
            return {"error": "Name is required"}, 400
        if not data.get("branch_id"):
            return {"error": "Branch ID is required"}, 400
        if not data.get("created_by"):
            return {"error": "Created By (User ID) is required"}, 400

        head = Expense_head(
            name=data["name"],
            created_by=data["created_by"],
            updated_by=data["created_by"],
            branch_id=data["branch_id"]   # <-- assuming you add this field in model
        )
        db.session.add(head)
        db.session.commit()
        return {"message": "Expense Head created successfully", "id": head.id}, 201
    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get("orig", e))}, 500

# Read All (with joins)

def get_all_expense_heads(branch_id=None):
    try:
        query = (
            db.session.query(
                Expense_head,
                Branch.branch_name.label("branch_name"),
                User.name.label("created_by_name")
            )
            .join(Branch, Expense_head.branch_id == Branch.id)
            .join(User, Expense_head.created_by == User.id)
        )

        # Apply branch filter if provided
        if branch_id:
            query = query.filter(Expense_head.branch_id == branch_id)

        results = query.all()

        return [
            _format_expense_head(h, branch_name, created_by_name)
            for h, branch_name, created_by_name in results
        ], 200

    except SQLAlchemyError as e:
        db.session.rollback()  # rollback in case of exception
        return {"error": str(e.__dict__.get("orig", e))}, 500

# Read One
def get_expense_head_by_id(head_id):
    try:
        result = (
            db.session.query(
                Expense_head,
                Branch.branch_name.label("branch_name"),
                User.name.label("created_by_name")
            )
            .outerjoin(Branch, Expense_head.branch_id == Branch.id)
            .outerjoin(User, Expense_head.created_by == User.id)
            .filter(Expense_head.id == head_id)
            .first()
        )
        if not result:
            return {"error": "Expense Head not found"}, 404

        h, branch_name, created_by_name = result
        return _format_expense_head(h, branch_name, created_by_name), 200
    except SQLAlchemyError as e:
        return {"error": str(e.__dict__.get("orig", e))}, 500

# Update
def update_expense_head(head_id, data):
    try:
        head = Expense_head.query.get(head_id)
        if not head:
            return {"error": "Expense Head not found"}, 404

        if data.get("name"):
            head.name = data["name"]
        if data.get("branch_id"):
            head.branch_id = data["branch_id"]
        if "updated_by" in data:
            head.updated_by = data["updated_by"]

        db.session.commit()
        return {"message": "Expense Head updated successfully"}, 200
    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get("orig", e))}, 500

# Activate / Deactivate
def toggle_expense_head_status(head_id, is_active):
    try:
        head = Expense_head.query.get(head_id)
        if not head:
            return {"error": "Expense Head not found"}, 404

        head.is_active = bool(is_active)
        db.session.commit()
        return {"message": f"Expense Head {'activated' if head.is_active else 'deactivated'} successfully"}, 200
    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get("orig", e))}, 500

def _format_referred(r, branch_name=None, created_by_name=None):
    return {
        "id": r.id,
        "name": r.name,
        "contact_no": r.contact_no,
        "is_doctor": r.is_doctor,
        "location": r.location,
        "specialization": r.specialization,
        "branch": branch_name,
        "discount_to_patient": r.discount_to_patient,
        "is_active": r.is_active,
        "created_by": created_by_name,
        "updated_by": r.updated_by,
        "created_at": r.created_at,
        "updated_at": r.updated_at
    }

# 🔹 Create
def create_referred(data):
    try:
        required = ["name", "created_by"]
        for field in required:
            if not data.get(field):
                return {"error": f"{field} is required"}, 400

        referred = Referred(
            name=data["name"],
            contact_no=data.get("contact_no"),
            is_doctor=data.get("is_doctor", False),
            location=data["location"],
            specialization=data["specialization"],
            branch_id=data.get("branch_id"),
            discount_to_patient=data.get("discount_to_patient", {"give_discount": False, "value": 0}),
            created_by=data["created_by"],
            updated_by=data["created_by"]
        )
        db.session.add(referred)
        db.session.commit()
        return {"message": "Referred created successfully", "id": referred.id}, 201

    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get("orig", e))}, 500

# 🔹 Read All (joins branch + user)
def get_all_referred(branch_id=None):
    try:
        query = (
            db.session.query(
                Referred,
                Branch.branch_name.label("branch_name"),
                User.name.label("created_by_name")
            )
            .outerjoin(Branch, Referred.branch_id == Branch.id)
            .outerjoin(User, Referred.created_by == User.id)
        )
        if branch_id:
            query = query.filter(Expense_head.branch_id == branch_id)

        results = query.all()
        return [_format_referred(r, branch_name, created_by_name) for r, branch_name, created_by_name in results], 200

    except SQLAlchemyError as e:
        return {"error": str(e.__dict__.get("orig", e))}, 500

# 🔹 Read One
def get_referred_by_id(referred_id):
    try:
        result = (
            db.session.query(
                Referred,
                Branch.branch_name.label("branch_name"),
                User.name.label("created_by_name")
            )
            .outerjoin(Branch, Referred.branch_id == Branch.id)
            .outerjoin(User, Referred.created_by == User.id)
            .filter(Referred.id == referred_id)
            .first()
        )
        if not result:
            return {"error": "Referred not found"}, 404

        r, branch_name, created_by_name = result
        return _format_referred(r, branch_name, created_by_name), 200

    except SQLAlchemyError as e:
        return {"error": str(e.__dict__.get("orig", e))}, 500

# 🔹 Update
def update_referred(referred_id, data):
    try:
        r = Referred.query.get(referred_id)
        if not r:
            return {"error": "Referred not found"}, 404

        if data.get("name"):
            r.name = data["name"]
        if data.get("contact_no"):
            r.contact_no = data["contact_no"]
        if "is_doctor" in data:
            r.is_doctor = data["is_doctor"]
        if data.get("location"):
            r.location = data["location"]
        if data.get("specialization"):
            r.specialization = data["specialization"]
        if data.get("branch_id"):
            r.branch_id = data["branch_id"]
        if data.get("discount_to_patient"):
            r.discount_to_patient = data["discount_to_patient"]
        if "updated_by" in data:
            r.updated_by = data["updated_by"]

        db.session.commit()
        return {"message": "Referred updated successfully"}, 200

    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get("orig", e))}, 500

# 🔹 Toggle Status
def toggle_referred_status(referred_id, is_active):
    try:
        r = Referred.query.get(referred_id)
        if not r:
            return {"error": "Referred not found"}, 404

        r.is_active = bool(is_active)
        db.session.commit()
        return {"message": f"Referred {'activated' if r.is_active else 'deactivated'} successfully"}, 200

    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get("orig", e))}, 500

# 🔹 Helper
def _format_test_registration(t, branch_name=None, created_by_name=None):
    return {
        "id": t.id,
        "test_name": t.test_name,
        "sample_collection": t.sample_collection,
        "department_id": t.department_id,
        "charges": t.charges,
        "required_days": t.required_days,
        "sequence_no": t.sequence_no,
        "no_of_films": t.no_of_films,
        "description": t.description,
        "branch": branch_name,
        "is_active": t.is_active,
        "created_by": created_by_name,
        "updated_by": t.updated_by,
        "created_at": t.created_at,
        "updated_at": t.updated_at
    }

# 🔹 Create
def create_test_registration(data):
    try:
        required = ["test_name", "charges", "required_days", "branch_id", "created_by"]
        for field in required:
            if not data.get(field):
                return {"error": f"{field} is required"}, 400

        test = Test_registration(
            test_name=data["test_name"],
            sample_collection=data.get("sample_collection"),
            department_id=data.get("department_id"),
            charges=data["charges"],
            required_days=data["required_days"],
            sequence_no=data["sequence_no"],
            no_of_films=data.get("no_of_films"),
            description=data.get("description"),
            branch_id=data["branch_id"],
            created_by=data["created_by"],
            updated_by=data["created_by"]
        )
        db.session.add(test)
        db.session.commit()
        return {"message": "Test Registration created successfully", "id": test.id}, 201

    except SQLAlchemyError as e:
        db.session.rollback()
        print(f"Error creating test registration: {str(e)}")
        return {"error": str(e.__dict__.get("orig", e))}, 500

# 🔹 Get All
def get_all_test_registrations(branch_id=None):
    try:
        query = (
            db.session.query(
                Test_registration,
                Branch.branch_name.label("branch_name"),
                User.name.label("created_by_name")
            )
            .outerjoin(Branch, Test_registration.branch_id == Branch.id)
            .outerjoin(User, Test_registration.created_by == User.id)
        )
        if branch_id:
            query = query.filter(Test_registration.branch_id == branch_id)

        results = query.all()
        return [_format_test_registration(t, branch_name, created_by_name) for t, branch_name, created_by_name in results], 200

    except SQLAlchemyError as e:
        return {"error": str(e.__dict__.get("orig", e))}, 500

# 🔹 Get One
def get_test_registration_by_id(test_id):
    try:
        result = (
            db.session.query(
                Test_registration,
                Branch.branch_name.label("branch_name"),
                User.name.label("created_by_name")
            )
            .outerjoin(Branch, Test_registration.branch_id == Branch.id)
            .outerjoin(User, Test_registration.created_by == User.id)
            .filter(Test_registration.id == test_id)
            .first()
        )
        if not result:
            return {"error": "Test Registration not found"}, 404

        t, branch_name, created_by_name = result
        return _format_test_registration(t, branch_name, created_by_name), 200

    except SQLAlchemyError as e:
        return {"error": str(e.__dict__.get("orig", e))}, 500

# 🔹 Update
def update_test_registration(test_id, data):
    try:
        t = Test_registration.query.get(test_id)
        if not t:
            return {"error": "Test Registration not found"}, 404

        if data.get("test_name"):
            t.test_name = data["test_name"]
        if "sample_collection" in data:
            t.sample_collection = data["sample_collection"]
        if "department_id" in data:
            t.department_id = data["department_id"]
        if "charges" in data:
            t.charges = data["charges"]
        if "required_days" in data:
            t.required_days = data["required_days"]
        if "sequence_no" in data:
            t.sequence_no = data["sequence_no"]
        if "no_of_films" in data:
            t.no_of_films = data["no_of_films"]
        if "description" in data:
            t.description = data["description"]
        if "branch_id" in data:
            t.branch_id = data["branch_id"]
        if "updated_by" in data:
            t.updated_by = data["updated_by"]

        db.session.commit()
        return {"message": "Test Registration updated successfully"}, 200

    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get("orig", e))}, 500

# 🔹 Toggle Status
def toggle_test_registration_status(test_id, is_active):
    try:
        t = Test_registration.query.get(test_id)
        if not t:
            return {"error": "Test Registration not found"}, 404

        t.is_active = bool(is_active)
        db.session.commit()
        return {"message": f"Test Registration {'activated' if t.is_active else 'deactivated'} successfully"}, 200

    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get("orig", e))}, 500
