from flask import redirect, render_template,request,jsonify,session, url_for
from . import booking_bp
from app.blueprints.users import services as users_services
from app.decorators import login_required


@booking_bp.route('/view/test-booking')
@login_required
def view_test_booking():
    try:
        return render_template('test_booking.html')
    except Exception as e:
        print(f"Error in view_test_booking: {str(e)}")
        return redirect(url_for('main.error_page'))
    
