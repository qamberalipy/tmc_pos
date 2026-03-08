from flask import redirect, render_template,request,jsonify,session, url_for
from . import users_bp
from sqlalchemy import func
from app.blueprints.users import services as users_services
from app.models.shift import ShiftSession
from app.decorators import login_required
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from app.models.branch import Branch


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

@users_bp.route("/user/staff/<int:branch_id>", methods=["GET"])
def get_all_staff_users(branch_id):
    result, status = users_services.get_all_staff_users(branch_id)
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

@users_bp.route("/shift/status", methods=["GET"])
@login_required
def api_shift_status():
    user_id = session.get("user_id")
    # Always query the database as the absolute source of truth
    active_shift = ShiftSession.query.filter_by(user_id=user_id, status='Open').first()
    
    if active_shift:
        # Sync session just in case it was lost
        session["active_shift_id"] = active_shift.id
        return jsonify({
            "is_active": True,
            "shift_id": active_shift.id,
            "start_time": active_shift.start_time.isoformat()
        }), 200
        
    # Clear session if no active shift is found in DB
    session.pop("active_shift_id", None)
    return jsonify({"is_active": False}), 200

@users_bp.route("/shift/start", methods=["POST"])
@login_required
def api_start_shift():
    try:
        user_id = session.get("user_id")
        branch_id = session.get("branch_id")
        shift = users_services.start_user_shift(user_id, branch_id)
        
        session["active_shift_id"] = shift.id 
        return jsonify({
            "message": "Shift started",
            "shift_id": shift.id,
            "start_time": shift.start_time.isoformat() 
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@users_bp.route("/shift/end", methods=["POST"])
@login_required
def api_end_shift():
    try:
        user_id = session.get("user_id")
        users_services.end_user_shift(user_id)
        session.pop("active_shift_id", None)
        return jsonify({"message": "Shift ended successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@users_bp.route("/user-shifts/<int:user_id>", methods=["GET"])
@login_required
def get_user_shifts(user_id):
    date_str = request.args.get("date") # Expected format: 'YYYY-MM-DD'
    if not date_str:
        return jsonify({"error": "Date is required"}), 400

    branch_id = session.get("branch_id")
    
    # 1. Get the Branch's Timezone from DB (e.g., 'Asia/Karachi')
    branch = Branch.query.get(branch_id)
    tz_string = branch.timezone if branch and hasattr(branch, 'timezone') and branch.timezone else "UTC"
    
    try:
        local_tz = ZoneInfo(tz_string)
    except Exception:
        local_tz = timezone.utc

    # 2. CREATE LAB-DAY BOUNDARIES (8:00 AM to 4:00 AM Next Day)
    target_date = datetime.strptime(date_str, "%Y-%m-%d")
    
    # Start at 8:00 AM Local Time
    start_of_day_local = target_date.replace(hour=8, minute=0, second=0, tzinfo=local_tz)
    # End at 4:00 AM Local Time Next Day (20 hours later)
    end_of_day_local = start_of_day_local + timedelta(hours=20)

    # 3. Convert these local boundaries to exact UTC timestamps
    start_utc = start_of_day_local.astimezone(timezone.utc)
    end_utc = end_of_day_local.astimezone(timezone.utc)

    # 4. Query Database (Comparing UTC to UTC safely)
    shifts = ShiftSession.query.filter(
        ShiftSession.user_id == user_id,
        ShiftSession.start_time >= start_utc,
        ShiftSession.start_time < end_utc
    ).all()
    
    # 5. Format DB output back to Local Time for frontend display
    response_data = []
    for s in shifts:
        local_start = s.start_time.astimezone(local_tz)
        local_end = s.end_time.astimezone(local_tz) if s.end_time else None
        
        start_str = local_start.strftime('%I:%M %p')
        end_str = local_end.strftime('%I:%M %p') if local_end else 'Active'
        
        response_data.append({
            "id": s.id, 
            "label": f"{start_str} to {end_str}"
        })

    return jsonify(response_data), 200