from app.extensions import db

class Branch(db.Model):
    __tablename__ = 'branch'

    id = db.Column(db.Integer, primary_key=True)
    role_name = db.Column(db.String(225), nullable=False)
