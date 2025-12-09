from flask import redirect, render_template, request, jsonify, session, url_for
from . import reports_bp
from app.blueprints.reports import services as report_services
from app.decorators import login_required
import datetime


@reports_bp.route('/view/test-report')
@login_required
def view_daily_reports():
    # try:
    return render_template('daily_report.html')
    # except Exception as e:
    #     print(f"Error in view_daily_reports: {str(e)}")
    #     return redirect(url_for('main.error_page'))


def _parse_date(date_str):
    if not date_str:
        return None
    try:
        return datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
    except Exception:
        return None


@reports_bp.route("/daily-report/expenses", methods=["GET"])
def api_expenses():
    branch_id = session.get("branch_id")
    date = _parse_date(request.args.get("date"))

    if not branch_id:
        return jsonify({"error": "branch_id is required"}), 400
    if not date:
        return jsonify({"error": "valid date (YYYY-MM-DD) is required"}), 400

    try:
        result = report_services.get_expenses_report(branch_id=branch_id, date=date)
        print("Expenses Report Result:", result)
        return jsonify(result), 200
    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        print(f"Error in api_expenses: {str(e)}")
        return jsonify({"error": "Internal server error", "detail": str(e)}), 500


@reports_bp.route("/daily-report/films", methods=["GET"])
def api_films():
    branch_id = session.get("branch_id")
    date = _parse_date(request.args.get("date"))

    if not branch_id:
        return jsonify({"error": "branch_id is required"}), 400
    if not date:
        return jsonify({"error": "valid date (YYYY-MM-DD) is required"}), 400

    try:
        result = report_services.get_films_report(branch_id=branch_id, date=date)
        print("Films Report Result:", result)
        return jsonify(result), 200
    except Exception as e:
        print(f"Error in api_films: {str(e)}")
        return jsonify({"error": "Internal server error", "detail": str(e)}), 500


@reports_bp.route("/daily-report/test-report", methods=["GET"])
def api_test_report():
    branch_id = session.get("branch_id")
    date = _parse_date(request.args.get("date"))

    if not branch_id:
        return jsonify({"error": "branch_id is required"}), 400
    if not date:
        return jsonify({"error": "valid date (YYYY-MM-DD) is required"}), 400

    try:
        
        result = report_services.get_test_report(branch_id=branch_id, date=date)
        print("Test Report Result:", result)
        return jsonify(result), 200
    except Exception as e:
        print(f"Error in api_test_report: {str(e)}")
        return jsonify({"error": "Internal server error", "detail": str(e)}), 500
@reports_bp.route("/pending_cases", methods=["POST", "GET"])
@login_required
def view_pending_cases():
    try:
        return render_template("doctor_pending_cases.html")
    except Exception as e:
        print(f"Error in pending_cases: {str(e)}")
        return render_template("error.html", message="An error occurred while loading pending cases.")

@reports_bp.route("/reported_cases", methods=["POST", "GET"])
@login_required
def view_reported_cases():
    try:
        return render_template("doctor_reported_cases.html")
    except Exception as e:
        print(f"Error in reported_cases: {str(e)}")
        return render_template("error.html", message="An error occurred while loading pending cases.")
    
@reports_bp.route("/assign-bookings", methods=["POST"])
def assign_bookings():
    data = request.get_json()
    
    # Matches the new frontend payload key: "bookings"
    bookings_payload = data.get("bookings") 
    doctor_id = data.get("doctor_id")
    
    user_id = session.get("user_id")
    branch_id = session.get("branch_id")

    print("Assign Bookings Data:", data)

    if not bookings_payload or not doctor_id:
        return jsonify({"error": "bookings data and doctor_id are required"}), 400

    try:
        # Pass the list of objects to the service
        result_count = report_services.assign_bookings_to_doctor(
            bookings_payload=bookings_payload,
            doctor_id=doctor_id,
            assigned_by=user_id,
            branch_id=branch_id
        )
        
        msg = f"{result_count} tests assigned successfully"
        if result_count == 0:
            msg = "No new tests were assigned (all selected tests were already assigned)."

        return jsonify({
            "message": msg, 
            "assigned_count": result_count
        }), 200

    except Exception as e:
        print(f"Error in assign_bookings: {str(e)}")
        # In production, avoid sending str(e) directly to client for security, use generic message
        return jsonify({"error": "Internal server error", "detail": str(e)}), 500

