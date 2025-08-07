from flask import Blueprint

main_bp = Blueprint('main', __name__, template_folder='templates', static_folder='static',
    static_url_path='/static/main') 

from app.blueprints.main import routes  # Import routes here
