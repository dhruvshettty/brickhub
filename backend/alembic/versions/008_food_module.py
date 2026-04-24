"""Food module: update meal_logs schema, add config_snapshot to weekly_plans

Revision ID: 008
Revises: 007
Create Date: 2026-04-25
"""

import sqlalchemy as sa
from alembic import op

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add config_snapshot to weekly_plans for plan invalidation tracking
    op.add_column("weekly_plans", sa.Column("config_snapshot", sa.JSON(), nullable=True))

    # Recreate meal_logs with food module schema
    # meal_type enum replaced by meal_slot varchar; module/prep_batch/feedback added
    op.drop_table("meal_logs")
    op.create_table(
        "meal_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("module", sa.String(), nullable=False, server_default="food"),
        sa.Column("meal_slot", sa.String(), nullable=False),
        sa.Column("meal_name", sa.String(), nullable=True),
        sa.Column("calories", sa.Float(), nullable=True),
        sa.Column("protein_g", sa.Float(), nullable=True),
        sa.Column("carbs_g", sa.Float(), nullable=True),
        sa.Column("fat_g", sa.Float(), nullable=True),
        sa.Column("prep_batch", sa.Integer(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_meal_logs_id", "meal_logs", ["id"])
    op.create_index("ix_meal_logs_date", "meal_logs", ["date"])


def downgrade() -> None:
    op.drop_index("ix_meal_logs_date", table_name="meal_logs")
    op.drop_index("ix_meal_logs_id", table_name="meal_logs")
    op.drop_table("meal_logs")
    op.create_table(
        "meal_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("meal_type", sa.VARCHAR(9), nullable=False),
        sa.Column("calories", sa.Float(), nullable=True),
        sa.Column("protein_g", sa.Float(), nullable=True),
        sa.Column("carbs_g", sa.Float(), nullable=True),
        sa.Column("fat_g", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_meal_logs_id", "meal_logs", ["id"])
    op.create_index("ix_meal_logs_date", "meal_logs", ["date"])
    op.drop_column("weekly_plans", "config_snapshot")
