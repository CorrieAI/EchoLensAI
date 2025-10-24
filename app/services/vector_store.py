from uuid import UUID

import structlog
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.podcast import VectorSlice
from app.services.transcription import generate_embedding

logger = structlog.get_logger(__name__)


async def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    """Split text into overlapping chunks for better context preservation"""
    chunks = []
    start = 0

    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]

        if chunk:
            chunks.append(chunk)

        start = end - overlap

    return chunks


async def store_episode_vectors(
    episode_id: UUID, podcast_id: UUID, transcript_text: str, db: AsyncSession
) -> None:
    """Store vector embeddings for episode transcript chunks"""

    logger.info("chunking_transcript_text", episode_id=str(episode_id), char_count=len(transcript_text))
    chunks = await chunk_text(transcript_text)
    logger.info("text_chunks_created", episode_id=str(episode_id), chunk_count=len(chunks))

    for idx, chunk in enumerate(chunks):
        logger.info(
            "generating_chunk_embedding",
            episode_id=str(episode_id),
            chunk_num=idx + 1,
            total_chunks=len(chunks),
            chunk_size=len(chunk)
        )
        embedding = await generate_embedding(chunk)
        logger.info(
            "chunk_embedding_generated",
            episode_id=str(episode_id),
            chunk_num=idx + 1,
            total_chunks=len(chunks),
            embedding_dimensions=len(embedding)
        )

        vector_slice = VectorSlice(
            episode_id=episode_id,
            podcast_id=podcast_id,
            text=chunk,
            chunk_index=idx,
            embedding=embedding,
        )
        db.add(vector_slice)

    await db.commit()
    logger.info(f"Committed {len(chunks)} vector slices to database")


async def search_vectors(
    query: str,
    db: AsyncSession,
    episode_id: UUID | None = None,
    podcast_id: UUID | None = None,
    limit: int = 5,
    similarity_threshold: float = 0.7,
) -> list[dict]:
    """Search vector slices by similarity - episode, podcast, or global scope

    Args:
        similarity_threshold: Maximum cosine distance (0=identical, 2=opposite). Default 0.7 filters fairly similar results.
    """

    query_embedding = await generate_embedding(query)

    # Build query based on scope with similarity threshold
    # Include the distance in the selection
    distance_expr = VectorSlice.embedding.cosine_distance(query_embedding)

    base_query = (
        select(VectorSlice, distance_expr.label("distance"))
        .where(distance_expr <= similarity_threshold)
        .order_by(distance_expr)
        .limit(limit)
    )

    if episode_id:
        base_query = base_query.where(VectorSlice.episode_id == episode_id)
    elif podcast_id:
        base_query = base_query.where(VectorSlice.podcast_id == podcast_id)

    result = await db.execute(base_query)
    rows = result.all()

    return [
        {
            "text": row[0].text,
            "episode_id": row[0].episode_id,
            "podcast_id": row[0].podcast_id,
            "chunk_index": row[0].chunk_index,
            "similarity_score": float(row[1]),  # cosine distance
        }
        for row in rows
    ]


async def get_vector_stats(db: AsyncSession) -> dict:
    """Get statistics about vector storage"""
    result = await db.execute(
        text("""
            SELECT
                COUNT(*) as total_slices,
                COUNT(DISTINCT episode_id) as total_episodes,
                COUNT(DISTINCT podcast_id) as total_podcasts
            FROM vector_slices
        """)
    )
    row = result.fetchone()

    return {
        "total_slices": row[0] if row else 0,
        "total_episodes": row[1] if row else 0,
        "total_podcasts": row[2] if row else 0,
    }
