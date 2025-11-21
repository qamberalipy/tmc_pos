from flask import redirect, render_template,request,jsonify,session, url_for
from . import booking_bp
from app.blueprints.booking import services as booking_services
from app.decorators import login_required
from app.extensions import db

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
@booking_bp.route('/view/films-audit')
@login_required
def view_films_audit():
    try:
        return render_template('films_audit.html')
    except Exception as e:
        print(f"Error in view_films_audit: {str(e)}")
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

@booking_bp.route("/films/", methods=["POST"])
def edit_film_usage():
    data = request.get_json()
    edited_by = session.get("user_id")

    result, status = booking_services.edit_film_usage_by_booking(
        data.get("booking_id"),
        data.get("new_films_used"),
        data.get("usage_type"),
        edited_by,
        data.get("reason")
    )

    print("Edit Film Usage Response:", result, status)
    return jsonify(result), status

@booking_bp.route("/inventory/", methods=["POST"])
def create_inventory():
    data = request.get_json()
    result= booking_services.inventory_transaction(
        data.get("quantity"), 
        data.get("transaction_type"),
        session.get("user_id"), 
        session.get("branch_id")
    )

    if not result.id:
        return jsonify({"message": "Failed to create inventory transaction"}), 400
    print("Inventory Adjustment Response:", result)
    db.session.commit()
    return jsonify({"message": "Inventory transaction created successfully"}), 201

@booking_bp.route("/inventory/summary", methods=["GET"])
def inventory_summary():
    try:
        from_date = request.args.get("from_date")
        to_date = request.args.get("to_date")
        branch_id = session.get("branch_id")

        result = booking_services.get_inventory_summary(
            from_date, to_date, branch_id
        )

        return jsonify(result), 200

    except Exception as e:
        print("Error:", e)
        return jsonify({"message": "Failed to fetch summary"}), 500

@booking_bp.route("/films-audit/data", methods=["GET"])
def fetch_films_audit_data():
    try:
        branch_id = session.get("branch_id")
        from_date = request.args.get("from_date")
        to_date = request.args.get("to_date")

        result, status = booking_services.get_films_audit(
            branch_id=branch_id,
            from_date=from_date,
            to_date=to_date
        )

        return jsonify(result), status

    except Exception as e:
        print("Error in fetch_films_audit_data:", str(e))
        return jsonify({"error": "Something went wrong"}), 500
