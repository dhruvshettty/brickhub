"""Initial schema: profiles, workout_logs, weekly_plans, meal_logs, coach_messages

Revision ID: 001
Revises:
Create Date: 2026-04-22
"""

import sqlalchemy as sa
from alembic import op

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "profiles",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.Column("ftp_watts", sa.Integer(), nullable=True),
        sa.Column(
            "race_distance",
            sa.Enum("sprint", "olympic", "70.3", "ironman", name="racedistance"),
            nullable=True,
        ),
        sa.Column("race_date", sa.Date(), nullable=True),
        sa.Column("weekly_training_hours", sa.Integer(), nullable=True, server_default="8"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_profiles_id", "profiles", ["id"])

    op.create_table(
        "workout_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "module",
            sa.Enum("running", "biking", "swimming", "gym", name="moduletype"),
            nullable=False,
        ),
        sa.Column("planned_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("duration_minutes", sa.Float(), nullable=True),
        sa.Column("distance_km", sa.Float(), nullable=True),
        sa.Column("avg_hr", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "source",
            sa.Enum("manual", "suunto", name="workoutsource"),
            nullable=True,
            server_default="manual",
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_workout_logs_id", "workout_logs", ["id"])
    op.create_index("ix_workout_logs_module", "workout_logs", ["module"])

    op.create_table(
        "weekly_plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "module",
            sa.Enum("running", "biking", "swimming", "gym", "food", name="planmoduletype"),
            nullable=False,
        ),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("plan_json", sa.JSON(), nullable=False),
        sa.Column("recalibrated_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_weekly_plans_id", "weekly_plans", ["id"])
    op.create_index("ix_weekly_plans_module", "weekly_plans", ["module"])
    op.create_index("ix_weekly_plans_week_start", "weekly_plans", ["week_start"])

    op.create_table(
        "meal_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column(
            "meal_type",
            sa.Enum("breakfast", "lunch", "dinner", "snack", name="mealtype"),
            nullable=False,
        ),
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

    op.create_table(
        "coach_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "role",
            sa.Enum("user", "assistant", name="messagerole"),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("context_snapshot", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_coach_messages_id", "coach_messages", ["id"])


def downgrade() -> None:
    op.drop_table("coach_messages")
    op.drop_table("meal_logs")
    op.drop_table("weekly_plans")
    op.drop_table("workout_logs")
    op.drop_table("profiles")
