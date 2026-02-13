import json
from flask import session
from sqlalchemy import func, and_, cast, String,case,Date,or_
from app.blueprints import booking
from app.extensions import db
from app.models import TestBookingDetails,User,Branch,Referred
from werkzeug.security import generate_password_hash
from sqlalchemy.exc import SQLAlchemyError,IntegrityError
from decimal import Decimal, InvalidOperation
from datetime import datetime, date, time
from werkzeug.exceptions import BadRequest
from app.helper import convert_to_utc
from sqlalchemy.ext.mutable import MutableDict, MutableList
from app.models.test_booking import TestFilmUsage, TestBooking,FilmInventoryTransaction
from app.models.test_registration import Test_registration
from app.models.doctor_reporting_details import DoctorReportingdetails
from app.models.expenses import Expenses
from app.models.referred import ReferralShare
from app.models.expenses import PaymentTransaction

def to_decimal(value, field_name="Value"):
    if value is None:
        return Decimal("0.00")
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValueError(f"{field_name} must be a valid number")

def create_test_booking(data):
    max_retries = 3
    attempt = 0

    while attempt < max_retries:
        try:
            # --- 1. Generate MR No ---
            # If not provided, generate it. 
            if not data.get("mr_no"):
                data["mr_no"] = _generate_mr_no()

            # --- 2. Required fields validation ---
            required = ["patient_name", "gender", "contact_no", "branch_id", "net_receivable", "create_by"]
            missing = [f for f in required if not data.get(f)]
            if missing:
                return {"error": f"Missing required fields: {', '.join(missing)}"}, 400

            # Convert decimals once
            net_receivable = to_decimal(data["net_receivable"], "net_receivable")
            discount_value = to_decimal(data.get("discount_value", 0), "discount_value")
            paid_amount = to_decimal(data.get("paid_amount", 0), "paid_amount")
            due_amount = to_decimal(data.get("due_amount", 0), "due_amount")

            # --- 3. Booking Object Creation ---
            booking = TestBooking(
                mr_no=data.get("mr_no"),
                patient_name=data["patient_name"],
                gender=data["gender"],
                age=data.get("age"),
                contact_no=data["contact_no"],
                referred_dr=data.get("referred_dr"),
                referred_non_dr=data.get("referred_non_dr"),
                give_share_to=data.get("give_share_to"),
                branch_id=data["branch_id"],
                discount_type=data.get("discount_type", "None"),
                discount_value=discount_value,
                net_receivable=net_receivable,
                payment_type=data.get("payment_type", "Cash"),
                paid_amount=paid_amount,
                due_amount=due_amount,
                create_by=data["create_by"]
            )
            db.session.add(booking)
            db.session.flush()  # FLUSH to get the ID, but don't commit yet

            # --- 4. Share Record ---
            if data.get('referred_dr'):
                share_amount = to_decimal(data.get('share_amount', 0), "share_amount")
                new_share = ReferralShare(
                    booking_id=booking.id,
                    referred_id=data['referred_dr'],
                    share_amount=share_amount,
                    is_paid=False,
                    created_by=data["create_by"]
                )
                db.session.add(new_share)

            # --- 5. Financial Transaction ---
            if paid_amount > 0:
                transaction = PaymentTransaction(
                    branch_id=booking.branch_id,
                    booking_id=booking.id,
                    amount=paid_amount,
                    direction="IN",
                    payment_type=booking.payment_type,
                    transaction_type="Initial",
                    created_by=data["create_by"],
                    payment_date=datetime.utcnow()
                )
                db.session.add(transaction)

            # --- 6. Test Details (Bulk Preparation) ---
            test_details_list = data.get('tests', [])
            details = []
            
            # Pre-fetch reporting dates logic if needed, inside loop is fine for small N
            for idx, test in enumerate(test_details_list, start=1):
                if not test.get("test_id"):
                    # Rollback immediately if validation fails deep inside
                    db.session.rollback()
                    return {"error": f"Test #{idx} missing test_id"}, 400
                
                reporting_date = None
                if test.get("reporting_date"):
                    try:
                        val = test["reporting_date"]
                        reporting_date = datetime.strptime(val, "%Y-%m-%d").date() if isinstance(val, str) else val
                    except ValueError:
                        pass 

                details.append(TestBookingDetails(
                    booking_id=booking.id,
                    test_id=test["test_id"],
                    quantity=test.get("quantity", 1),
                    amount=to_decimal(test.get("amount"), f"tests[{idx}].amount"),
                    no_of_films=test.get("no_of_films"),
                    required_days=test.get("required_days"),
                    reporting_date=reporting_date,
                    sample_to_follow=test.get("sample_to_follow")
                ))

            if details:
                db.session.add_all(details) # Efficient for this size
            
            # --- 7. Final Commit ---
            db.session.commit()
            
            return {
                "message": "Booking created successfully",
                "booking_id": booking.id,
                "mr_no": booking.mr_no, # Return MR so frontend can see it
                "total_tests": len(test_details_list)
            }, 201

        except IntegrityError:
            db.session.rollback()
            # Race Condition detected on MR_NO unique constraint
            attempt += 1
            if attempt < max_retries:
                print(f"MR No collision detected. Retrying... (Attempt {attempt})")
                data["mr_no"] = None # Reset MR to force regeneration
                continue # Restart loop
            else:
                return {"error": "System busy (MR Generation collision). Please try again."}, 500

        except SQLAlchemyError as e:
            db.session.rollback()
            print("Database error:", str(e))
            return {"error": str(e.__dict__.get("orig", e))}, 500
        except Exception as e:
            db.session.rollback()
            print("General error:", str(e))
            return {"error": str(e)}, 400

