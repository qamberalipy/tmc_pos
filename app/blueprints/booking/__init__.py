from flask import Blueprint

booking_bp = Blueprint('booking', __name__, template_folder='templates', static_folder='static')

from . import routes  # Import routes to register endpoints