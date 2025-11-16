from flask import redirect, render_template,request,jsonify,session, url_for
from . import admin_bp
from app.blueprints.admin import services as admin_services
from app.decorators import login_required
# @admin_bp.route('/')
# def dashboard():
#     return render_template('admin/dashboard.html')

@admin_bp.route('/admin/branch')
@login_required
def view_branch():
    try:
        return render_template('branch.html')
    except Exception as e:
        print(f"Error in view_branch: {str(e)}")
        return redirect(url_for('main.error_page'))
    
@admin_bp.route('/admin/dashboard')
@login_required
def view_admin_dashboard():
    try:
        return render_template('admin_dashboard.html')
    except Exception as e:
        print(f"Error in dashboard: {str(e)}")
        return redirect(url_for('main.error_page'))

@admin_bp.route('/create/branch', methods=['POST'])
def create_branch():
    data = request.get_json()
    data['created_by'] = session.get('user_id')
    result = admin_services.create_branch(data)
    return jsonify(result), 201

@admin_bp.route('/branch/<int:branch_id>', methods=['PUT'])
def update_branch(branch_id):
    data = request.get_json()
    data['updated_by'] = session.get('user_id')
    result = admin_services.update_branch(branch_id, data)
    return jsonify(result), 200

@admin_bp.route('/branches', methods=['GET'])
def get_all_branches():
    result = admin_services.get_all_branches()
    return jsonify(result), 200

@admin_bp.route('/branch/<int:branch_id>', methods=['GET'])
def get_branch_by_id(branch_id):
    result = admin_services.get_branch_by_id(branch_id)
    return jsonify(result), 200

@admin_bp.route('/branches/<int:branch_id>/toggle', methods=['POST'])
def toggle_branch_status(branch_id):
    data = request.get_json()  # expects {"is_active": true/false}
    result = admin_services.toggle_branch_status(branch_id, data.get('is_active'))
    return jsonify(result), 200

@admin_bp.route('/branch/list', methods=['GET'])
def get_all_branches_list():
    try:
        data = admin_services.get_all_branches_service()
        return jsonify(data), 200
    except Exception as e:
        print(f"Error fetching branches: {str(e)}")
        return jsonify({"status": "error", "message": "Something went wrong"}), 500

@admin_bp.route('/role/list', methods=['GET'])
def get_all_roles():
    try:
        data = admin_services.get_all_roles_service()
        return jsonify(data), 200
    except Exception as e:
        print(f"Error fetching roles: {str(e)}")
        return jsonify({"status": "error", "message": "Something went wrong"}), 500

@admin_bp.route('/department/list', methods=['GET'])
def get_all_departments():
    try:
        data = admin_services.get_all_department_service()
        return jsonify(data), 200
    except Exception as e:
        print(f"Error fetching departments: {str(e)}")
        return jsonify({"status": "error", "message": "Something went wrong"}), 500
