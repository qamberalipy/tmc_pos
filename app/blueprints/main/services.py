from werkzeug.security import generate_password_hash
from app.models.user import User
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
    user = User.query.filter_by(email=email).first()
    if user:
        return user
    return None