def _generate_mr_no():
    now = datetime.utcnow()
    prefix = now.strftime("%y%m") 
    last_booking = (
        db.session.query(TestBooking.mr_no) # Fetch ONLY the column we need (Performance)
        .filter(TestBooking.mr_no.like(f"{prefix}-%"))
        .order_by(TestBooking.id.desc())
        .first()
    )

    if last_booking and last_booking.mr_no:
        try:
            last_seq = int(last_booking.mr_no.split("-")[1])
            new_seq = last_seq + 1
        except (IndexError, ValueError):
            new_seq = 1
    else:
        new_seq = 1

    return f"{prefix}-{new_seq:04d}"

def update_booking_share_provider(booking_id, new_referred_id, user_id):
    try:
        # 1. Fetch Booking
        booking = TestBooking.query.get(booking_id)
        if not booking:
            return {"error": "Booking not found"}, 404

        # 2. Check if Share is already paid (Safety Check)
        # If we allow changing this, your Accounts/Expenses will be wrong 
        # (Expense paid to Person A, but Record shows Person B).
        existing_share = ReferralShare.query.filter_by(booking_id=booking_id).first()
        if existing_share and existing_share.is_paid:
            return {
                "error": "Cannot change provider: Commission is ALREADY PAID. Please 'Unpay' it in the Referral List first."
            }, 400

        # 3. Handle 'None' or empty string input
        new_id = int(new_referred_id) if new_referred_id else None
        
        # ---------------------------------------------------------
        # UPDATE LOGIC: Sync referred_dr, referred_non_dr, and give_share_to
        # ---------------------------------------------------------
        if new_id:
            # Fetch the referred person details to know if they are a Doctor or Not
            provider = Referred.query.get(new_id)
            if not provider:
                return {"error": "Selected provider not found in database"}, 404

            # Update the main share column
            booking.give_share_to = new_id

            # Sync legacy columns based on is_doctor status
            if provider.is_doctor:
                booking.referred_dr = new_id
                booking.referred_non_dr = None  # Clear the non-doctor field
            else:
                booking.referred_non_dr = new_id
                booking.referred_dr = None      # Clear the doctor field
        else:
            # If removing the share, clear ALL related fields
            booking.give_share_to = None
            booking.referred_dr = None
            booking.referred_non_dr = None

        # Metadata updates
        booking.update_by = user_id
        booking.update_at = datetime.utcnow()
        db.session.add(booking)

        # 4. Sync ReferralShare Table
        if existing_share:
            if new_id:
                # Update existing record
                existing_share.referred_id = new_id
                db.session.add(existing_share)
            else:
                # If removing the referrer, delete the share record
                db.session.delete(existing_share)
        
        elif new_id:
            # No existing share, but new referrer selected -> Create new Share Record
            new_share = ReferralShare(
                booking_id=booking.id,
                referred_id=new_id,
                share_amount=0,  # Default to 0, admin updates later
                is_paid=False,
                created_by=user_id
            )
            db.session.add(new_share)

        db.session.commit()
        
        return {
            "message": "Referral share and booking details updated successfully",
            "new_provider_id": new_id
        }, 200

    except Exception as e:
        db.session.rollback()
        print(f"Error updating share: {str(e)}")
        return {"error": str(e)}, 500


def clear_booking_due(booking_id, amount_to_pay, payment_type, user_id):
    try:
        booking = TestBooking.query.get(booking_id)
        if not booking:
            return {"error": "Booking not found"}, 404

        pay_amt = Decimal(str(amount_to_pay))
        
        if pay_amt <= 0:
            return {"error": "Payment amount must be greater than 0"}, 400
            
        if pay_amt > booking.due_amount:
            return {"error": f"Payment {pay_amt} exceeds due amount {booking.due_amount}"}, 400

        # Update Booking Balance
        booking.paid_amount += pay_amt
        booking.due_amount -= pay_amt
        booking.update_at = datetime.utcnow()
        booking.update_by = user_id
        
        db.session.add(booking)

        # Create Transaction Record
        transaction = PaymentTransaction(
            branch_id=booking.branch_id,
            booking_id=booking.id,
            amount=pay_amt,
            direction="IN",
            payment_type=payment_type,
            transaction_type="DueClearance",
            created_by=user_id,
            payment_date=datetime.utcnow()
        )
        db.session.add(transaction)

        # Commit to generate transaction ID
        db.session.commit()

        return {
            "message": "Due cleared successfully", 
            "remaining_due": float(booking.due_amount),
            "paid_now": float(pay_amt),
            "transaction_id": transaction.id  # <--- ADD THIS LINE
        }, 200

    except Exception as e:
        db.session.rollback()
        print("Error in clear_booking_due:", e)
        return {"error": str(e)}, 500