@reports_bp.route("/decline-assignment", methods=["POST"])
def decline_assignment_route():
    data = request.get_json()
    reporting_id = data.get("reporting_id")
    doctor_id = session.get("user_id") 

    if not reporting_id:
        return jsonify({"error": "Reporting ID is required"}), 400

    try:
        success = report_services.decline_doctor_assignment(reporting_id, doctor_id)
        
        if success:
            return jsonify({"message": "Assignment declined"}), 200
        else:
            return jsonify({"error": "Record not found or access denied"}), 404

    except Exception as e:
        print(f"Error declining assignment: {e}")
        return jsonify({"error": str(e)}), 500

@reports_bp.route("/bookings/pendingcase", methods=["GET"])
def get_doctor_pending_bookings():
    try:
        doctor_id = session.get("user_id")
        print("Doctor ID",doctor_id)
        result = report_services.get_doctor_pending_bookings(doctor_id=doctor_id)
        return jsonify(result), 200
    except Exception as e:
        print(f"Error in get_doctor_pending_bookings: {str(e)}")
        return jsonify({"error": "Internal server error", "detail": str(e)}), 500

@reports_bp.route("/bookings/reportedcase", methods=["GET"])
def get_doctor_reported_bookings():
    try:
        doctor_id = session.get("user_id")
        print("Doctor ID",doctor_id)
        result = report_services.get_doctor_reported_bookings(doctor_id=doctor_id)
        return jsonify(result), 200
    except Exception as e:
        print(f"Error in get_doctor_reported_bookings: {str(e)}")
        return jsonify({"error": "Internal server error", "detail": str(e)}), 500
    
@reports_bp.route("/checking", methods=["GET"])
def checking_route():
    try:
        return render_template("check_report.html")
    except Exception as e:
        print(f"Error in checking_route: {str(e)}")
        return jsonify({"error": "Internal server error", "detail": str(e)}), 500

@reports_bp.route("/save-report", methods=["POST"])
def save_report():
    try:
        data = request.get_json(force=True)
        user_id = session.get("user_id")
        result=report_services.save_doctor_report(data, user_id)
        return jsonify(result), 200
    
    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 400
    
@reports_bp.route("/get-report-data/<int:report_id>", methods=["GET"])
def get_report_data(report_id):
    try:
        result = report_services.get_doctor_report_by_id(report_id)
        return jsonify(result), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400

@reports_bp.route("/update-report/<int:report_id>", methods=["PUT"])
def update_report(report_id):
    try:
        data = request.get_json(force=True)
        user_id = session.get("user_id")
        result = report_services.update_doctor_report(report_id, data, user_id)
        return jsonify(result), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400
    
@reports_bp.route("/view-patient-report/<int:report_id>", methods=["GET"])
def view_patient_report(report_id):
    try:
        result = report_services.get_doctor_report_by_id(report_id)
        print("Patient Report Result:", result)
        return render_template("view_patient_report.html", report=result)
    except Exception as e:
        print(f"Error in view_patient_report: {str(e)}")
        return render_template("error.html", message="An error occurred while loading the report.")
    

@reports_bp.route("/assigned-reports", methods=["GET"])
def get_doctor_assigned_reports():
    try:
        # 1. Extract Query Parameters
        # Use .get() for single values
        branch_id = session.get("branch_id")
        from_date = request.args.get("from_date")
        to_date = request.args.get("to_date")
        status = request.args.getlist("status")
        print("Status Params:", status,from_date,to_date,branch_id)
        if not status:
            status = None

       
        result = report_services.get_doctor_assigned_reports_service(
            branch_id=branch_id,
            status=status,
            from_date=from_date,
            to_date=to_date
        )

        if isinstance(result, tuple):
            return jsonify(result[0]), result[1]
        
        # If it's just a dict (the error case from service exception)
        return jsonify(result), 400

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500