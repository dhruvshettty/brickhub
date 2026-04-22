"""Drop ftp_watts from profiles (will live in biking module_config)

Revision ID: 004
Revises: 003
Create Date: 2026-04-23
"""

import sqlalchemy as sa
from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("profiles", "ftp_watts")


def downgrade() -> None:
    op.add_column("profiles", sa.Column("ftp_watts", sa.Integer(), nullable=True))
