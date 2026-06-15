"""Strava integration: tokens + sync cursor on profile, external_id on workout_logs

Revision ID: 010
Revises: 009
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = '010'
down_revision = '009'
branch_labels = None
depends_on = None


def upgrade():
    # Single-user, self-hosted: the one profile holds the OAuth token + sync cursor.
    op.add_column('profiles', sa.Column('strava_athlete_id', sa.String(), nullable=True))
    op.add_column('profiles', sa.Column('strava_access_token', sa.String(), nullable=True))
    op.add_column('profiles', sa.Column('strava_refresh_token', sa.String(), nullable=True))
    op.add_column('profiles', sa.Column('strava_token_expires_at', sa.Integer(), nullable=True))
    op.add_column('profiles', sa.Column('strava_last_synced_at', sa.DateTime(), nullable=True))

    # Provider activity id for idempotent dedupe (re-syncs never double-insert).
    op.add_column('workout_logs', sa.Column('external_id', sa.String(), nullable=True))
    op.create_index('ix_workout_logs_external_id', 'workout_logs', ['external_id'])


def downgrade():
    op.drop_index('ix_workout_logs_external_id', table_name='workout_logs')
    op.drop_column('workout_logs', 'external_id')
    op.drop_column('profiles', 'strava_last_synced_at')
    op.drop_column('profiles', 'strava_token_expires_at')
    op.drop_column('profiles', 'strava_refresh_token')
    op.drop_column('profiles', 'strava_access_token')
    op.drop_column('profiles', 'strava_athlete_id')
