from flask import Flask, session, request, jsonify, redirect, url_for, flash, render_template
from app.config import Config
from app.extensions import db, migrate
from app.blueprints.main import main_bp
from app.blueprints.admin import admin_bp
from app.blueprints.users import users_bp
from app.blueprints.booking import booking_bp
from app.blueprints.registrations import registrations_bp
from app.blueprints.transactions import transaction_bp
from app.blueprints.reports import reports_bp
from app.blueprints.uploads import uploads_bp
from app.menu import MENU
def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    app.secret_key = 'your-secret-key'  # Needed for flash/session
    db.init_app(app)
    migrate.init_app(app, db)
    app.register_blueprint(main_bp)
    app.register_blueprint(admin_bp, url_prefix='/admin')
    app.register_blueprint(users_bp, url_prefix='/users')
    app.register_blueprint(registrations_bp, url_prefix='/registrations')
    app.register_blueprint(booking_bp, url_prefix='/booking')
    app.register_blueprint(transaction_bp, url_prefix='/transactions')
    app.register_blueprint(reports_bp, url_prefix='/reports')
    app.register_blueprint(uploads_bp, url_prefix='/uploads')
    # Import all models so Flask-Migrate can detect them
    with app.app_context():
        from app import models
    @app.context_processor
    def inject_user_data():
        role = session.get('user_role')
        menu=MENU.get(role, MENU['default'])
        return {
            'session_user_id': session.get('user_id'),
            'session_user_email': session.get('user_email'),
            'session_user_role': session.get('user_role'),
            'session_role_id': session.get('role_id'),
            'session_user_name': session.get('user_name'),
            'session_doctor_signature': session.get('doctor_signature'),
            'menu': menu
        }

    @app.before_request
    def enforce_active_shift():
        if 'user_id' not in session:
            return
        EXEMPT = {'main.login', 'main.logout',
                  'users.api_start_shift', 'users.api_end_shift', 'users.api_shift_status'}
        if request.endpoint in EXEMPT or (request.endpoint and request.endpoint.endswith('.static')):
            return
        from app.shift_guard import get_active_shift
        shift = get_active_shift(session['user_id'])
        if not shift:
            if request.path.startswith('/api') or request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest' or 'application/json' in request.headers.get('Accept', ''):
                return jsonify({"error": "shift_required", "message": "Please start your shift"}), 403
            return render_template('shift_gate.html'), 200

    return app