# 2. ADD NEW function to fetch receipt data
def get_due_receipt_details(transaction_id):
    try:
        # Fetch the transaction
        txn = PaymentTransaction.query.get(transaction_id)
        if not txn:
            return {"error": "Transaction not found"}, 404
        
        # Fetch related booking and branch info
        booking = TestBooking.query.get(txn.booking_id)
        branch = Branch.query.get(txn.branch_id)
        user = User.query.get(txn.created_by)

        data = {
            "receipt_no": txn.id,
            "date": txn.payment_date.strftime("%d-%b-%Y %I:%M %p"),
            "amount_paid": float(txn.amount),
            "payment_mode": txn.payment_type,
            
            # Patient Details
            "booking_id": booking.id,
            "mr_no": booking.mr_no,
            "patient_name": booking.patient_name,
            "contact_no": booking.contact_no,
            "age": booking.age,
            "gender": booking.gender,

            # Financials
            "total_booking_amount": float(booking.net_receivable),
            "remaining_due": float(booking.due_amount),
            
            # Branch/System Info
            "branch_name": branch.branch_name if branch else "Main Branch",
            "branch_address": branch.address if branch else "",
            "branch_contact": branch.contact_number if branch else "",
            "received_by": user.name if user else "System"
        }
        return data, 200

    except Exception as e:
        print(f"Error fetching due receipt: {str(e)}")
        return {"error": "Failed to generate receipt"}, 500

# ... (Keep existing imports)

def get_dues_list(branch_id, from_date=None, to_date=None, status=None):
    try:
        # 1. Validation and Date Setup
        if not from_date or not to_date:
            raise BadRequest("Both from_date and to_date are required.")

        try:
            from_date_obj = datetime.strptime(from_date, "%Y-%m-%d").date()
            to_date_obj   = datetime.strptime(to_date, "%Y-%m-%d").date()
        except ValueError:
            raise BadRequest("Date format must be YYYY-MM-DD.")

        if from_date_obj > to_date_obj:
            raise BadRequest("from_date cannot be greater than to_date.")

        # Create full timestamps (Start of day to End of day)
        start_dt = datetime.combine(from_date_obj, time.min)
        end_dt   = datetime.combine(to_date_obj, time.max)

        if not branch_id:
            return {"error": "branch_id is required"}, 400

        # 2. Base Query
        query = db.session.query(TestBooking).filter(
            TestBooking.branch_id == int(branch_id),
            TestBooking.create_at >= start_dt,
            TestBooking.create_at <= end_dt
        )

        # 3. Apply Status Filter
        if status == 'unpaid':
            query = query.filter(TestBooking.due_amount > 0)
        elif status == 'paid':
            query = query.filter(TestBooking.due_amount <= 0)

        bookings = query.order_by(TestBooking.create_at.desc()).all()

        # 4. Serialize Data
        dues_list = []
        total_due_amount = 0

        for b in bookings:
            # --- NEW: Fetch the last transaction ID for this booking ---
            # We use this to generate the receipt for the payment that likely cleared the due
            last_txn = (db.session.query(PaymentTransaction.id)
                        .filter(PaymentTransaction.booking_id == b.id)
                        .order_by(PaymentTransaction.id.desc())
                        .first())
            
            last_txn_id = last_txn[0] if last_txn else None
            # -----------------------------------------------------------

            dues_list.append({
                "booking_id": b.id,
                "mr_no": b.mr_no,
                "patient_name": b.patient_name,
                "contact_no": b.contact_no,
                "date": b.create_at.strftime("%Y-%m-%d %I:%M %p") if b.create_at else None,
                "total_amount": float(b.net_receivable or 0),
                "paid_amount": float(b.paid_amount or 0),
                "due_amount": float(b.due_amount or 0),
                "created_by": b.create_by,
                "last_transaction_id": last_txn_id  # <--- Return this to frontend
            })
            
            if b.due_amount and b.due_amount > 0:
                total_due_amount += float(b.due_amount)

        return {
            "dues": dues_list,
            "total_outstanding_amount": total_due_amount,
            "count": len(dues_list)
        }, 200

    except SQLAlchemyError as e:
        return {"error": str(e.__dict__.get("orig", e))}, 500
    except Exception as e:
        return {"error": str(e)}, 500
    
def update_booking_total_films(booking_id):
    total = db.session.query(
        db.func.sum(TestFilmUsage.films_used)
    ).filter_by(booking_id=booking_id).scalar() or 0

    booking = TestBooking.query.get(booking_id)
    booking.total_no_of_films_used = total
    db.session.add(booking)

    return total

def add_film_usage(booking_id, films_used, usage_type, used_by, branch_id, reason=None):
    usage = TestFilmUsage(
        booking_id=booking_id,
        films_used=films_used,
        films_required=films_used,
        usage_type=usage_type,
        reason=reason,
        used_by=used_by,
        branch_id=branch_id
    )
    db.session.add(usage)
    db.session.flush()  # usage.id created

    # Inventory OUT
    inventory_transaction(
        quantity=films_used,
        transaction_type="OUT",
        booking_id=booking_id,
        handled_by=used_by,
        branch_id=branch_id,
        reason="Films consumed"
    )

    # Recalculate totals
    update_booking_total_films(booking_id)

    return usage

def inventory_transaction(quantity, transaction_type, handled_by, branch_id, booking_id=None, reason=""):
    if transaction_type not in ["IN", "OUT", "ADJUST"]:
        raise ValueError("Invalid transaction_type")

    txn = FilmInventoryTransaction(
        transaction_type=transaction_type,
        quantity=quantity,
        handled_by=handled_by,
        branch_id=branch_id,
        booking_id=booking_id,
        reason=reason
    )
    
    db.session.add(txn)
    db.session.flush()  # ← REQ
    return txn


