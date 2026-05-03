"""Add height_cm, sex, unit_preference to profiles

Revision ID: 009
Revises: 008
Create Date: 2026-05-03
"""
from alembic import op
import sqlalchemy as sa

revision = '009'
down_revision = '008'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('profiles', sa.Column('height_cm', sa.Float(), nullable=True))
    op.add_column('profiles', sa.Column('sex', sa.String(), nullable=True))
    op.add_column('profiles', sa.Column('unit_preference', sa.String(), nullable=True, server_default='metric'))


def downgrade():
    op.drop_column('profiles', 'unit_preference')
    op.drop_column('profiles', 'sex')
    op.drop_column('profiles', 'height_cm')
