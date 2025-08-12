from flask import Flask
from app.config import Config
from app.extensions import db, migrate
from app.blueprints.main import main_bp
from app.blueprints.admin import admin_bp
def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    app.secret_key = 'your-secret-key'  # Needed for flash/session
    db.init_app(app)
    migrate.init_app(app, db)
    app.register_blueprint(main_bp)
    app.register_blueprint(admin_bp, url_prefix='/admin')
    # Import all models so Flask-Migrate can detect them
    with app.app_context():
        from app import models

    return app