def get_inventory_summary(from_date, to_date, branch_id=None):
    try:
        # ---------------------------
        # Validate date inputs
        # ---------------------------
        if not from_date or not to_date:
            raise BadRequest("Both from_date and to_date are required.")

        # Convert → date
        try:
            from_date = datetime.strptime(from_date, "%Y-%m-%d").date()
            to_date   = datetime.strptime(to_date, "%Y-%m-%d").date()
        except ValueError:
            raise BadRequest("Date format must be YYYY-MM-DD.")

        if from_date > to_date:
            raise BadRequest("from_date cannot be greater than to_date.")

        start_dt = datetime.combine(from_date, time.min)
        end_dt   = datetime.combine(to_date, time.max)

        q = FilmInventoryTransaction

        # ---------------------------
        # Correct CASE usage
        # ---------------------------
        query = db.session.query(
            func.sum(case((q.transaction_type == "IN", q.quantity), else_=0)).label("total_in"),
            func.sum(case((q.transaction_type == "OUT", q.quantity), else_=0)).label("total_out")
        ).filter(
            q.transaction_date >= start_dt,
            q.transaction_date <= end_dt
        )

        if branch_id is not None:
            query = query.filter(q.branch_id == branch_id)

        results = query.one()

        total_in = int(results.total_in or 0)
        total_out = int(results.total_out or 0)

        return {
            "total_in": total_in,
            "total_out": total_out,
            "balance": total_in - total_out,
            "status": "success"
        }

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

def get_film_inventory_report(branch_id=None, from_date=None, to_date=None):
    
        # Convert to date
    print("Generating report for:", branch_id, from_date, to_date)
    from_date = datetime.strptime(from_date, "%Y-%m-%d").date()
    to_date = datetime.strptime(to_date, "%Y-%m-%d").date()

    # Fetch all transactions
    query = (
        db.session.query(
            cast(FilmInventoryTransaction.transaction_date, Date).label("tdate"),
            FilmInventoryTransaction.transaction_type,
            func.sum(FilmInventoryTransaction.quantity).label("qty")
        )
        .filter(cast(FilmInventoryTransaction.transaction_date, Date)
                .between(from_date, to_date))
    )

    if branch_id:
        query = query.filter(FilmInventoryTransaction.branch_id == branch_id)

    query = query.group_by("tdate", FilmInventoryTransaction.transaction_type)
    records = query.all()

    # Convert to date → daily buckets
    day_map = {}
    for r in records:
        dt = r.tdate
        if dt not in day_map:
            day_map[dt] = {"IN": 0, "OUT": 0}
        day_map[dt][r.transaction_type] = r.qty

    # Generate final rows
    report = []
    previous_closing = 0

    for dt in sorted(day_map.keys()):
        opening = previous_closing
        used = day_map[dt]["OUT"]
        new_packets = day_map[dt]["IN"]
        closing = (opening + new_packets) - used

        # If IN, add yellow row (New Packet Insert)
        if new_packets > 0:
            report.append({
                "type": "packet", 
                "date": dt.strftime("%Y-%m-%d"),
                "message": f"New Packet Insert {new_packets} Films"
            })

        report.append({
            "type": "normal",
            "date": dt.strftime("%Y-%m-%d"),
            "opening": opening,
            "closing": closing,
            "used": used,
            "total_use": used
        })

        previous_closing = closing

    return {"data": report}, 200



def get_films_audit(branch_id=None, from_date=None, to_date=None):
    try:
        query = (
            db.session.query(
                TestFilmUsage.id.label("usage_id"),
                TestFilmUsage.booking_id,
                TestFilmUsage.films_required,
                TestFilmUsage.films_used,
                TestFilmUsage.usage_type,
                TestFilmUsage.reason,
                TestFilmUsage.used_at,
                User.name.label("used_by_name")
            )
            .join(User, User.id == TestFilmUsage.used_by, isouter=True)
        )
        

        # Filter branch
        if branch_id:
            query = query.filter(TestFilmUsage.branch_id == branch_id)

        # Filter by date range
        if from_date:
            query = query.filter(TestFilmUsage.used_at >= from_date)

        if to_date:
            query = query.filter(TestFilmUsage.used_at <= to_date)

        query = query.order_by(TestFilmUsage.used_at.desc())

        records = query.all()

        result = []
        for r in records:
            result.append({
                "booking_id": r.booking_id,
                "films_required": r.films_required,
                "films_used": r.films_used,
                "usage_type": r.usage_type,
                "reason": r.reason,
                "used_by": r.used_by_name or "Unknown",
                "used_at": r.used_at.strftime("%Y-%m-%d %H:%M:%S") if r.used_at else None
            })

        return {"data": result}, 200

    except Exception as e:
        print("Error in get_films_audit:", str(e))
        return {"error": str(e)}, 500


