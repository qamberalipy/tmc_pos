from app.extensions import db
from datetime import datetime

class DoctorReportingdetails(db.Model):
    __tablename__ = "doctor_reporting_details"

    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.String(225), nullable=False)
    doctor_id = db.Column(db.String(225), nullable=False)
    branch_id = db.Column(db.Integer)
    status = db.Column(db.Enum("Pending", "Reported", "Declined", name="status_enum"),default="Pending")
    report_at = db.Column(db.DateTime, default=datetime.utcnow)
    assign_by = db.Column(db.Integer)
    report_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
