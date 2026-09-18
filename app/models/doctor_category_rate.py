from app.extensions import db

class DoctorCategoryRate(db.Model):
    __tablename__ = "doctor_category_rates"
    id = db.Column(db.Integer, primary_key=True)
    doctor_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    category = db.Column(db.String(50), nullable=False)  # Contrast / Full Study / Screening / Other
    rate = db.Column(db.Float, default=0.0)
    __table_args__ = (db.UniqueConstraint('doctor_id', 'category', name='uq_doctor_category'),)
