from functools import wraps
from flask import session, redirect, url_for, flash

def login_required(f):
    """Require user to be logged in to access a route."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            flash('Please log in to access this page.', 'warning')
            return redirect(url_for('main.login'))
        return f(*args, **kwargs)
    return decorated_function


def role_required(*roles):
    """Require a specific role to access a route."""
    @wraps
    def wrapper(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'user_id' not in session:
                flash('Please log in to access this page.', 'warning')
                return redirect(url_for('main.login'))

            if session.get('user_role') not in roles:
                flash('You do not have permission to access this page.', 'danger')
                return redirect(url_for('main.login'))
            return f(*args, **kwargs)
        return decorated_function
    return wrapper

