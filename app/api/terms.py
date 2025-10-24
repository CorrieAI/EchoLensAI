from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.podcasts_auth import verify_term_ownership
from app.core.config import settings
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.podcast import Term
from app.models.user import User
from app.services.openai_client import get_chat_client
from app.services.prompt_loader import render_prompt

router = APIRouter()


@router.post("/{term_id}/elaborate")
async def elaborate_term(
    term_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Generate elaborate explanation for a term (requires ownership)"""
    # Verify ownership - this will raise 403 if user doesn't own the term
    term = await verify_term_ownership(term_id, current_user, db)

    # Generate elaborate explanation using AI with database prompt
    prompt = await render_prompt(
        db,
        "term_extraction.elaborate",
        term=term.term,
        explanation=term.explanation,
        context=term.context if term.context else "Not available",
    )

    client = get_chat_client()
    response = await client.chat.completions.create(
        model=settings.chat_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
    )

    elaborate_text = response.choices[0].message.content

    # Save to database
    term.elaborate_explanation = elaborate_text
    await db.commit()

    # Add elaborate explanation to vector store as a new slice
    from app.models.podcast import Episode, VectorSlice
    from app.services.transcription import generate_embedding

    # Get the episode for this term
    episode_result = await db.execute(select(Episode).where(Episode.id == term.episode_id))
    episode = episode_result.scalar_one_or_none()

    if episode:
        # Create content for the vector slice
        vector_content = f"Term: {term.term}\n\nElaborate Explanation:\n{elaborate_text}"

        # Generate embedding
        embedding = await generate_embedding(vector_content)

        # Find the highest chunk index for this episode to append after
        max_chunk_result = await db.execute(
            select(func.max(VectorSlice.chunk_index)).where(VectorSlice.episode_id == episode.id)
        )
        max_chunk = max_chunk_result.scalar() or -1

        # Create new vector slice
        # Note: Store term metadata in the text content itself for retrieval
        vector_slice = VectorSlice(
            episode_id=episode.id,
            podcast_id=episode.podcast_id,
            chunk_index=max_chunk + 1,
            text=vector_content,
            embedding=embedding,
        )
        db.add(vector_slice)
        await db.commit()

    return {"success": True, "elaborate_explanation": elaborate_text}
