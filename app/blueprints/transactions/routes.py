from flask import redirect, render_template,request,jsonify,session, url_for
from . import transaction_bp
from app.blueprints.transactions import services as transactions_services
from app.decorators import login_required


@transaction_bp.route('/view_expenses')
@login_required
def view_expenses():
    # Logic to retrieve and display expenses
    return render_template('view_expenses.html')

@transaction_bp.route("/expenses/view_referral_share")
@login_required
def view_referral_share():
    return render_template("referral_shares.html")

@transaction_bp.route("/expenses", methods=["POST"])
def create_expense():
    data = request.get_json() or {}

    # Pull from session when available (model uses strings)
    uid = session.get("user_id")
    bid = session.get("branch_id")
    if uid is not None:
        data["created_by"] = str(uid)
    if bid is not None:
        data["Branch_id"] = str(bid)

    result, status = transactions_services.create_expense(data)
    return jsonify(result), status


@transaction_bp.route("/expenses", methods=["GET"])
def fetch_expenses():
    role = session.get("role", "").lower()
    branch_id = None if role == "admin" else session.get("branch_id")
    branch_id_str = None if branch_id is None else str(branch_id)

    # --- NEW: Get Params ---
    from_date = request.args.get('from_date')
    to_date = request.args.get('to_date')

    # Pass them to service
    result, status = transactions_services.get_all_expenses(branch_id_str, from_date, to_date)
    return jsonify(result), status


@transaction_bp.route("/expenses/<int:expense_id>", methods=["GET"])
def get_expense_by_id(expense_id):
    result, status = transactions_services.get_expense_by_id(expense_id)
    return jsonify(result), status


@transaction_bp.route("/expenses/<int:expense_id>", methods=["PUT"])
def update_expense(expense_id):
    data = request.get_json() or {}
    uid = session.get("user_id")
    if uid is not None:
        data["updated_by"] = str(uid)

    result, status = transactions_services.update_expense(expense_id, data)
    return jsonify(result), status


@transaction_bp.route("/expenses/<int:expense_id>/deleted", methods=["PATCH"])
def toggle_expense_deleted(expense_id):
    data = request.get_json() or {}
    if "is_deleted" not in data:
        return jsonify({"error": "is_deleted is required"}), 400
    result, status = transactions_services.toggle_expense_deleted(expense_id, data.get("is_deleted"))
    return jsonify(result), status

