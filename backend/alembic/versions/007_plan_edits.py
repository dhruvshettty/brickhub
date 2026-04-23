"""Add plan_edits table for coach-initiated plan changes

Revision ID: 007
Revises: 006
Create Date: 2026-04-23
"""

import sqlalchemy as sa
from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plan_edits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("module", sa.String(), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("changed_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("original_session", sa.JSON(), nullable=False),
        sa.Column("new_session", sa.JSON(), nullable=False),
        sa.Column("reason", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_plan_edits_id", "plan_edits", ["id"])
    op.create_index("ix_plan_edits_week_start", "plan_edits", ["week_start"])
    op.create_index("ix_plan_edits_date", "plan_edits", ["date"])


def downgrade() -> None:
    op.drop_index("ix_plan_edits_date", table_name="plan_edits")
    op.drop_index("ix_plan_edits_week_start", table_name="plan_edits")
    op.drop_index("ix_plan_edits_id", table_name="plan_edits")
    op.drop_table("plan_edits")
