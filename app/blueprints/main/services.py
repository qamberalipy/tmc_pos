from werkzeug.security import generate_password_hash
from app.models.user import User
from app.models.role import Role
from app.extensions import db
import json

def create_user(name, email, password):
    # Check if user already exists
    existing_user = get_user_by_email(email)
    if existing_user:
        return {'error': 'User already exists with this email.'}

    # Encrypt the password
    hashed_password = generate_password_hash(password)

    # Create new user instance (Explicitly setting signature to None)
    new_user = User(
        name=name, 
        email=email, 
        password=hashed_password,
        _signature_data=None # Ensure this is empty on creation
    )

    # Add and commit to DB
    db.session.add(new_user)
    db.session.commit()

    return {'message': 'User created successfully'}

# app/services/service.py OR wherever get_user_by_email is defined
import json 

def get_user_by_email(email):
    # ... (Your existing query code) ...
    user = (
        db.session.query(User, Role.role)
        .join(Role, User.role_id == Role.id)
        .filter(User.email == email)
        .first()
    )

    if user:
        user_data, role_name = user
        
        # --- FIX STARTS HERE ---
        # 1. Parse the JSON string into a Python Dictionary
        signature_dict = {}
        has_signature = False
        
        if user_data._signature_data:
            try:
                # Turn '{"name":"Dr Ali"}' string into {"name": "Dr Ali"} dict
                signature_dict = json.loads(user_data._signature_data)
                print("Parsed Signature Data:", signature_dict)
                # Validation check
                if signature_dict.get('name') and signature_dict.get('title'):
                    has_signature = True
            except:
                signature_dict = {}

        return {
            "id": user_data.id,
            "name": user_data.name,
            "email": user_data.email,
            "password": user_data.password,
            "branch_id": user_data.branch_id,
            "role_id": user_data.role_id,
            "role": role_name,
            "is_active": user_data.is_active,
            "has_signature": has_signature,
            
            # 2. Return the DICTIONARY, not the string
            "doctor_signature": signature_dict 
        }
    return None