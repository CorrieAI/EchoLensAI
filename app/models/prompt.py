import uuid

from sqlalchemy import Column, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.types import DateTime

from app.core.timezone import get_utc_now
from app.db.base import Base


class Prompt(Base):
    __tablename__ = "prompts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    key = Column(String, unique=True, nullable=False, index=True)  # e.g., "summarization.chunk"
    name = Column(String, nullable=False)  # Display name, e.g., "Chunk Summary"
    category = Column(String, nullable=False, index=True)  # e.g., "summarization", "term_extraction", "chat"
    content = Column(Text, nullable=False)  # The actual prompt text
    default_content = Column(Text, nullable=False)  # Original default for reset functionality
    description = Column(Text)  # Explains what this prompt does
    variables = Column(JSONB)  # JSON array of available variables like ["transcript", "chunk_num"]
    created_at = Column(DateTime, default=get_utc_now)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)
