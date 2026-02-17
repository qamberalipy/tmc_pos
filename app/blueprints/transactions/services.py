import datetime,time 
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import cast, String
from app.extensions import db
from app.models import Expense_head, Branch, User 
from app.models.expenses import Expenses, PaymentTransaction

ALLOWED_PAYMENT_METHODS = {"Cash", "Card", "Online", "Other"}

def _format_expense(exp, branch_name=None, created_by_name=None, expense_head_name=None):
    return {
        "id": exp.id,
        "branch": branch_name,                        # from Branch
        "expense_head": expense_head_name, 
        "expense_head_id": exp.expense_head_id,                  # from Expense_head
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

def create_expense(data):
    """Creates an expense and an associated 'OUT' payment transaction."""
    try:
        # Required fields validation
        required_fields = ["Branch_id", "created_by", "expense_head_id", "amount"]
        if not all(data.get(field) for field in required_fields):
            return {"error": "Missing required fields: Branch_id, created_by, expense_head_id, amount"}, 400

        # Validate amount
        try:
            amount = float(data["amount"])
        except (TypeError, ValueError):
            return {"error": "Amount must be a valid number"}, 400

        payment_method = data.get("payment_method", "Cash")
        if payment_method not in ALLOWED_PAYMENT_METHODS:
            return {"error": f"Invalid payment method. Allowed: {ALLOWED_PAYMENT_METHODS}"}, 400

        # Start Atomic Transaction
        with db.session.begin():
            # 1. Create the Expense record
            exp = Expenses(
                branch_id=int(data["Branch_id"]),
                expense_head_id=int(data["expense_head_id"]),
                amount=amount,
                description=data.get("description"),
                is_deleted=False,
                ref_no=data.get("ref_no"),
                payment_method=payment_method,
                paid_to=data.get("paid_to"),
                created_by=int(data["created_by"]),
                updated_by=int(data.get("created_by"))
            )
            db.session.add(exp)
            db.session.flush() # Generates exp.id for the next step

            # 2. Create the PaymentTransaction record
            transaction = PaymentTransaction(
                branch_id=exp.branch_id,
                expense_id=exp.id,
                amount=exp.amount,
                direction="OUT",
                payment_type=payment_method,
                transaction_type="Expense",
                created_by=exp.created_by,
                payment_date=datetime.datetime.utcnow()
            )
            db.session.add(transaction)

        return {"message": "Expense created and transaction recorded successfully", "id": exp.id}, 201

    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get("orig", e))}, 500
    except Exception as e:
        return {"error": str(e)}, 500


def update_expense(expense_id, data):
    """Updates an expense and synchronizes the associated payment transaction."""
    try:
        exp = Expenses.query.get(expense_id)
        if not exp:
            return {"error": "Expense not found"}, 404

        # Update Descriptive Fields
        if "description" in data: exp.description = data.get("description")
        if "ref_no" in data: exp.ref_no = data.get("ref_no")
        if "paid_to" in data: exp.paid_to = data.get("paid_to")
        if "updated_by" in data: exp.updated_by = int(data["updated_by"])

        # Update Financial Fields and Sync
        if "amount" in data:
            try:
                exp.amount = float(data["amount"])
            except (TypeError, ValueError):
                return {"error": "Amount must be a valid number"}, 400

        if "payment_method" in data:
            if data["payment_method"] not in ALLOWED_PAYMENT_METHODS:
                return {"error": "Invalid payment method"}, 400
            exp.payment_method = data["payment_method"]

        # SYNC with PaymentTransaction
        trans = PaymentTransaction.query.filter_by(expense_id=expense_id).first()
        if trans:
            if "amount" in data: trans.amount = exp.amount
            if "payment_method" in data: trans.payment_type = exp.payment_method
            # Sync branch if it was updated
            if "Branch_id" in data: 
                exp.branch_id = int(data["Branch_id"])
                trans.branch_id = exp.branch_id

        db.session.commit()
        return {"message": "Expense and transaction updated successfully"}, 200

    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get("orig", e))}, 500


def toggle_expense_deleted(expense_id, is_deleted):
    """Soft deletes/restores an expense and removes/restores the transaction impact."""
    try:
        exp = Expenses.query.get(expense_id)
        if not exp:
            return {"error": "Expense not found"}, 404

        exp.is_deleted = bool(is_deleted)
        
        # Financial Integrity Sync
        if exp.is_deleted:
            # Remove from transaction table so it doesn't affect financial reports
            PaymentTransaction.query.filter_by(expense_id=expense_id).delete()
        else:
            # Re-create transaction if restored
            restored_trans = PaymentTransaction(
                branch_id=exp.branch_id,
                expense_id=exp.id,
                amount=exp.amount,
                direction="OUT",
                payment_type=exp.payment_method,
                transaction_type="Expense",
                created_by=exp.updated_by or exp.created_by,
                payment_date=datetime.datetime.utcnow()
            )
            db.session.add(restored_trans)
        
        db.session.commit()
        state = "deleted" if exp.is_deleted else "restored"
        return {"message": f"Expense {state} successfully"}, 200

    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get("orig", e))}, 500


def get_all_expenses(branch_id_str=None, from_date=None, to_date=None):
    try:
        # 1. Date Validation & Setup
        start_dt = None
        end_dt = None

        if from_date and to_date:
            try:
                # Parse strings to date objects
                from_date_obj = datetime.datetime.strptime(from_date, "%Y-%m-%d").date()
                to_date_obj   = datetime.datetime.strptime(to_date, "%Y-%m-%d").date()
            except ValueError:
                # Start/End date must be YYYY-MM-DD
                return {"error": "Date format must be YYYY-MM-DD."}, 400

            if from_date_obj > to_date_obj:
                return {"error": "from_date cannot be greater than to_date."}, 400

            # Create timestamps: Start of Day (00:00:00) -> End of Day (23:59:59)
            start_dt = datetime.datetime.combine(from_date_obj, datetime.time.min)
            end_dt   = datetime.datetime.combine(to_date_obj, datetime.time.max)

        elif from_date or to_date:
            # If only one date is provided, raise error
            return {"error": "Both from_date and to_date are required for date filtering."}, 400

        # 2. Base Query
        query = (
            db.session.query(
                Expenses,
                Branch.branch_name.label("branch_name"),
                User.name.label("created_by_name"),
                Expense_head.name.label("expense_head_name")
            )
            .join(Branch, Branch.id == Expenses.branch_id)
            .join(User, User.id == Expenses.created_by)
            .join(Expense_head, Expense_head.id == Expenses.expense_head_id)
            .filter(Expenses.is_deleted == False)
        )

        # 3. Apply Filters
        if branch_id_str:
            query = query.filter(Expenses.branch_id == int(branch_id_str))

        if start_dt and end_dt:
            query = query.filter(
                Expenses.created_at >= start_dt, 
                Expenses.created_at <= end_dt
            )

        # 4. Execute & Format
        results = query.order_by(Expenses.created_at.desc()).all()

        return [
            _format_expense(e, branch_name, created_by_name, expense_head_name)
            for e, branch_name, created_by_name, expense_head_name in results
        ], 200

    except SQLAlchemyError as e:
        db.session.rollback()
        print(f"Database Error: {str(e)}")
        return {"error": str(e.__dict__.get("orig", e))}, 500
    except Exception as e:
        print(f"General Error: {str(e)}")
        return {"error": str(e)}, 500
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
            .outerjoin(Branch, Branch.id == Expenses.branch_id)
            .outerjoin(User, User.id == Expenses.created_by)
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
