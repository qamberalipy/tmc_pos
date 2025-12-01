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

@reports_bp.route("/assign-bookings", methods=["POST"])
def assign_bookings():
    data = request.get_json()
    booking_ids = data.get("bookingids")
    doctor_id = data.get("doctor_id")
    user_id = session.get("user_id")
    branch_id = session.get("branch_id")

    if not booking_ids or not doctor_id:
        return jsonify({"error": "bookingids and doctor_id are required"}), 400

    try:
        result = report_services.assign_bookings_to_doctor(
            booking_ids=booking_ids,
            doctor_id=doctor_id,
            assigned_by=user_id,
            branch_id=branch_id
        )
        return jsonify({"message": "Bookings assigned successfully", "assigned_count": result}), 200
    except Exception as e:
        print(f"Error in assign_bookings: {str(e)}")
        return jsonify({"error": "Internal server error", "detail": str(e)}), 500


# API to fetch all bookings assigned to a doctor
@reports_bp.route("/bookings/<int:doctor_id>", methods=["GET"])
def get_doctor_bookings(doctor_id):
    try:
        result = report_services.get_doctor_bookings(doctor_id=doctor_id)
        return jsonify(result), 200
    except Exception as e:
        print(f"Error in get_doctor_bookings: {str(e)}")
        return jsonify({"error": "Internal server error", "detail": str(e)}), 500