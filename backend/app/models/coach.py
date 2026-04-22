import enum

from sqlalchemy import Column, DateTime, Enum, Integer, JSON, Text, func

from app.core.database import Base


class MessageRole(str, enum.Enum):
    user = "user"
    assistant = "assistant"


class CoachMessage(Base):
    __tablename__ = "coach_messages"

    id = Column(Integer, primary_key=True, index=True)
    role = Column(Enum(MessageRole), nullable=False)
    content = Column(Text, nullable=False)
    context_snapshot = Column(JSON, nullable=True)  # what context was injected

    created_at = Column(DateTime, server_default=func.now())