def edit_film_usage_by_booking(booking_id, test_id, films_under_test,total_new_films_used, usage_type, edited_by, reason="Edited film usage"):
    print(f"Editing film usage: Booking {booking_id}, Test {test_id}, New Total {total_new_films_used}")

    # ---- Basic Validations ----
    if not booking_id:
        return {"error": "booking_id is required"}, 400
    if not test_id:
        return {"error": "test_id is required"}, 400
    if total_new_films_used is None or total_new_films_used < 0:
        return {"error": "Invalid Films value"}, 400
    if usage_type not in ['Normal', 'Extra', 'Repeat', 'Error']:
        return {"error": "Invalid usage_type value"}, 400

    # 1. Fetch the usage record
    usage = TestFilmUsage.query.filter_by(booking_id=booking_id).first()
    if not usage:
        return {"error": "Film usage record not found for this booking"}, 404

    # 2. Fetch the specific test detail record to update individual film count
    # This is the specific line you requested to update no_of_films in TestBookingDetails
    test_detail = TestBookingDetails.query.filter_by(booking_id=booking_id, test_id=test_id).first()
    if not test_detail:
        return {"error": "Test details not found for this specific test/booking"}, 404

    old_value = usage.films_used
    difference = total_new_films_used - old_value

    try:
        # ---- UPDATE INDIVIDUAL TEST DETAIL ----
        # This updates the specific test's film count
        test_detail.no_of_films = films_under_test 
        db.session.add(test_detail)

        # ---- UPDATE GLOBAL FILM USAGE RECORD ----
        usage.last_edited_old_value = old_value
        usage.last_edited_at = datetime.utcnow()
        usage.last_edited_by = edited_by
        usage.usage_type = usage_type
        usage.used_by = edited_by
        usage.used_at = datetime.utcnow()
        usage.films_used = total_new_films_used
        usage.reason = reason
        db.session.add(usage)

        # ---- INVENTORY IMPACT ----
        if difference > 0:
            inventory_transaction(
                quantity=difference,
                transaction_type="OUT",
                handled_by=edited_by,
                branch_id=usage.branch_id,
                booking_id=booking_id,
                reason=f"Film usage increased for Test ID: {test_id}"
            )
        elif difference < 0:
            inventory_transaction(
                quantity=abs(difference),
                transaction_type="ADJUST",
                handled_by=edited_by,
                branch_id=usage.branch_id,
                booking_id=booking_id,
                reason=f"Film usage reduced for Test ID: {test_id}"
            )

        # ---- UPDATE BOOKING TOTAL FILMS ----
        # This calls your existing function to sync the TestBooking table
        update_booking_total_films(booking_id)

        # FINAL COMMIT
        db.session.commit()

        return {
            "message": "Film usage updated successfully",
            "old_value": old_value,
            "new_value": total_new_films_used,
            "difference": difference
        }, 201

    except Exception as e:
        db.session.rollback()
        print("Film usage update error:", str(e))
        return {"error": str(e)}, 500

def get_booking_details(booking_id: int):
    """
    Fetch a booking with related branch, referred doctor, and test details.
    Optimized for speed and safe error handling.
    """

    if not booking_id:
        return {"error": "Invalid booking id"}, 400

    try:
        # --- Fetch booking ---
        booking = (
            db.session.query(TestBooking)
            .filter(TestBooking.id == booking_id)
            .first()
        )

        if not booking:
            return {"error": "Booking not found"}, 404

        # --- Branch ---
        branch = (
            db.session.query(Branch)
            .with_entities(
                Branch.branch_name,
                Branch.contact_number,
                Branch.address,
                Branch.additional_contact_number,
            )
            .filter(Branch.id == booking.branch_id)
            .first()
        )

        # --- Referred doctor ---
        referred_name = None
        if booking.referred_dr:
            referred = (
                db.session.query(Referred)
                .with_entities(Referred.name)
                .filter(Referred.id == booking.referred_dr)
                .first()
            )
            referred_name = referred.name if referred else None

        # --- Tests ---
        tests = (
            db.session.query(
                TestBookingDetails.test_id,
                TestBookingDetails.quantity,
                TestBookingDetails.no_of_films,
                TestBookingDetails.amount,
                TestBookingDetails.reporting_date,
                TestBookingDetails.sample_to_follow,
            )
            .filter(TestBookingDetails.booking_id == booking.id)
            .all()
        )

        test_list = [
            {
                "test_id": t.test_id,
                "quantity": t.quantity,
                "no_of_films": t.no_of_films,
                "amount": float(t.amount or 0),
                "reporting_date": (
                    t.reporting_date.strftime("%d-%b-%Y %I:%M %p")
                    if t.reporting_date else None
                ),
                "test_name": db.session.query(Test_registration.test_name)
                                .filter(Test_registration.id == t.test_id)
                                .scalar(),  
                "sample_to_follow": t.sample_to_follow,
            }
            for t in tests
        ]

        # --- Deserialize technician comments ---
        try:
            technician_comments = (
                json.loads(booking.technician_comments)
                if booking.technician_comments
                else {"comments": []}
            )
        except (json.JSONDecodeError, TypeError):
            technician_comments = {"comments": []}

        # --- Final structured response ---
        return {
            "booking_id": booking.id,
            "mr_no": booking.mr_no,
            "patient_name": booking.patient_name,
            "technician_comments": technician_comments,
            "gender": booking.gender,
            "age": booking.age,
            "contact_no": booking.contact_no,
            "referred_by": referred_name or "Self",
            "branch": {
                "name": branch.branch_name if branch else None,
                "contact": branch.contact_number if branch else None,
                "address": branch.address if branch else None,
                "additional_contact": branch.additional_contact_number if branch else None,
            },
            "financials": {
                "discount_type": booking.discount_type,
                "discount_value": float(booking.discount_value or 0),
                "net_payable": float(booking.net_receivable or 0),
                "received": float(booking.paid_amount or 0),
                "balance": float(booking.due_amount or 0),
            },
            "tests": test_list,
            "printed_at": datetime.utcnow().strftime("%d-%b-%Y %I:%M %p"),
            "current_user": session.get("user_name"),
        }, 200

    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": "Database error: " + str(e.__dict__.get("orig", e))}, 500

    except Exception as e:
        return {"error": "Unexpected error: " + str(e)}, 500


