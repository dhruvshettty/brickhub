"""Add hr_max_bpm to profiles (M5 — personalized HR zones)

Revision ID: 012
Revises: 011
Create Date: 2026-06-21
"""
from alembic import op
import sqlalchemy as sa

revision = '012'
down_revision = '011'
branch_labels = None
depends_on = None


def upgrade():
    # Max heart rate (bpm). Nullable — seeded from 220 − age at profile save,
    # editable in Settings. HR zones derived deterministically (hr_zones.py);
    # nothing here reaches Claude.
    op.add_column('profiles', sa.Column('hr_max_bpm', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('profiles', 'hr_max_bpm')
