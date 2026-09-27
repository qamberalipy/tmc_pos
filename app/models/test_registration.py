from app.extensions import db
from sqlalchemy import JSON
from datetime import datetime, timezone

CATEGORY_CHOICES = ["Contrast", "Full Study", "Screening", "Other"]

class Test_registration(db.Model):
    __tablename__ = "test_registration"

    # NOTE: Test registration is unified across all branches — one shared test catalog.
    # The branch_id column is retained for DB schema backward-compatibility without migration,
    # but is NO LONGER used for filtering/scoping test queries.
    IS_BRANCH_SCOPED = False

    id = db.Column(db.Integer, primary_key=True)
    test_name = db.Column(db.String(225), nullable=False)
    sample_collection = db.Column(db.String(50))

    department_id = db.Column(db.Integer)
    category = db.Column(db.String(50), nullable=True, default="Other", index=True)
    charges = db.Column(db.Float, nullable=False)
    report_charges = db.Column(db.Float, default=0.0)

    required_days = db.Column(db.String(225), nullable=False)
    sequence_no = db.Column(db.String(225))
    no_of_films = db.Column(db.Integer)

    description = db.Column(db.String(225))
    # Legacy/unused for scoping queries; preserved for DB schema compatibility without migration
    branch_id = db.Column(db.Integer, nullable=False)

    is_active = db.Column(db.Boolean, default=True)

    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    created_by = db.Column(db.Integer)
    updated_by = db.Column(db.Integer)

    @classmethod
    def get_all_active(cls):
        """Returns all active tests across all branches (unified catalog)."""
        return cls.query.filter_by(is_active=True).order_by(cls.test_name.asc()).all()