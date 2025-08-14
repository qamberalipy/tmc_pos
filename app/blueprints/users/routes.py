from flask import render_template,request,jsonify,session
from . import users_bp
from app.blueprints.users import services as users_services
from app.decorators import login_required
# @users_bp.route('/')
# def dashboard():
#     return render_template('users/dashboard.html')

@users_bp.route('/view')
@login_required
def view_user():
    return render_template('users.html')


@users_bp.route("/user", methods=["POST"])
def create_user():
    data = request.get_json() or {}
    result, status = users_services.create_user(data)
    return jsonify(result), status

# Update User
@users_bp.route("/user/<int:user_id>", methods=["PUT"])
def update_user(user_id):
    data = request.get_json() or {}
    result, status = users_services.update_user(user_id, data)
    return jsonify(result), status

# Get All Users
@users_bp.route("/user", methods=["GET"])
def get_all_users():
    result, status = users_services.get_all_users()
    return jsonify(result), status

# Get User by ID
@users_bp.route("/user/<int:user_id>", methods=["GET"])
def get_user_by_id(user_id):
    result, status = users_services.get_user_by_id(user_id)
    return jsonify(result), status

# Activate / Deactivate User
@users_bp.route("/user/<int:user_id>/status", methods=["PATCH"])
def toggle_user_status(user_id):
    data = request.get_json() or {}
    if "is_active" not in data:
        return jsonify({"error": "is_active is required"}), 400
    result, status = users_services.toggle_user_status(user_id, data.get("is_active"))
    return jsonify(result), status
