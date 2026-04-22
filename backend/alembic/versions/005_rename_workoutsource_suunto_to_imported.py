"""Rename WorkoutSource 'suunto' to 'imported' — generic sync source

Revision ID: 005
Revises: 004
Create Date: 2026-04-23
"""

import sqlalchemy as sa
from alembic import op

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("workout_logs") as batch_op:
        batch_op.alter_column(
            "source",
            type_=sa.Enum("manual", "imported", name="workoutsource"),
            existing_type=sa.Enum("manual", "suunto", name="workoutsource"),
            existing_nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("workout_logs") as batch_op:
        batch_op.alter_column(
            "source",
            type_=sa.Enum("manual", "suunto", name="workoutsource"),
            existing_type=sa.Enum("manual", "imported", name="workoutsource"),
            existing_nullable=True,
        )
