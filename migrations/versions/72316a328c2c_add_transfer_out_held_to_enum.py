"""add_transfer_out_held_to_enum

Revision ID: 72316a328c2c
Revises: 31b2ef39c683
Create Date: 2026-03-07 04:59:54.281339

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '72316a328c2c'
down_revision = '31b2ef39c683'
branch_labels = None
depends_on = None


def upgrade():
    # Use autocommit_block because PostgreSQL does not allow ALTER TYPE inside a normal transaction
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE trans_type ADD VALUE IF NOT EXISTS 'TransferOut_Held'")


def downgrade():
    # PostgreSQL does not easily support removing a single value from an ENUM once added.
    # Therefore, we pass on the downgrade.
    pass