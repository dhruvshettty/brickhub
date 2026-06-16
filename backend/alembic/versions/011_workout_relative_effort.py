"""Relative Effort (Strava suffer_score) on workout_logs for HR-based fatigue

Revision ID: 011
Revises: 010
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa

revision = '011'
down_revision = '010'
branch_labels = None
depends_on = None


def upgrade():
    # Strava per-activity Relative Effort (suffer_score). Null when the run has no
    # HR data; cross-module fatigue falls back to a minutes estimate in that case.
    op.add_column('workout_logs', sa.Column('relative_effort', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('workout_logs', 'relative_effort')
