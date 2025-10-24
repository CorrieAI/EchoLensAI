import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.config import settings
from app.core.timezone import get_utc_now
from app.db.base import Base

# Get embedding dimensions from config
# If you change embedding models, you must run a full reset (see README.md)
# app/migrations/change_vector_dimensions.sql
VECTOR_DIMENSIONS = settings.embedding_dimensions


class Podcast(Base):
    __tablename__ = "podcasts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )  # Nullable for migration compatibility
    rss_url = Column(String, unique=False, nullable=False, index=True)  # Can be shared across users for deduplication
    title = Column(String, nullable=False)
    description = Column(Text)
    author = Column(String)
    image_url = Column(String)
    category = Column(String)
    episode_count = Column(Integer, default=0)
    processed_count = Column(Integer, default=0)
    latest_episode_date = Column(DateTime)
    auto_download = Column(Integer, default=0)  # 0 = disabled, 1 = enabled
    auto_download_limit = Column(Integer, nullable=True)  # NULL = all episodes, N = keep N episodes
    created_at = Column(DateTime, default=get_utc_now)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)

    user = relationship("User", back_populates="podcasts")
    episodes = relationship("Episode", back_populates="podcast", cascade="all, delete-orphan")


class Episode(Base):
    __tablename__ = "episodes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    podcast_id = Column(
        UUID(as_uuid=True), ForeignKey("podcasts.id", ondelete="CASCADE"), nullable=False
    )
    title = Column(String, nullable=False)
    description = Column(Text)
    audio_url = Column(String, nullable=False)
    local_audio_path = Column(String)
    duration = Column(Integer)
    published_at = Column(DateTime, index=True)  # Indexed for sorting/filtering by date
    created_at = Column(DateTime, default=get_utc_now)
    notes = Column(Text)  # User notes in markdown format

    podcast = relationship("Podcast", back_populates="episodes")
    transcription = relationship(
        "Transcription", back_populates="episode", uselist=False, cascade="all, delete-orphan"
    )
    terms = relationship("Term", back_populates="episode", cascade="all, delete-orphan")
    summary = relationship(
        "Summary", back_populates="episode", uselist=False, cascade="all, delete-orphan"
    )
    playback_progress = relationship(
        "PlaybackProgress", back_populates="episode", uselist=False, cascade="all, delete-orphan"
    )
    chat = relationship(
        "Chat", back_populates="episode", uselist=False, cascade="all, delete-orphan"
    )


class Transcription(Base):
    __tablename__ = "transcriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    episode_id = Column(
        UUID(as_uuid=True),
        ForeignKey("episodes.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    text = Column(Text, nullable=False)
    embedding = Column(Vector(VECTOR_DIMENSIONS))
    created_at = Column(DateTime, default=get_utc_now)

    episode = relationship("Episode", back_populates="transcription")


class Term(Base):
    __tablename__ = "terms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    episode_id = Column(
        UUID(as_uuid=True), ForeignKey("episodes.id", ondelete="CASCADE"), nullable=False
    )
    term = Column(String, nullable=False, index=True)
    context = Column(Text)
    explanation = Column(Text)
    elaborate_explanation = Column(Text)
    hidden = Column(Integer, default=0)  # 0 = visible, 1 = hidden
    source = Column(String, default="auto")  # 'auto' or 'manual'
    embedding = Column(Vector(VECTOR_DIMENSIONS))
    created_at = Column(DateTime, default=get_utc_now)

    episode = relationship("Episode", back_populates="terms")


class Summary(Base):
    __tablename__ = "summaries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    episode_id = Column(
        UUID(as_uuid=True),
        ForeignKey("episodes.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    text = Column(Text, nullable=False)
    audio_path = Column(String)
    created_at = Column(DateTime, default=get_utc_now)

    episode = relationship("Episode", back_populates="summary")


class VectorSlice(Base):
    """Vector embeddings for transcript chunks - enables semantic search at episode, podcast, and global levels"""

    __tablename__ = "vector_slices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    episode_id = Column(
        UUID(as_uuid=True),
        ForeignKey("episodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    podcast_id = Column(
        UUID(as_uuid=True),
        ForeignKey("podcasts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    text = Column(Text, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    embedding = Column(Vector(VECTOR_DIMENSIONS), nullable=False)
    created_at = Column(DateTime, default=get_utc_now)

    episode = relationship("Episode")
    podcast = relationship("Podcast")


class TaskHistory(Base):
    """History of processing tasks for display in UI"""

    __tablename__ = "task_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    task_id = Column(String, unique=True, nullable=False, index=True)  # Celery task ID
    episode_id = Column(
        UUID(as_uuid=True),
        ForeignKey("episodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    podcast_id = Column(
        UUID(as_uuid=True),
        ForeignKey("podcasts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status = Column(
        String, nullable=False, index=True
    )  # PENDING, PROGRESS, SUCCESS, FAILURE, CANCELLED - Indexed for filtering
    error_message = Column(Text)
    started_at = Column(DateTime, default=get_utc_now, index=True)  # Indexed for sorting by time
    completed_at = Column(DateTime)

    episode = relationship("Episode")
    podcast = relationship("Podcast")


class PlaybackProgress(Base):
    """Track audio playback position for resuming later"""

    __tablename__ = "playback_progress"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )  # Nullable for migration compatibility
    episode_id = Column(
        UUID(as_uuid=True),
        ForeignKey("episodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )  # Removed unique constraint - multiple users can track same episode
    current_time = Column(Integer, nullable=False)  # Current playback position in seconds
    last_updated = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)

    user = relationship("User", back_populates="playback_progress")
    episode = relationship("Episode", back_populates="playback_progress")


class Chat(Base):
    """Chat conversation tied to a specific episode - one chat per episode per user"""

    __tablename__ = "chats"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )  # Nullable for migration compatibility
    episode_id = Column(
        UUID(as_uuid=True),
        ForeignKey("episodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )  # Removed unique constraint - multiple users can chat with same episode
    title = Column(String)  # Auto-generated title from first message
    created_at = Column(DateTime, default=get_utc_now)
    updated_at = Column(DateTime, default=get_utc_now, onupdate=get_utc_now)

    user = relationship("User", back_populates="chats")
    episode = relationship("Episode")
    messages = relationship(
        "ChatMessage",
        back_populates="chat",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )


class ChatMessage(Base):
    """Individual message in a chat conversation"""

    __tablename__ = "chat_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    chat_id = Column(
        UUID(as_uuid=True), ForeignKey("chats.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role = Column(String, nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=get_utc_now)

    chat = relationship("Chat", back_populates="messages")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )  # Nullable for migration compatibility
    type = Column(String, nullable=False)  # 'task_started', 'task_completed', 'task_failed', etc.
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    level = Column(String, default="info")  # 'success', 'error', 'info', 'warning'
    task_id = Column(String, nullable=True, index=True)  # Link to celery task if applicable
    episode_id = Column(
        UUID(as_uuid=True), ForeignKey("episodes.id", ondelete="CASCADE"), nullable=True
    )
    podcast_id = Column(
        UUID(as_uuid=True), ForeignKey("podcasts.id", ondelete="CASCADE"), nullable=True
    )
    read = Column(Integer, default=0, index=True)  # 0 = unread, 1 = read - Indexed for filtering
    created_at = Column(DateTime, default=get_utc_now, index=True)

    user = relationship("User")
    episode = relationship("Episode")
    podcast = relationship("Podcast")
