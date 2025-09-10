from flask import Blueprint

registrations_bp = Blueprint('  ', __name__, template_folder='templates', static_folder='static')

from . import routes  # Import routes to register endpoints