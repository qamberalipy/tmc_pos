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
def view_films_usage():
    try:
        return render_template('films_usage.html')
    except Exception as e:
        print(f"Error in view_films_usage: {str(e)}")
        return redirect(url_for('main.error_page'))

@booking_bp.route('/view/films-inventory-audit')
@login_required
def view_films_inventory_audit():
    try:
        return render_template('films_inventory.html')
    except Exception as e:
        print(f"Error in view_films_inventory_audit: {str(e)}")
        return redirect(url_for('main.error_page'))
@booking_bp.route('/view/booking-result')
@login_required
def view_booking_result():
    try:
        return render_template('view_booking_result.html')
    except Exception as e:
        print(f"Error in view_booking_result: {str(e)}")
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
        print("Create Booking Response:", result)
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
    from_date = request.args.get("from_date")
    to_date = request.args.get("to_date")
    result, status = booking_services.get_all_test_bookings(branch_id, from_date, to_date)
    print("All Bookings Data:", result)
    return jsonify(result), status

@booking_bp.route("/test-booking/<int:booking_id>", methods=["GET"])
def get_test_booking(booking_id):
    try:
        print("Fetching booking details for ID:", booking_id)
        result, status = booking_services.get_booking_details(booking_id)
        print("Single Booking Data:", result)
        return jsonify(result), status
    except Exception as e:
        print(f"Error in get_test_booking: {str(e)}")
        return jsonify({"error": "Failed to fetch booking details"}), 400

@booking_bp.route("/view_dues", methods=["GET"])
@login_required
def view_dues():
    try:
        return render_template('view_dues.html')
    except Exception as e:
        print(f"Error in view_dues: {str(e)}")
        return redirect(url_for('main.error_page'))

@booking_bp.route("/dues", methods=["GET"])
def get_branch_dues():
    branch_id = session.get("branch_id")
    to_date = request.args.get("to_date")
    from_date = request.args.get("from_date")
    result, status = booking_services.get_dues_list(branch_id, from_date, to_date)
    return jsonify(result), status 

@booking_bp.route("/clear-due/<int:booking_id>", methods=["POST"])
def clear_booking_due_api(booking_id):
 
    
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Unauthorized access. Please login."}), 401

    # 2. Get Payload
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is missing"}), 400

    amount_to_pay = data.get("amount")
    payment_type = data.get("payment_type")

    # 3. Basic Validation
    if amount_to_pay is None:
        return jsonify({"error": "Amount is required"}), 400
    
    if not payment_type:
        return jsonify({"error": "Payment type is required"}), 400
    
    result, status = booking_services.clear_booking_due(
        booking_id=booking_id,
        amount_to_pay=amount_to_pay,
        payment_type=payment_type,
        user_id=user_id
    )

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
        data.get("test_id"),
        data.get("films_under_test"),
        data.get("total_new_films_used"),
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


@booking_bp.route("/get-film-inventory-report", methods=["GET"])
def get_inventory_report():
    branch_id = session.get("branch_id")
    from_date = request.args.get("from_date")
    to_date = request.args.get("to_date")
    print("Fetching films audit data for:", branch_id, from_date, to_date)
    result, status = booking_services.get_film_inventory_report(
        branch_id=branch_id,
        from_date=from_date,
        to_date=to_date
    )
    return jsonify(result), status

@booking_bp.route("/get-films-by-booking/<int:booking_id>", methods=["GET"])
def get_films_by_booking(booking_id):
    result, status = booking_services.get_test_details_booking(booking_id=booking_id)
    return jsonify(result), status

@booking_bp.route("/update-film-status", methods=["POST"])
def update_film_status():
    data = request.get_json()
    
    # Extract data from request
    booking_id = data.get("booking_id")
    test_id = data.get("test_id")
    film_issued = data.get("film_issued")

    # Simple validation
    if booking_id is None or test_id is None:
        return jsonify({"error": "Missing required fields"}), 400

    # Call the service function
    result, status = booking_services.update_test_film_status(
        booking_id=booking_id, 
        test_id=test_id, 
        film_issued=film_issued
    )
    
    return jsonify(result), status

@booking_bp.route('/referral-shares/list', methods=['GET'])
def list_referral_shares():
    
    filters = {
        "branch_id": session.get('branch_id'), # Enforce session branch
        "referred_id": request.args.get('referred_id'),
        "from_date": request.args.get('from_date'),
        "to_date": request.args.get('to_date'),
        "is_paid": request.args.get('is_paid')
    }
    
    response, status = booking_services.get_referral_shares_service(filters)
    print("Referral Shares List Response:", response)
    return jsonify(response), status

@booking_bp.route('/referral-shares/<int:share_id>/toggle-payment', methods=['POST'])
def toggle_payment_route(share_id):
    user_id = session.get('user_id')
    branch_id = session.get('branch_id')
    
    response, status = booking_services.toggle_share_payment_service(share_id, user_id, branch_id)
    return jsonify(response), status

@booking_bp.route('/referral-shares/<int:share_id>', methods=['PUT'])
def update_share_route(share_id):
    data = request.get_json()
    new_amount = data.get('amount')
    user_id = session.get('user_id')
    
    if new_amount is None:
        return jsonify({"error": "Amount is required"}), 400

    response, status = booking_services.update_share_amount_service(share_id, new_amount, user_id)
    return jsonify(response), status

@booking_bp.route("/update-share-provider", methods=["POST"])
@login_required
def update_share_provider():
    data = request.get_json()
    user_id = session.get("user_id")
    
    booking_id = data.get("booking_id")
    new_referred_id = data.get("new_referred_id")

    if not booking_id:
        return jsonify({"error": "Booking ID is required"}), 400

    result, status = booking_services.update_booking_share_provider(
        booking_id, new_referred_id, user_id
    )
    return jsonify(result), status