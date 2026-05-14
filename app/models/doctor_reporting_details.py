from app.extensions import db
from datetime import datetime, timezone

class DoctorReportingdetails(db.Model):
    __tablename__ = "doctor_reporting_details"

    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.String(225), nullable=False)
    doctor_id = db.Column(db.String(225), nullable=False)
    test_id = db.Column(db.Integer, nullable=False)
    branch_id = db.Column(db.Integer)
    status = db.Column(db.Enum("Pending", "Reported", "Declined", name="status_enum"), default="Pending")
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
    
    # --- NEW CLOUD STORAGE FIELDS (Direct URL Approach) ---
    report_file_url = db.Column(db.String(1024), nullable=True) # Full URL: https://pub-ce9d85fddc754394b8f6c3799281b7e3.r2.dev/...
    report_file_name = db.Column(db.String(255), nullable=True) # Original uploaded filename (e.g., scan.pdf)
    file_mime_type = db.Column(db.String(100), nullable=True)   # e.g., 'application/pdf'
    file_size_bytes = db.Column(db.Integer, nullable=True)      # Size in bytes for UI validation/display
    
    # --- DEPRECATED TEXT FIELDS (Kept nullable for legacy reports) ---
    clinical_info = db.Column(db.Text, nullable=True)
    scanning_protocols = db.Column(db.Text, nullable=True)
    findings = db.Column(db.Text, nullable=True)
    incidental_findings = db.Column(db.Text, nullable=True)
    conclusion = db.Column(db.Text, nullable=True)
    
    # --- TRACKING & AUDIT METADATA ---
    created_by = db.Column(db.Integer, nullable=True)
    updated_by = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))