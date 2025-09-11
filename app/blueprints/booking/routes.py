from flask import redirect, render_template,request,jsonify,session, url_for
from . import booking_bp
from app.blueprints.booking import services as booking_services
from app.decorators import login_required


@booking_bp.route('/view/test-booking')
@login_required
def view_test_booking():
    try:
        return render_template('test_booking.html')
    except Exception as e:
        print(f"Error in view_test_booking: {str(e)}")
        return redirect(url_for('main.error_page'))
    
@booking_bp.route('/create/', methods=['POST'])
def create_booking():
    data = request.get_json()
    data['create_by'] = session.get('user_id')
    data['branch_id'] = session.get('branch_id')
    print("Booking Data:", data)
    try:
        result = booking_services.create_test_booking(data)
        return jsonify(result), 201
    except Exception as e:
        print(f"Error in create_booking: {str(e)}")
        return jsonify({"error": "Failed to create booking"}), 400