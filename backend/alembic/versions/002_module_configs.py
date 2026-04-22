"""Add module_configs table for per-module onboarding configuration

Revision ID: 002
Revises: 001
Create Date: 2026-04-22
"""

import sqlalchemy as sa
from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "module_configs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("profile_id", sa.Integer(), sa.ForeignKey("profiles.id"), nullable=False),
        sa.Column("module", sa.String(), nullable=False),
        sa.Column("config_json", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("profile_id", "module", name="uq_module_configs_profile_module"),
    )
    op.create_index("ix_module_configs_profile_module", "module_configs", ["profile_id", "module"])


def downgrade() -> None:
    op.drop_index("ix_module_configs_profile_module", table_name="module_configs")
    op.drop_table("module_configs")
