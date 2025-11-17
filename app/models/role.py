from app.extensions import db

class Role(db.Model):
    __tablename__ = "role"

    id = db.Column(db.Integer, primary_key=True)
    role = db.Column(db.String(225), nullable=False)