def _format_test_booking(row):
    return {
        "booking_id": row.id,
        "patient_name": row.patient_name,
        "mr_no": row.mr_no,
        "date": row.create_at.strftime("%Y-%m-%d") if row.create_at else None,
        "referred_dr": row.referred_dr,
        "give_share_to": row.give_share_to,
        # This contains: [{"id": 12, "test_name": "xyz", "film_issued": False}, ...]
        "test_booking_details": row.test_booking_details, 
        
        "technician_comments": row.technician_comments,
        "total_amount": float(row.net_receivable or 0),
        "total_films": row.total_no_of_films_used,
        "discount": float(row.discount_value or 0),
        "net_amount": float((row.net_receivable or 0) - (row.discount_value or 0)),
        "received": float(row.paid_amount or 0),
        "balance": float(row.due_amount or 0),
        "branch": row.branch_name,
        "created_by": row.created_by_name,
        "created_at": row.create_at.isoformat() if row.create_at else None,
        "updated_at": row.update_at.isoformat() if row.update_at else None
    }


def get_all_test_bookings(branch_id=None, from_date=None, to_date=None):
    try:
        start_dt = None
        end_dt = None

        if from_date and to_date:
            try:
                from_date_obj = datetime.strptime(from_date, "%Y-%m-%d").date()
                to_date_obj   = datetime.strptime(to_date, "%Y-%m-%d").date()
            except ValueError:
                raise BadRequest("Date format must be YYYY-MM-DD.")

            if from_date_obj > to_date_obj:
                raise BadRequest("from_date cannot be greater than to_date.")

            start_dt = datetime.combine(from_date_obj, time.min)
            end_dt   = datetime.combine(to_date_obj, time.max)

        elif from_date or to_date:
            raise BadRequest("Both from_date and to_date are required for date filtering.")


        query = (
            db.session.query(
                TestBooking.id,
                TestBooking.patient_name,
                TestBooking.mr_no,
                Referred.name.label("referred_dr"),
                TestBooking.net_receivable,
                TestBooking.discount_value,
                TestBooking.paid_amount,
                TestBooking.due_amount,
                TestBooking.create_at,
                TestBooking.total_no_of_films_used,
                TestBooking.technician_comments,
                TestBooking.update_at,
                Branch.branch_name.label("branch_name"),
                User.name.label("created_by_name"),
                TestBooking.give_share_to,
                # --- Aggregating Test Details into a JSON List ---
                func.json_agg(
                    func.json_build_object(
                        'id', Test_registration.id,
                        'test_name', Test_registration.test_name,
                        'film_issued', TestBookingDetails.film_issued
                    )
                ).label("test_booking_details")
            )
            .join(TestBookingDetails, TestBookingDetails.booking_id == TestBooking.id)
            .join(Test_registration, Test_registration.id == TestBookingDetails.test_id)
            .outerjoin(Referred, and_(Referred.id == TestBooking.referred_dr, Referred.is_doctor == True))
            .outerjoin(Branch, Branch.id == TestBooking.branch_id)
            .outerjoin(User, User.id == TestBooking.create_by)
            .group_by(
                TestBooking.id,
                Branch.branch_name,
                User.name,
                Referred.name
            )
        )
        if branch_id:
            query = query.filter(TestBooking.branch_id == branch_id)


        if start_dt and end_dt:
            query = query.filter(
                and_(
                    TestBooking.create_at >= start_dt,
                    TestBooking.create_at <= end_dt
                )
            )

        query = query.order_by(TestBooking.create_at.desc())

        rows = query.all()
        return [_format_test_booking(r) for r in rows], 200

    except SQLAlchemyError as e:
        # It is good practice to log 'e' here before returning
        return {"error": str(e.__dict__.get("orig", e))}, 500
    
def add_booking_comment(booking_id: int, data):
    try:
        comment_text = data.get("comment", "").strip()
        if not comment_text:
            return {"error": "Comment is required"}, 400

        booking = TestBooking.query.get_or_404(booking_id)

        # load existing comments or init
        if booking.technician_comments:
            comments = json.loads(booking.technician_comments)
        else:
            comments = {"comments": []}

        new_comment = {
            "user_id": session.get("user_id"),
            "user_name": session.get("user_name"),
            "role": session.get("user_role"),
            "comment": comment_text,
            "datetime": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        }

        comments["comments"].append(new_comment)

        # save back as string
        booking.technician_comments = json.dumps(comments)

        db.session.add(booking)
        db.session.commit() 
        db.session.refresh(booking)

        print("Saved:", booking.technician_comments)

        return {"message": "Comment added successfully", "data": new_comment}, 201

    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get("orig", e))}, 500

    except Exception as e:
        db.session.rollback()
        return {"error": str(e)}, 500


def get_test_details_booking(booking_id):
    try:
        results = (
            db.session.query(
                TestBookingDetails.test_id,
            Test_registration.test_name,
                # IF no_of_films is Null, DB returns 0 automatically
                func.coalesce(TestBookingDetails.no_of_films, 0).label('films_used')
            )
            .join(Test_registration, TestBookingDetails.test_id == Test_registration.id)
            .filter(TestBookingDetails.booking_id == booking_id)
            .all()
        )

        data = []
        total_booking_films = 0

        for row in results:
            # No need for "if/else" check here anymore
            films_used = row.films_used 
            
            data.append({
                "test_id": row.test_id,
                "test_name": row.test_name,
                "films_used": films_used
            })
            
            total_booking_films += films_used

        return {
            "details": data, 
            "grand_total_films": total_booking_films
        }, 200

    except Exception as e:
        print(f"Error: {str(e)}")
        return {"details": [], "grand_total_films": 0}, 500

