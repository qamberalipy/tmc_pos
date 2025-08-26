from flask import session
from app.extensions import db
from app.models import Role, Branch, User   
from werkzeug.security import generate_password_hash
from sqlalchemy.exc import SQLAlchemyError

def _format_user(user, role_name=None, branch_name=None):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": role_name,
        "branch": branch_name,
        "is_active": user.is_active
    }
def _format_userwithID(user, role_id=None, branch_id=None):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role_id": role_id,
        "branch_id": branch_id,
        "is_active": user.is_active
    }
# 1. Create User
def create_user(data):
    try:
        # Validation
        required_fields = ["name", "email", "password", "role_id", "branch_id"]
        for field in required_fields:
            if not data.get(field):
                return {"error": f"{field} is required"}, 400

        # Check duplicate email
        if User.query.filter_by(email=data["email"]).first():
            return {"error": "User with this email already exists"}, 400

        # Create user
        hashed_password = generate_password_hash(data["password"])
        user = User(
            name=data["name"],
            email=data["email"],
            password=hashed_password,
            role_id=data["role_id"],
            branch_id=data["branch_id"]
        )
        db.session.add(user)
        db.session.commit()

        return {"message": "User created successfully", "id": user.id}, 201

    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get('orig', e))}, 500

# 2. Update User
def update_user(user_id, data):
    try:
        user = User.query.get(user_id)
        if not user:
            return {"error": "User not found"}, 404

        # If email changes, check duplicates
        if data.get("email") and data["email"] != user.email:
            if User.query.filter_by(email=data["email"]).first():
                return {"error": "Email already exists"}, 400
            user.email = data["email"]

        if data.get("name"):
            user.name = data["name"]

        # Update password only if provided
        if data.get("password") and data["password"].strip():
            user.password = generate_password_hash(data["password"])

        if data.get("role_id"):
            user.role_id = data["role_id"]

        if data.get("branch_id"):
            user.branch_id = data["branch_id"]

        db.session.commit()
        return {"message": "User updated successfully"}, 200

    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get('orig', e))}, 500

# 3. Get All Users
def get_all_users():
    try:
        current_user_id = session.get("user_id")
        results = (
            db.session.query(User, Role.role.label("role_name"), Branch.branch_name.label("branch_name"))
            .outerjoin(Role, User.role_id == Role.id)
            .outerjoin(Branch, User.branch_id == Branch.id)
            .filter(User.id != current_user_id)
            .all()
        )
        return [_format_user(u, role_name, branch_name) for u, role_name, branch_name in results], 200
    except SQLAlchemyError as e:
        return {"error": str(e.__dict__.get('orig', e))}, 500

# 4. Get User by ID
def get_user_by_id(user_id):
    try:
        result = (
            db.session.query(User, Role.id.label("role_id"), Branch.id.label("branch_id"))
            .outerjoin(Role, User.role_id == Role.id)
            .outerjoin(Branch, User.branch_id == Branch.id)
            .filter(User.id == user_id)
            .first()
        )
        if not result:
            return {"error": "User not found"}, 404

        u, role_name, branch_name = result
        return _format_userwithID(u, role_name, branch_name), 200
    except SQLAlchemyError as e:
        return {"error": str(e.__dict__.get('orig', e))}, 500

# 5. Activate / Deactivate User
def toggle_user_status(user_id, is_active):
    try:
        user = User.query.get(user_id)
        if not user:
            return {"error": "User not found"}, 404

        user.is_active = bool(is_active)
        db.session.commit()
        return {"message": f"User {'activated' if user.is_active else 'deactivated'} successfully"}, 200
    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get('orig', e))}, 500

def update_user_email_and_name(user_id, new_email, new_name):
    try:
        user = User.query.get(user_id)
        if not user:
            return {"error": "User not found"}, 404

        # Check if new email already exists
        if User.query.filter(User.email == new_email, User.id != user_id).first():
            return {"error": "Email already exists"}, 400
        

        user.email = new_email
        user.name = new_name
        db.session.commit()
        return {"message": "Email and name updated successfully"}, 200

    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get('orig', e))}, 500


    
def update_user_password(user_id, new_password):
    try:
        user = User.query.get(user_id)
        if not user:
            return {"error": "User not found"}, 404

        user.password = generate_password_hash(new_password)
        db.session.commit()
        return {"message": "Password updated successfully"}, 200

    except SQLAlchemyError as e:
        db.session.rollback()
        return {"error": str(e.__dict__.get('orig', e))}, 500
