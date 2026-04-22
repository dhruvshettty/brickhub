"""Drop race_distance and race_date from profiles (now lives in module_configs)

Revision ID: 003
Revises: 002
Create Date: 2026-04-23
"""

import sqlalchemy as sa
from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("profiles", "race_distance")
    op.drop_column("profiles", "race_date")


def downgrade() -> None:
    op.add_column("profiles", sa.Column("race_date", sa.Date(), nullable=True))
    op.add_column("profiles", sa.Column("race_distance", sa.String(), nullable=True))
