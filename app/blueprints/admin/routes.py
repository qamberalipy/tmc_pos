from flask import render_template,request,jsonify,session
from . import admin_bp
from app.blueprints.admin import services as admin_services

# @admin_bp.route('/')
# def dashboard():
#     return render_template('admin/dashboard.html')

@admin_bp.route('/admin/branch')
def view_branch():
    return render_template('branch.html')


@admin_bp.route('/create/branch', methods=['POST'])
def create_branch():
    data = request.get_json()
    data['created_by'] = session.get('user_id')
    result = admin_services.create_branch(data)
    return jsonify(result), 201

@admin_bp.route('/branch/<int:branch_id>', methods=['PUT'])
def update_branch(branch_id):
    data = request.get_json()
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
