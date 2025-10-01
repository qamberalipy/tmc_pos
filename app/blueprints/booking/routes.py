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

@booking_bp.route('/view/view-booking')
@login_required
def view_view_booking():
    try:
        return render_template('view_booking.html')
    except Exception as e:
        print(f"Error in view_view_booking: {str(e)}")
        return redirect(url_for('main.error_page'))


@booking_bp.route("/receipts")
@login_required
def views_receipt():

    return render_template('receipt.html')
    

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
    
@booking_bp.route("/receipt/<int:booking_id>")
@login_required
def view_receipt(booking_id):
    try:
        data, status = booking_services.get_booking_details(booking_id)

        if status != 200:
            # handle gracefully
            return render_template("error.html", message=data.get("error", "Unknown error")), status
        print("Receipt Data:", data)
        return render_template("receipt.html", booking=data)

    except Exception as e:
        print(f"Error in view_receipt: {str(e)}")
        return redirect(url_for("main.error_page"))

@booking_bp.route("/test-booking", methods=["GET"])
def get_all_test_bookings():
    role = session.get("role", "").lower()
    branch_id = None if role == "admin" else session.get("branch_id")
    result, status = booking_services.get_all_test_bookings(branch_id)
    print("All Bookings Data:", result)
    return jsonify(result), status

@booking_bp.route("/comments/<int:booking_id>", methods=["GET"])
def get_booking_comments(booking_id):
    data, status = booking_services.get_booking_details(booking_id)  # unpack tuple
    # print("Booking Comments Data:", data, status)

    if status != 200:
        return jsonify(data), status

    comments = data.get("technician_comments", {"comments": []})
    return jsonify(comments), 200

@booking_bp.route("/comments/<int:booking_id>", methods=["POST"])
def add_booking_comment(booking_id):
    data = request.get_json()
    print("working data:",data)
    result, status = booking_services.add_booking_comment(booking_id, data)
    print("Add Comment Response:", result, status)
    return jsonify(result), status


