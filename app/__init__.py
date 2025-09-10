from flask import Flask, session
from app.config import Config
from app.extensions import db, migrate
from app.blueprints.main import main_bp
from app.blueprints.admin import admin_bp
from app.blueprints.users import users_bp
from app.blueprints.booking import booking_bp
from app.blueprints.registrations import registrations_bp
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
            'menu': menu
        }

    return app
