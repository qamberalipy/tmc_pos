from flask import Blueprint

users_bp = Blueprint('users', __name__, template_folder='templates', static_folder='static')

from . import routes  # Import routes to register endpoints