from flask import session
from sqlalchemy import func, cast, Date, desc
from app.extensions import db
from app.models import TestBookingDetails
from decimal import Decimal
from datetime import datetime, date
from sqlalchemy.exc import SQLAlchemyError
from app.models.test_booking import TestFilmUsage, TestBooking, FilmInventoryTransaction
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
                    cast(Expenses.created_at, Date) == date
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

            return {
                "date": date.strftime("%Y-%m-%d"),
                "total_expenses": total,
                "items": items
            }

        except SQLAlchemyError:
            db.session.rollback()
            raise


def get_films_report(branch_id: int, date):
    """date is a datetime.date object."""

    target_date = date

    # 1) Opening stock
    before_data = (
        db.session.query(
            FilmInventoryTransaction.transaction_type,
            func.sum(FilmInventoryTransaction.quantity)
        )
        .filter(cast(FilmInventoryTransaction.transaction_date, Date) < target_date)
        .filter(FilmInventoryTransaction.branch_id == branch_id)
        .group_by(FilmInventoryTransaction.transaction_type)
        .all()
    )

    total_in_before = sum(q for t, q in before_data if t == "IN")
    total_out_before = sum(q for t, q in before_data if t == "OUT")

    film_start = total_in_before - total_out_before

    # 2) IN/OUT Today
    day_data = (
        db.session.query(
            FilmInventoryTransaction.transaction_type,
            func.sum(FilmInventoryTransaction.quantity)
        )
        .filter(cast(FilmInventoryTransaction.transaction_date, Date) == target_date)
        .filter(FilmInventoryTransaction.branch_id == branch_id)
        .group_by(FilmInventoryTransaction.transaction_type)
        .all()
    )

    in_today = sum(q for t, q in day_data if t == "IN")
    out_today = sum(q for t, q in day_data if t == "OUT")

    # 3) Closing
    film_closing = film_start + in_today - out_today

    return {
        "film_start": film_start,
        "film_closing": film_closing,
        "film_use": out_today
    }


def get_test_report(branch_id: int, date):
    if not branch_id or not date:
        raise ValueError("branch_id and date are required")

    try:
        # 1) Total income
        income_row = (
            db.session.query(
                func.coalesce(func.sum(TestBooking.net_receivable), 0).label("total")
            )
            .filter(
                TestBooking.branch_id == branch_id,
                cast(TestBooking.create_at, Date) == date
            )
            .one()
        )

        total_income = _to_float(income_row.total)

        # 2) Test frequency
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
                cast(TestBooking.create_at, Date) == date
            )
            .group_by(TestBookingDetails.test_id, Test_registration.test_name)
            .order_by(desc("frequency"))
        )

        tests = [{
            "id": int(r.test_id),
            "test_name": r.test_name,
            "frequency": int(r.frequency)
        } for r in t_q.all()]

        return {
            "total_income": total_income,
            "tests": tests
        }

    except SQLAlchemyError:
        db.session.rollback()
        raise
