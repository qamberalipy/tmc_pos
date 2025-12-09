from app.extensions import db
from datetime import datetime

class DoctorReportingdetails(db.Model):
    __tablename__ = "doctor_reporting_details"

    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.String(225), nullable=False)
    doctor_id = db.Column(db.String(225), nullable=False)
    test_id = db.Column(db.Integer, nullable=False)
    branch_id = db.Column(db.Integer)
    status = db.Column(db.Enum("Pending", "Reported", "Declined", name="status_enum"),default="Pending")
    report_details_id = db.Column(db.Integer, nullable=True)
    report_at = db.Column(db.DateTime, default=datetime.utcnow)
    assign_by = db.Column(db.Integer)
    is_active = db.Column(db.Boolean, default=True)

class DoctorReportData(db.Model):
    __tablename__ = "doctor_report_data"

    id = db.Column(db.Integer, primary_key=True)
    patient_name = db.Column(db.String(225), nullable=False)
    gender = db.Column(db.String(225), nullable=False)  
    age = db.Column(db.Integer, nullable=False)
    referred_doctor = db.Column(db.String(225), nullable=True)
    test_id = db.Column(db.Integer, nullable=False)
    booking_id = db.Column(db.String(225), nullable=False)
    clinical_info = db.Column(db.Text, nullable=True)
    scanning_protocols = db.Column(db.Text, nullable=True)
    findings = db.Column(db.Text, nullable=True)
    conclusion = db.Column(db.Text, nullable=True)
    created_by = db.Column(db.Integer, nullable=True)
    updated_by = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)