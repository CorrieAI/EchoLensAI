from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ChatRequest(BaseModel):
    query: str
    episode_id: int | None = None
    podcast_id: int | None = None
    conversation_history: list[dict] | None = None


class ContextSlice(BaseModel):
    text: str
    episode_id: int
    podcast_id: int
    chunk_index: int


class ChatResponse(BaseModel):
    answer: str
    context_slices: list[ContextSlice]
    scope: str


class ChatSessionResponse(BaseModel):
    id: UUID
    episode_id: UUID
    title: str | None = None
    created_at: datetime
    updated_at: datetime
    episode: "EpisodeBasic | None" = None

    class Config:
        from_attributes = True


class PodcastBasic(BaseModel):
    id: UUID
    title: str

    class Config:
        from_attributes = True


class EpisodeBasic(BaseModel):
    id: UUID
    title: str
    podcast: PodcastBasic | None = None

    class Config:
        from_attributes = True


# Update forward references
ChatSessionResponse.model_rebuild()
