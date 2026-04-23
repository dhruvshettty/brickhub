"""Add usage_logs table for Claude API token tracking

Revision ID: 006
Revises: 005
Create Date: 2026-04-23
"""

import sqlalchemy as sa
from alembic import op

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "usage_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "call_type",
            sa.Enum("plan_generation", "recalibration", "coach_chat", name="calltype"),
            nullable=False,
        ),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cache_creation_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cache_read_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("estimated_cost_usd", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_usage_logs_id", "usage_logs", ["id"])
    op.create_index("ix_usage_logs_call_type", "usage_logs", ["call_type"])
    op.create_index("ix_usage_logs_created_at", "usage_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_usage_logs_created_at", table_name="usage_logs")
    op.drop_index("ix_usage_logs_call_type", table_name="usage_logs")
    op.drop_index("ix_usage_logs_id", table_name="usage_logs")
    op.drop_table("usage_logs")
