from flask import render_template
from . import admin_bp

@admin_bp.route('/')
def dashboard():
    return render_template('admin/dashboard.html')

@admin_bp.route('/test-booking')
def test_booking():
    return render_template('admin/test_booking.html')