def update_test_film_status(booking_id, test_id, film_issued):
    try:
        # Find the specific test record under that booking
        test_detail = TestBookingDetails.query.filter_by(
            booking_id=booking_id, 
            test_id=test_id
        ).first()

        if not test_detail:
            return {"error": "Test record not found for this booking"}, 404

        # Update the status
        test_detail.film_issued = film_issued
        db.session.commit()

        return {"message": "Status updated successfully", "status": film_issued}, 200

    except Exception as e:
        db.session.rollback()
        print(f"Error updating film status: {str(e)}")
        return {"error": "Internal Server Error"}, 500
    
def get_referral_shares_service(filters):
    try:
        print("Filters received:", filters)
        query = db.session.query(
            ReferralShare, 
            TestBooking, 
            Referred.name.label("doctor_name")
        ).join(
            TestBooking, ReferralShare.booking_id == TestBooking.id
        ).join(
            Referred, ReferralShare.referred_id == Referred.id
        )

        # 2. Apply ID Filters
        if filters.get('branch_id'):
            query = query.filter(TestBooking.branch_id == int(filters['branch_id']))
        
        if filters.get('referred_id'):
            query = query.filter(ReferralShare.referred_id == int(filters['referred_id']))

        # 3. Apply Date Filters (Handling Time Boundaries)
        if filters.get('from_date'):
            query = query.filter(TestBooking.create_at >= filters['from_date'])
        
        if filters.get('to_date'):
            # Convert string to datetime and set to end-of-day (23:59:59)
            try:
                to_date_obj = datetime.strptime(str(filters['to_date']), '%Y-%m-%d')
                end_of_day = to_date_obj.replace(hour=23, minute=59, second=59)
                query = query.filter(TestBooking.create_at <= end_of_day)
            except ValueError:
                query = query.filter(TestBooking.create_at <= filters['to_date'])
                
        if filters.get('is_paid') is not None:
            query = query.filter(ReferralShare.is_paid == filters['is_paid'])

        # 4. Execute Query
        results = query.order_by(TestBooking.create_at.desc()).all()
        data = []

        # 5. Process Results
        for share, booking, doc_name in results:
            # Fetch Test Names for this booking
            test_names = []
            try:
                test_details = db.session.query(Test_registration.test_name).join(
                    TestBookingDetails, Test_registration.id == TestBookingDetails.test_id
                ).filter(
                    TestBookingDetails.booking_id == booking.id
                ).all()
                test_names = [t[0] for t in test_details]
            except Exception:
                test_names = []

            data.append({
                "share_id": share.id,
                "booking_id": booking.id,
                "patient_name": booking.patient_name,
                "doctor_name": doc_name,
                "test_list": test_names,
                "booking_date": booking.create_at.strftime('%Y-%m-%d'),
                "created_by": booking.create_by,
                "booking_amount": float(booking.net_receivable) if booking.net_receivable else 0.0,
                # --- NEW: Send Due Amount ---
                "booking_due": float(booking.due_amount) if booking.due_amount else 0.0,
                "share_amount": float(share.share_amount),
                "is_paid": share.is_paid,
                "paid_at": share.paid_at.strftime('%Y-%m-%d') if share.paid_at else None
            })
        
        return data, 200

    except Exception as e:
        return {"error": str(e)}, 500


def toggle_share_payment_service(share_id, user_id, branch_id, custom_description=None):
    try:
        share = ReferralShare.query.get(share_id)
        if not share:   
            return {"error": "Record not found"}, 404

        COMMISSION_HEAD_ID = 4  # Ensure this ID exists in your DB

        if not share.is_paid:
            # --- VALIDATION: Check Booking Due ---
            booking = TestBooking.query.get(share.booking_id)
            if booking and booking.due_amount > 0:
                return {"error": f"Cannot pay commission. Booking #{booking.id} has pending dues of {booking.due_amount}. Please clear dues first."}, 400

            # --- MARK AS PAID ---
            if share.share_amount <= 0:
                return {"error": "Cannot pay a share with 0 amount"}, 400

            # Create Description
            base_desc = f"Ref Share for Booking #{share.booking_id}"
            if custom_description:
                final_desc = f"{base_desc} - {custom_description}"
            else:
                final_desc = base_desc

            # 1. Create Expense with the Description
            new_expense = Expenses(
                branch_id=branch_id,
                expense_head_id=COMMISSION_HEAD_ID,
                amount=share.share_amount,
                description=final_desc,  
                payment_method="Cash", 
                created_by=user_id
            )
            db.session.add(new_expense)
            db.session.flush()

            # 2. Add Payment Transaction (OUT)
            trans = PaymentTransaction(
                branch_id=branch_id,
                expense_id=new_expense.id,
                amount=share.share_amount,
                direction="OUT",
                transaction_type="Expense",
                created_by=user_id
            )
            db.session.add(trans)

            # 3. Update Share Status
            share.is_paid = True
            share.paid_at = datetime.utcnow()
            share.expense_id = new_expense.id
            
            msg = "Marked as Paid"
        else:
            # --- REVERSE PAYMENT (Unpaid) ---
            if share.expense_id:
                # 1. Soft Delete Expense
                expense = Expenses.query.get(share.expense_id)
                if expense:
                    expense.is_deleted = True
                
                # 2. Remove Transaction (Hard delete to correct cash flow balance immediately)
                PaymentTransaction.query.filter_by(expense_id=share.expense_id).delete()

            share.is_paid = False
            share.paid_at = None
            share.expense_id = None
            msg = "Payment Reversed"

        db.session.commit()
        return {"message": msg, "new_status": share.is_paid}, 200

    except Exception as e:
        db.session.rollback()
        return {"error": str(e)}, 500

