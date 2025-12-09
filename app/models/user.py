from app.extensions import db
from datetime import datetime
import json

class User(db.Model):
    __tablename__ = "user"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(225), nullable=False)
    email = db.Column(db.String(225), unique=True, nullable=False)
    password = db.Column(db.String(225), nullable=False)

    branch_id = db.Column(db.Integer)
    role_id = db.Column(db.Integer)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    # Store data as a JSON string: '{"name": "...", "degrees": "...", "title": "..."}'
    _signature_data = db.Column("doctor_signature", db.Text, nullable=True) 

    @property
    def signature_data(self):
        """Returns a python dict from the JSON string"""
        if not self._signature_data:
            # Return default empty structure to prevent errors in Jinja
            return {"name": "", "degrees": "", "title": ""} 
        try:
            return json.loads(self._signature_data)
        except:
            return {"name": "", "degrees": "", "title": ""}

    @signature_data.setter
    def signature_data(self, data):
        """Takes a python dict and saves it as JSON string"""
        self._signature_data = json.dumps(data)