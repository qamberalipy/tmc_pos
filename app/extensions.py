from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

# Initialize extension instances (but not bind to app yet)
db = SQLAlchemy()
migrate = Migrate()