# ==========================================
# 4. Update Share Amount Logic
# ==========================================
def update_share_amount_service(share_id, new_amount, user_id):
    try:
        share = ReferralShare.query.get(share_id)
        if not share:
            return {"error": "Record not found"}, 404
        
        if share.is_paid:
            return {"error": "Cannot update amount. Revert payment status first."}, 400

        share.share_amount = to_decimal(new_amount, "share_amount")
        # Optional: track who updated it
        # share.updated_by = user_id 
        
        db.session.commit()
        return {"message": "Amount updated successfully", "new_amount": float(share.share_amount)}, 200

    except Exception as e:
        return {"error": str(e)}, 500

def search_patient_service(term, branch_id):
    try:
        if not term:
            return [], 200

        results = (
            db.session.query(TestBooking)
            .filter(TestBooking.branch_id == branch_id)
            .filter(
                or_(
                    TestBooking.mr_no.ilike(f"%{term}%"),
                    TestBooking.contact_no.ilike(f"%{term}%"),
                    TestBooking.patient_name.ilike(f"%{term}%") # Added Name search for convenience
                )
            )
            .order_by(TestBooking.create_at.desc())
            .limit(50) # Limit db fetch
            .all()
        )

        # Deduplicate results based on MR No or Contact No (to avoid showing same patient multiple times)
        unique_patients = []
        seen_identifiers = set()

        for row in results:
            # Create a unique key. Prefer MR No, fallback to Contact No
            identifier = row.mr_no if row.mr_no else row.contact_no
            
            if identifier and identifier not in seen_identifiers:
                seen_identifiers.add(identifier)
                unique_patients.append({
                    "mr_no": row.mr_no,
                    "patient_name": row.patient_name,
                    "gender": row.gender,
                    "age": row.age,
                    "contact_no": row.contact_no,
                    "last_visit": row.create_at.strftime("%Y-%m-%d") if row.create_at else ""
                })

        # Return top 10 unique results
        return unique_patients[:10], 200

    except Exception as e:
        print(f"Error searching patient: {e}")
        return {"error": str(e)}, 500
    
def process_refund_service(booking_id, user_id, branch_id, refund_reason=""):
    try:
        # 1. Fetch the Booking
        booking = TestBooking.query.get(booking_id)
        if not booking:
            return {"error": "Booking not found"}, 404

        # 2. Determine Refund Amount (What was actually paid)
        refund_amount = booking.paid_amount if booking.paid_amount else 0

        # 3. Create Expense Record (Reflects on Current Date)
        # Expense Head ID 6 as requested
        EXPENSE_HEAD_ID_REFUND = 6
        
        expense_desc = f"Refund for Booking #{booking.id} - {booking.patient_name}. Reason: {refund_reason}"
        
        # Only create expense if there is money to refund
        if refund_amount > 0:
            new_expense = Expenses(
                branch_id=branch_id,
                expense_head_id=EXPENSE_HEAD_ID_REFUND,
                amount=refund_amount,
                description=expense_desc,
                payment_method="Cash",
                created_by=user_id
            )
            db.session.add(new_expense)
            db.session.flush() # Generate ID

            # Create Financial Transaction for the Expense (Money OUT)
            exp_trans = PaymentTransaction(
                branch_id=branch_id,
                expense_id=new_expense.id,
                amount=refund_amount,
                direction="OUT",
                transaction_type="Expense",
                created_by=user_id,
                payment_date=datetime.utcnow()
            )
            db.session.add(exp_trans)

        # 4. Remove Existence from Everywhere
        
        # A. Remove Referral Shares
        ReferralShare.query.filter_by(booking_id=booking_id).delete()

        # B. Remove Films Usage & Revert Inventory
        # We delete the usage logs and the inventory transaction logs linked to this booking
        TestFilmUsage.query.filter_by(booking_id=booking_id).delete()
        FilmInventoryTransaction.query.filter_by(booking_id=booking_id).delete()

        # C. Remove Doctor Reporting Assignments
        DoctorReportingdetails.query.filter_by(booking_id=str(booking_id)).delete()

        # D. Remove Booking Details (The specific tests)
        TestBookingDetails.query.filter_by(booking_id=booking_id).delete()

        # E. Unlink Original Payment Transactions (Don't delete, just unlink to keep history valid)
        # If we delete the 'IN' transaction, the cash register for the 23rd won't match.
        # We just unlink it so it doesn't crash when booking is deleted.
        old_transactions = PaymentTransaction.query.filter_by(booking_id=booking_id).all()
        for trans in old_transactions:
            trans.booking_id = None
            trans.payment_type = "Other" # Optional: mark as generic
            # Append note to description or leave as is.
            db.session.add(trans)

        # F. Delete the Booking itself
        db.session.delete(booking)

        # 5. Commit Changes
        db.session.commit()

        return {
            "message": f"Booking #{booking_id} refunded and removed successfully.",
            "refund_amount": float(refund_amount)
        }, 200

    except Exception as e:
        db.session.rollback()
        print(f"Error processing refund: {str(e)}")
        return {"error": str(e)}, 500