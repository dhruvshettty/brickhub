from sqlalchemy import Column, Date, DateTime, Float, Integer, String, Text, func

from app.core.database import Base


class MealLog(Base):
    __tablename__ = "meal_logs"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)
    module = Column(String, nullable=False, default="food")
    meal_slot = Column(String, nullable=False)  # breakfast/pre_workout/post_workout/lunch/dinner/snack

    meal_name = Column(String, nullable=True)
    calories = Column(Float, nullable=True)
    protein_g = Column(Float, nullable=True)
    carbs_g = Column(Float, nullable=True)
    fat_g = Column(Float, nullable=True)
    prep_batch = Column(Integer, nullable=True)
    feedback = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
