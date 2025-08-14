from venv import logger
from app.extensions import db
from app.models import Branch, Role,User
from sqlalchemy.exc import SQLAlchemyError

# 1. Create Branch
def create_branch(data):
    branch = Branch(
        branch_name=data.get('branch_name'),
        description=data.get('description'),
        created_by=data.get('created_by')
    )
    db.session.add(branch)
    db.session.commit()
    return {"message": "Branch created successfully", "id": branch.id}

# 2. Update Branch
def update_branch(branch_id, data):
    branch = Branch.query.get(branch_id)
    if not branch:
        return {"error": "Branch not found"}

    branch.branch_name = data.get('branch_name', branch.branch_name)
    branch.description = data.get('description', branch.description)
    branch.updated_by = data.get('updated_by', branch.updated_by)

    db.session.commit()
    return {"message": "Branch updated successfully"}

# 3. Get All Branches
def get_all_branches():
    branches = (
        db.session.query(
            Branch.id,
            Branch.branch_name,
            Branch.description,
            User.name.label("created_by_name"),
            Branch.is_active,
            Branch.created_at
        )
        .join(User, User.id == Branch.created_by)
        .all()
    )

    return [
        {
            "id": b.id,
            "branch_name": b.branch_name,
            "description": b.description,
            "created_by": b.created_by_name,
            "is_active": b.is_active,
            "created_at": b.created_at
        }
        for b in branches
    ]

# 4. Get Branch by ID
def get_branch_by_id(branch_id):
    # Join Branch with User, filter by branch_id
    branch = (
        db.session.query(
            Branch.id,
            Branch.branch_name,
            Branch.description,
            User.name.label("created_by_name"),
            Branch.is_active,
            Branch.created_at
        )
        .join(User, User.id == Branch.created_by)
        .filter(Branch.id == branch_id)
        .first()
    )

    if not branch:
        return {"error": "Branch not found"}

    return {
        "id": branch.id,
        "branch_name": branch.branch_name,
        "description": branch.description,
        "created_by": branch.created_by_name,
        "is_active": branch.is_active,
        "created_at": branch.created_at
    }

# 5. Activate / Deactivate Branch
def toggle_branch_status(branch_id, is_active):
    branch = Branch.query.get(branch_id)
    if not branch:
        return {"error": "Branch not found"}

    branch.is_active = bool(is_active)
    db.session.commit()

    return {
        "message": f"Branch {'activated' if branch.is_active else 'deactivated'} successfully",
        "is_active": branch.is_active
    }

def get_all_branches_service():
    try:
        branches = Branch.query.filter(Branch.is_active == True).all()
        return [
            {
                "id": branch.id,
                "name": branch.branch_name
            }
            for branch in branches
        ]
    except SQLAlchemyError as e:
        print(f"Database error while fetching branches: {str(e)}")
        raise
    except Exception as e:
        print(f"Unexpected error in get_all_branches_service: {str(e)}")
        raise


def get_all_roles_service():
    try:
        roles = Role.query.all()
        return [
            {
                "id": role.id,
                "name": role.role
            }
            for role in roles
        ]
    except SQLAlchemyError as e:
        print(f"Database error while fetching roles: {str(e)}")
        raise
    except Exception as e:
        print(f"Unexpected error in get_all_roles_service: {str(e)}")
        raise