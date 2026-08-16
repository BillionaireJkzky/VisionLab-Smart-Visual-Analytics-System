"""add user settings

Revision ID: f1a9c3d2e8b4
Revises: 3c65b2676914
Create Date: 2026-08-12 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a9c3d2e8b4'
down_revision: Union[str, None] = '3c65b2676914'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('settings', sa.JSON(), nullable=False, server_default='{}'),
    )


def downgrade() -> None:
    op.drop_column('users', 'settings')
