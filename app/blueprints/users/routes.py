from flask import redirect, render_template,request,jsonify,session, url_for
from . import users_bp
from app.blueprints.users import services as users_services
from app.decorators import login_required
# @users_bp.route('/')
# def dashboard():
#     return render_template('users/dashboard.html')

@users_bp.route('/view')
@login_required
def view_user():
    try:
        return render_template('users.html')
    except Exception as e:
        print(f"Error in view_user: {str(e)}")
        return redirect(url_for('main.error_page'))
    
@users_bp.route('/profile')
@login_required
def profile():
    try:
        return render_template('profile_setting.html')
    except Exception as e:
        print(f"Error in profile: {str(e)}")
        return redirect(url_for('main.error_page'))

@users_bp.route('/update_signature', methods=['POST'])
@login_required
def update_signature():
    user_id = session.get('user_id')
    sig_name = request.form.get('sig_name')
    sig_degrees = request.form.get('sig_degrees')
    sig_title = request.form.get('sig_title')

    # 3. Call Service
    response_data, status_code = users_services.update_doctor_signature_service(
        user_id, 
        sig_name, 
        sig_degrees, 
        sig_title
    )

    # 4. Return JSON Response
    session['doctor_signature'] = {
            "name": sig_name.upper(),
            "degrees": sig_degrees.upper() if sig_degrees else "",
            "title": sig_title.upper()
        }
    session.modified = True
    return jsonify(response_data), status_code

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

# Update Email
@users_bp.route("/profile/email", methods=["PATCH"])
def update_user_email_and_name():
    data = request.get_json() or {}
    new_email = data.get("email", "").strip()
    new_name = data.get("name", "").strip()

    if not new_email:
        return jsonify({"error": "New email is required"}), 400
    if not new_name:
        return jsonify({"error": "New name is required"}), 400

    result, status = users_services.update_user_email_and_name(session.get("user_id"), new_email, new_name)
    if status == 200:

        session['user_name'] = new_name
        session['user_email'] = new_email
    print(f"Email update response: {result}")
    return jsonify(result), status


@users_bp.route("/profile/password", methods=["PATCH"])
def update_user_password():
    data = request.get_json() or {}
    if "password" not in data or not data["password"].strip():
        return jsonify({"error": "New password is required"}), 400

    result, status = users_services.update_user_password(session.get("user_id"), data["password"])
    return jsonify(result), status

@users_bp.route("/get_all_doctors", methods=["GET"])
def get_all_doctors():
    branch_id=session.get("branch_id")
    result, status = users_services.get_all_doctors(branch_id)
    return jsonify(result), status