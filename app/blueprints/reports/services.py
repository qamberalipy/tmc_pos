import json
from flask import session
from sqlalchemy import func, and_, cast, String,case,Date,desc
from app.blueprints import booking
from app.extensions import db
from app.models import TestBookingDetails,User,Branch,Referred
from werkzeug.security import generate_password_hash
from sqlalchemy.exc import SQLAlchemyError
from decimal import Decimal, InvalidOperation
from datetime import datetime, date, time
from werkzeug.exceptions import BadRequest
from sqlalchemy.ext.mutable import MutableDict, MutableList
from app.models.test_booking import TestFilmUsage, TestBooking,FilmInventoryTransaction
from app.models.test_registration import Test_registration
from app.models.expenses import Expenses
from app.models.expense_head import Expense_head


def _to_float(value):
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except Exception:
        return 0.0


def get_expenses_report(branch_id: int, date):

    if not branch_id or not date:
        raise ValueError("branch_id and date are required")

    try:
       
        start_dt = date
        end_dt = date  # same day

        # join Expenses -> Expense_head and aggregate per head
        q = (
            db.session.query(
                Expenses.expense_head_id.label("head_id"),
                Expense_head.name.label("head_name"),
                func.coalesce(func.sum(Expenses.amount), 0).label("amount")
            )
            .join(Expense_head, Expense_head.id == Expenses.expense_head_id)
            .filter(
                Expenses.is_deleted.isnot(True),
                Expenses.branch_id == branch_id,
                cast(Expenses.created_at, Date).between(start_dt, end_dt)
            )
            .group_by(Expenses.expense_head_id, Expense_head.name)
            .order_by(Expense_head.name)
        )

        rows = q.all()

        items = []
        total = 0
        for r in rows:
            amt = _to_float(r.amount)
            items.append({
                "id": int(r.head_id),
                "name": r.head_name,
                "amount": amt
            })
            total += amt

        response = {
            "date": start_dt.strftime("%Y-%m-%d"),
            "total_expenses": total,
            "items": items
        }
        return response

    except SQLAlchemyError as e:
        db.session.rollback()
        raise
    except Exception:
        raise


def get_films_report(branch_id: int, date: str):
    target_date = datetime.strptime(date, "%Y-%m-%d").date()

    # ---- 1) Total before the selected date (for opening) ----
    before_query = (
        db.session.query(
            FilmInventoryTransaction.transaction_type,
            func.sum(FilmInventoryTransaction.quantity)
        )
        .filter(cast(FilmInventoryTransaction.transaction_date, Date) < target_date)
    )

    if branch_id:
        before_query = before_query.filter(
            FilmInventoryTransaction.branch_id == branch_id
        )

    before_data = before_query.group_by(FilmInventoryTransaction.transaction_type).all()

    total_in_before = sum(q for t, q in before_data if t == "IN")
    total_out_before = sum(q for t, q in before_data if t == "OUT")

    film_start = total_in_before - total_out_before

    # ---- 2) IN & OUT on the selected date ----

    day_query = (
        db.session.query(
            FilmInventoryTransaction.transaction_type,
            func.sum(FilmInventoryTransaction.quantity)
        )
        .filter(cast(FilmInventoryTransaction.transaction_date, Date) == target_date)
    )

    if branch_id:
        day_query = day_query.filter(
            FilmInventoryTransaction.branch_id == branch_id
        )

    day_data = day_query.group_by(FilmInventoryTransaction.transaction_type).all()

    in_today = sum(q for t, q in day_data if t == "IN")
    out_today = sum(q for t, q in day_data if t == "OUT")

    # ---- 3) Closing Calculation ----
    film_closing = film_start + in_today - out_today
    film_use = out_today

    return {
        "film_start": film_start,
        "film_closing": film_closing,
        "film_use": film_use
    }, 200


def get_test_report(branch_id: int, date):

    if not branch_id or not date:
        raise ValueError("branch_id and date are required")

    try:
        day_start = date
        day_end = date

        # 1) Total income: use TestBooking.net_receivable filtered by create_at date (or create_at date)
        income_q = (
            db.session.query(func.coalesce(func.sum(TestBooking.net_receivable), 0).label("total"))
            .filter(
                TestBooking.branch_id == branch_id,
                cast(TestBooking.create_at, Date).between(day_start, day_end)
            )
        )
        income_row = income_q.one()
        total_income = _to_float(income_row.total)

        # 2) Tests frequency:
        # join TestBookingDetails -> TestBooking (for date & branch) -> Test_registration for test name
        t_q = (
            db.session.query(
                TestBookingDetails.test_id.label("test_id"),
                Test_registration.test_name.label("test_name"),
                func.coalesce(func.sum(TestBookingDetails.quantity), 0).label("frequency")
            )
            .join(TestBooking, TestBooking.id == TestBookingDetails.booking_id)
            .join(Test_registration, Test_registration.id == TestBookingDetails.test_id)
            .filter(
                TestBooking.branch_id == branch_id,
                cast(TestBooking.create_at, Date).between(day_start, day_end)
            )
            .group_by(TestBookingDetails.test_id, Test_registration.test_name)
            .order_by(desc("frequency"))
        )

        tests = []
        for r in t_q.all():
            tests.append({
                "id": int(r.test_id),
                "test_name": r.test_name,
                "frequency": int(r.frequency or 0)
            })

        return {
            "total_income": total_income,
            "tests": tests
        }

    except SQLAlchemyError:
        db.session.rollback()
        raise
    except Exception:
        raise
