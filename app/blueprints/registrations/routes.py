from flask import redirect, render_template,request,jsonify,session, url_for
from . import registrations_bp
from app.blueprints.registrations import services as registrations_services
from app.decorators import login_required


@registrations_bp.route('/add-test')
@login_required
def test_registration():
    try:
        return render_template('add_test.html')
    except Exception as e:
        print(f"Error in test_registration: {str(e)}")
        return redirect(url_for('main.error_page'))

@registrations_bp.route('/view-test')
@login_required
def view_test_registration():
    try:
        return render_template('view_test.html')
    except Exception as e:
        print(f"Error in view_test_registration: {str(e)}")
        return redirect(url_for('main.error_page'))
    
@registrations_bp.route('/referred-registration')
@login_required
def referred_registration():
    try:
        return render_template('referred_reg.html')
    except Exception as e:
        print(f"Error in referred_registration: {str(e)}")
        return redirect(url_for('main.error_page'))

@registrations_bp.route('/expense-registration')
@login_required
def expense_registration():
    try:
        return render_template('expense_head.html')
    except Exception as e:
        print(f"Error in expense_registration: {str(e)}")
        return redirect(url_for('main.error_page'))


# Create Expense Head
@registrations_bp.route("/expense-head", methods=["POST"])
def create_expense_head():
    data = request.get_json() or {}
    # name, branch_id, created_by are required (service validates)
    data["created_by"] = session.get("user_id")  # from session
    data["branch_id"] = session.get("branch_id")  # from session
    result, status = registrations_services.create_expense_head(data)
    return jsonify(result), status

# Get All Expense Heads (with branch_name & created_by username)
@registrations_bp.route("/expense-head", methods=["GET"])
def fetch_expense_heads():
    role = session.get("role", "").lower()
    branch_id = None if role == "admin" else session.get("branch_id")

    result, status = registrations_services.get_all_expense_heads(branch_id)
    return jsonify(result), status

# Get Expense Head by ID (with branch_name & created_by username)
@registrations_bp.route("/expense-head/<int:head_id>", methods=["GET"])
def get_expense_head_by_id(head_id):
    result, status = registrations_services.get_expense_head_by_id(head_id)
    return jsonify(result), status

# Update Expense Head (only name, branch_id, updated_by)
@registrations_bp.route("/expense-head/<int:head_id>", methods=["PUT"])
def update_expense_head(head_id):

    data = request.get_json() or {}
    data["updated_by"] = session.get("user_id")  # from session
    result, status = registrations_services.update_expense_head(head_id, data)
    return jsonify(result), status

# Activate / Deactivate Expense Head
@registrations_bp.route("/expense-head/<int:head_id>/status", methods=["PATCH"])
def toggle_expense_head_status(head_id):
    data = request.get_json() or {}
    if "is_active" not in data:
        return jsonify({"error": "is_active is required"}), 400
    result, status = registrations_services.toggle_expense_head_status(head_id, data.get("is_active"))
    return jsonify(result), status
@registrations_bp.route('/expense-head/list', methods=['GET'])
def get_all_expense_heads_list():
    try:
        data = registrations_services.get_all_expense_head_list(session.get("branch_id"))
        return jsonify(data), 200
    except Exception as e:
        print(f"Error in get_all_expense_heads_list: {str(e)}")
        return jsonify({"error": "An error occurred"}), 500

@registrations_bp.route("/referred", methods=["POST"])
def create_referred():
    data = request.get_json() or {}
    data["created_by"] = session.get("user_id")  # from session
    data["branch_id"] = session.get("branch_id")  # from session
    result, status = registrations_services.create_referred(data)
    return jsonify(result), status

# Get All
@registrations_bp.route("/referred", methods=["GET"])
def get_all_referred():
    role = session.get("role", "").lower()
    branch_id = None if role == "admin" else session.get("branch_id")
    result, status = registrations_services.get_all_referred(branch_id)
    return jsonify(result), status

# Get One
@registrations_bp.route("/referred/<int:referred_id>", methods=["GET"])
def get_referred_by_id(referred_id):
    result, status = registrations_services.get_referred_by_id(referred_id)
    return jsonify(result), status

# Update
@registrations_bp.route("/referred/<int:referred_id>", methods=["PUT"])
def update_referred(referred_id):
    data = request.get_json() or {}
    result, status = registrations_services.update_referred(referred_id, data)
    return jsonify(result), status

# Toggle Status
@registrations_bp.route("/referred/<int:referred_id>/status", methods=["PATCH"])
def toggle_referred_status(referred_id):
    data = request.get_json() or {}
    if "is_active" not in data:
        return jsonify({"error": "is_active is required"}), 400
    result, status = registrations_services.toggle_referred_status(referred_id, data.get("is_active"))
    return jsonify(result), status

@registrations_bp.route('/referred/list', methods=['GET'])
def get_all_referred_list():
    try:
        data = registrations_services.get_all_referred_service(session.get("branch_id"))
        return jsonify(data), 200
    except Exception as e:
        print(f"Error in get_all_referred_list: {str(e)}")
        return jsonify({"error": "An error occurred"}), 500


# Create
@registrations_bp.route("/test-registration", methods=["POST"])
def create_test_registration():
    data = request.get_json() or {}
    data["created_by"] = session.get("user_id")  # from session
    data["branch_id"] = session.get("branch_id")  # from session
    result, status = registrations_services.create_test_registration(data)
    return jsonify(result), status

# Get All
@registrations_bp.route("/test-registration", methods=["GET"])
def get_all_test_registrations():
    role = session.get("role", "").lower()
    branch_id = None if role == "admin" else session.get("branch_id")
    result, status = registrations_services.get_all_test_registrations(branch_id)
    return jsonify(result), status

# Get One
@registrations_bp.route("/test-registration/<int:test_id>", methods=["GET"])
def get_test_registration_by_id(test_id):
    result, status = registrations_services.get_test_registration_by_id(test_id)
    return jsonify(result), status

# Update
@registrations_bp.route("/test-registration/<int:test_id>", methods=["PUT"])
def update_test_registration(test_id):
    data = request.get_json() or {}
    data["updated_by"] = session.get("user_id")  # from session
    result, status = registrations_services.update_test_registration(test_id, data)
    return jsonify(result), status

# Toggle Status
@registrations_bp.route("/test-registration/<int:test_id>/status", methods=["PATCH"])
def toggle_test_registration_status(test_id):
    data = request.get_json() or {}
    if "is_active" not in data:
        return jsonify({"error": "is_active is required"}), 400
    result, status = registrations_services.toggle_test_registration_status(test_id, data.get("is_active"))
    return jsonify(result), status

@registrations_bp.route('/test/list', methods=['GET'])
def get_all_tests_list():
    try:
        data = registrations_services.get_all_test_list(session.get("branch_id"))
        return jsonify(data), 200
    except Exception as e:
        print(f"Error in get_all_tests_list: {str(e)}")
        return jsonify({"error": "An error occurred"}), 500
