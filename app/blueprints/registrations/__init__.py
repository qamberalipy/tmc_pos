from flask import Blueprint

registrations_bp = Blueprint('registrations', __name__, template_folder='templates', static_folder='static')

from . import routes  # Import routes to register endpoints