from flask import Blueprint

transaction_bp = Blueprint('transactions', __name__, template_folder='templates', static_folder='static')

from . import routes  # Import routes to register endpoints