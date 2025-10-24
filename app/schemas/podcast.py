from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class PodcastCreate(BaseModel):
    rss_url: str


class TranscriptionResponse(BaseModel):
    id: UUID
    episode_id: UUID
    text: str
    created_at: datetime

    class Config:
        from_attributes = True


class SummaryResponse(BaseModel):
    id: UUID
    episode_id: UUID
    text: str
    audio_path: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class PodcastInfo(BaseModel):
    """Minimal podcast information for episode responses"""

    id: UUID
    title: str

    class Config:
        from_attributes = True


class EpisodeResponse(BaseModel):
    id: UUID
    podcast_id: UUID
    title: str
    description: str | None = None
    audio_url: str
    local_audio_path: str | None = None
    duration: int | None = None
    published_at: datetime | None = None
    created_at: datetime
    image_url: str | None = None
    transcription: TranscriptionResponse | None = None
    summary: SummaryResponse | None = None
    podcast: PodcastInfo | None = None

    class Config:
        from_attributes = True


class PodcastResponse(BaseModel):
    id: UUID
    rss_url: str
    title: str
    description: str | None = None
    author: str | None = None
    image_url: str | None = None
    category: str | None = None
    episode_count: int = 0
    processed_count: int = 0
    latest_episode_date: datetime | None = None
    created_at: datetime
    updated_at: datetime | None = None
    auto_download: int = 0
    auto_download_limit: int | None = None
    episodes: list[EpisodeResponse] = []

    class Config:
        from_attributes = True
        arbitrary_types_allowed = True


class TermResponse(BaseModel):
    id: UUID
    episode_id: UUID
    term: str
    context: str | None = None
    explanation: str | None = None
    elaborate_explanation: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True
