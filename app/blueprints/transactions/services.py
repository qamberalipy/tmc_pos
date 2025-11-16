from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import cast, String
from app.extensions import db
from app.models import Expense_head, Branch, User 
from app.models.expenses import Expenses

ALLOWED_PAYMENT_METHODS = {"Cash", "Card", "Online", "Other"}

def _format_expense(exp, branch_name=None, created_by_name=None, expense_head_name=None):
    return {
        "id": exp.id,
        "branch": branch_name,                        # from Branch
        "expense_head": expense_head_name,            # from Expense_head
        "amount": exp.amount,
        "description": exp.description,
        "is_deleted": exp.is_deleted,
        "ref_no": exp.ref_no,
        "payment_method": exp.payment_method,
        "paid_to": exp.paid_to,
        "created_by": created_by_name,                # from User
        "updated_by": exp.updated_by,
        "created_at": exp.created_at,
        "updated_at": exp.updated_at,
    }

# Create
def create_expense(data):
    try:
        # Required fields
        if not data.get("Branch_id"):
            return {"error": "Branch_id is required"}, 400
        if not data.get("created_by"):
            return {"error": "created_by is required"}, 400
        if not data.get("expense_head_id"):
            return {"error": "expense_head_id is required"}, 400
        if data.get("amount") is None:
            return {"error": "amount is required"}, 400

        # Validate/convert
        try:
            amount = int(data["amount"])
        except (TypeError, ValueError):
            return {"error": "amount must be an integer"}, 400

        try:
            expense_head_id = int(data["expense_head_id"])
        except (TypeError, ValueError):
            return {"error": "expense_head_id must be an integer"}, 400

        payment_method = data.get("payment_method", "Cash")
        if payment_method not in ALLOWED_PAYMENT_METHODS:
            return {"error": f"payment_method must be one of {sorted(ALLOWED_PAYMENT_METHODS)}"}, 400

        exp = Expenses(
            Branch_id=str(data["Branch_id"]),
            expense_head_id=expense_head_id,
            amount=amount,
            description=data.get("description"),
            is_deleted=False,  # soft-delete default
            ref_no=data.get("ref_no"),
            payment_method=payment_method,
            paid_to=data.get("paid_to"),
            created_by=str(data["created_by"]),
            updated_by=str(data.get("created_by"))  # initial updated_by = creator
        )
        db.session.add(exp)
        db.session.commit()
        return {"message": "Expense created successfully", "id": exp.id}, 201
    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get("orig", e))}, 500

# Get All (joined: Branch name, User name, Expense_head name)
def get_all_expenses(branch_id_str=None):
    try:
        query = (
            db.session.query(
                Expenses,
                Branch.branch_name.label("branch_name"),
                User.name.label("created_by_name"),
                Expense_head.name.label("expense_head_name")
            )
            .join(Branch, cast(Branch.id, String) == Expenses.Branch_id)
            .join(User, cast(User.id, String) == Expenses.created_by)
            .join(Expense_head, Expense_head.id == Expenses.expense_head_id)
            .filter(Expenses.is_deleted == False)  # show only active by default
        )

        if branch_id_str:
            query = query.filter(Expenses.Branch_id == str(branch_id_str))

        results = query.all()

        return [
            _format_expense(e, branch_name, created_by_name, expense_head_name)
            for e, branch_name, created_by_name, expense_head_name in results
        ], 200
    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get("orig", e))}, 500

# Get One by ID (joined)
def get_expense_by_id(expense_id):
    try:
        result = (
            db.session.query(
                Expenses,
                Branch.branch_name.label("branch_name"),
                User.name.label("created_by_name"),
                Expense_head.name.label("expense_head_name")
            )
            .outerjoin(Branch, cast(Branch.id, String) == Expenses.Branch_id)
            .outerjoin(User, cast(User.id, String) == Expenses.created_by)
            .outerjoin(Expense_head, Expense_head.id == Expenses.expense_head_id)
            .filter(Expenses.id == expense_id)
            .first()
        )
        if not result:
            return {"error": "Expense not found"}, 404

        e, branch_name, created_by_name, expense_head_name = result
        return _format_expense(e, branch_name, created_by_name, expense_head_name), 200
    except SQLAlchemyError as e:
        return {"error": str(e.__dict__.get("orig", e))}, 500

# Update (allow updating any field)
def update_expense(expense_id, data):
    try:
        exp = Expenses.query.get(expense_id)
        if not exp:
            return {"error": "Expense not found"}, 404

        if "Branch_id" in data and data["Branch_id"] is not None:
            exp.Branch_id = str(data["Branch_id"])

        if "expense_head_id" in data and data["expense_head_id"] is not None:
            try:
                exp.expense_head_id = int(data["expense_head_id"])
            except (TypeError, ValueError):
                return {"error": "expense_head_id must be an integer"}, 400

        if "amount" in data and data["amount"] is not None:
            try:
                exp.amount = int(data["amount"])
            except (TypeError, ValueError):
                return {"error": "amount must be an integer"}, 400

        if "description" in data:
            exp.description = data.get("description")

        if "ref_no" in data:
            exp.ref_no = data.get("ref_no")

        if "payment_method" in data and data["payment_method"] is not None:
            if data["payment_method"] not in ALLOWED_PAYMENT_METHODS:
                return {"error": f"payment_method must be one of {sorted(ALLOWED_PAYMENT_METHODS)}"}, 400
            exp.payment_method = data["payment_method"]

        if "paid_to" in data:
            exp.paid_to = data.get("paid_to")

        if "is_deleted" in data:
            exp.is_deleted = bool(data["is_deleted"])

        if "updated_by" in data and data["updated_by"] is not None:
            exp.updated_by = str(data["updated_by"])

        db.session.commit()
        return {"message": "Expense updated successfully"}, 200
    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get("orig", e))}, 500

# Toggle soft delete
def toggle_expense_deleted(expense_id, is_deleted):
    try:
        exp = Expenses.query.get(expense_id)
        if not exp:
            return {"error": "Expense not found"}, 404

        exp.is_deleted = bool(is_deleted)
        db.session.commit()
        state = "deleted" if exp.is_deleted else "restored"
        return {"message": f"Expense {state} successfully"}, 200
    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get("orig", e))}, 500