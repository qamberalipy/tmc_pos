from werkzeug.security import generate_password_hash
from app.models.user import User
from app.models.role import Role
from app.extensions import db

def create_user(name, email, password):
    # Check if user already exists
    existing_user = get_user_by_email(email)
    if existing_user:
        return {'error': 'User already exists with this email.'}

    # Encrypt the password
    hashed_password = generate_password_hash(password)

    # Create new user instance
    new_user = User(name=name, email=email, password=hashed_password)

    # Add and commit to DB
    db.session.add(new_user)
    db.session.commit()

    return {'message': 'User created successfully'}
def get_user_by_email(email):
    user = (
        db.session.query(User, Role.role)
        .join(Role, User.role_id == Role.id)
        .filter(User.email == email)
        .first()
    )

    if user:
        user_data, role_name = user
        return {
            "id": user_data.id,
            "name": user_data.name,
            "email": user_data.email,
            "password": user_data.password,
            "branch_id": user_data.branch_id,
            "role_id": user_data.role_id,
            "role": role_name,
            "is_active": user_data.is_active
        }
    return None