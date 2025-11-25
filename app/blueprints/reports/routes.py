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
        return jsonify(result), 200
    except Exception as e:
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
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": "Internal server error", "detail": str(e)}), 500
