from flask import flash, redirect, render_template, jsonify, request, session, url_for
from app.blueprints.main import main_bp
from app.blueprints.main.services import create_user, get_user_by_email
from werkzeug.security import check_password_hash
from app.decorators import login_required
import git

@main_bp.route('/')
def home():
    return render_template('login.html')

@main_bp.route('/git_update', methods=['POST'])
def git_update():
    repo = git.Repo('./tmc_pos')
    origin = repo.remotes.origin
    repo.create_head('main',origin.refs.main).set_tracking_branch(origin.refs.main).checkout()
    origin.pull()
    return '', 200

@main_bp.route('/dashboard')
@login_required
def dashboard():
    try:
        return render_template('base.html')
    except Exception as e:
        return redirect(url_for('main.error_page'))

@main_bp.route('/error', methods=['GET'])
def error_page():
    return render_template('error_page.html')

@main_bp.route('/create_user', methods=['POST'])
def create_user_route():
    data = request.get_json()

    name = data.get('name')
    email = data.get('email')
    password = data.get('password')

    if not name or not email or not password:
        return jsonify({'error': 'Missing required fields'}), 400

    result = create_user(name, email, password)

    if 'error' in result:
        return jsonify(result), 400

    return jsonify(result), 201

@main_bp.route('/login', methods=['GET', 'POST'])
def login():
    try:
        if request.method == 'POST':
            email = request.form.get('email')
            password = request.form.get('password')

            if not email or not password:
                flash('Email and password are required.', 'error')
                return redirect(url_for('main.login'))

            print("Hello")
            user = get_user_by_email(email=email)
            print("MyDATA", user)

            if not user:
                flash('Invalid email or password.', 'error')
                return redirect(url_for('main.login'))

            # Check if user is active
            if not user.get('is_active', False):
                flash('User is deactivated', 'error')
                return redirect(url_for('main.login'))

            # Check password
            if check_password_hash(user.get('password'), password):
                session['user_id'] = user.get('id')
                session['user_name'] = user.get('name')
                session['user_email'] = user.get('email')
                session['user_role'] = user.get('role')
                session['role_id'] = user.get('role_id')
                session['branch_id'] = user.get('branch_id')
                flash('Login successful!', 'success')
                return redirect(url_for('admin.view_admin_dashboard'))
            else:
                flash('Invalid email or password.', 'error')
                return redirect(url_for('main.login'))

        return render_template('login.html')
    except Exception as e:
        print(f"Error in login: {str(e)}")
        return e

@main_bp.route('/logout')
def logout():
    try:
        session.clear()
        flash('You have been logged out successfully.', 'success')
        return redirect(url_for('main.login'))  # redirect to login page
    except Exception as e:
        print(f"Error in logout: {str(e)}")
        return redirect(url_for('main.error_page'))