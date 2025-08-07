from flask import flash, redirect, render_template, jsonify, request, session, url_for
from app.blueprints.main import main_bp
from app.blueprints.main.services import create_user, get_user_by_email
from werkzeug.security import check_password_hash

@main_bp.route('/')
def home():
    return render_template('login.html')



@main_bp.route('/dashboard')
def dashboard():
    return render_template('base.html')

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
    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')

        if not email or not password:
            flash('Email and password are required.', 'error')
            return redirect(url_for('main.login'))

        user = get_user_by_email(email=email)
        print(user)
        if user and check_password_hash(user.password, password):
            session['user_id'] = user.id
            session['user_email'] = user.email
            flash('Login successful!', 'success')
            return redirect(url_for('main.dashboard'))
        else:
            flash('Invalid email or password.', 'error')
            return redirect(url_for('main.login'))

    return render_template('login.html')
