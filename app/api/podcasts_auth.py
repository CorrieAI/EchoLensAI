"""Helper functions for podcast authorization and user filtering."""

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.podcast import Episode, Podcast
from app.models.user import User


async def verify_podcast_ownership(
    podcast_id: UUID,
    current_user: User,
    db: AsyncSession
) -> Podcast:
    """
    Verify that the current user owns the podcast.

    Args:
        podcast_id: Podcast UUID
        current_user: Current authenticated user
        db: Database session

    Returns:
        Podcast if user is owner or admin

    Raises:
        HTTPException: 404 if not found, 403 if not authorized
    """
    result = await db.execute(select(Podcast).where(Podcast.id == podcast_id))
    podcast = result.scalar_one_or_none()

    if not podcast:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Podcast not found"
        )

    # Users can only access their own podcasts (including admins)
    if str(podcast.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this podcast"
        )

    return podcast


async def verify_episode_ownership(
    episode_id: UUID,
    current_user: User,
    db: AsyncSession
) -> Episode:
    """
    Verify that the current user owns the episode's podcast.

    Args:
        episode_id: Episode UUID
        current_user: Current authenticated user
        db: Database session

    Returns:
        Episode if user is owner or admin

    Raises:
        HTTPException: 404 if not found, 403 if not authorized
    """
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Episode)
        .options(selectinload(Episode.podcast))
        .where(Episode.id == episode_id)
    )
    episode = result.scalar_one_or_none()

    if not episode:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Episode not found"
        )

    # Users can only access episodes from their own podcasts (including admins)
    if str(episode.podcast.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this episode"
        )

    return episode


def apply_user_filter(query, current_user: User):
    """
    Apply user_id filter to query - all users only see their own podcasts.

    Args:
        query: SQLAlchemy query to filter
        current_user: Current authenticated user

    Returns:
        Filtered query
    """
    # All users (including admins) only see their own podcasts
    # This prevents duplicate episodes when multiple users add the same podcast
    query = query.where(Podcast.user_id == current_user.id)

    return query


def get_user_storage_path(user_id: UUID, podcast_title: str) -> str:
    """
    Get storage path for user's podcast files.

    Format: echolens_data/uploads/{user_id}/{podcast_slug}/

    Args:
        user_id: User's UUID
        podcast_title: Podcast title to slugify

    Returns:
        Path string for user's podcast storage
    """
    import re

    def slugify(text: str) -> str:
        text = text.lower()
        text = re.sub(r"[^\w\s-]", "", text)
        text = re.sub(r"[-\s]+", "_", text)
        return text.strip("_")[:100] or "unknown"

    podcast_slug = slugify(podcast_title)
    return f"echolens_data/uploads/{user_id}/{podcast_slug}"


async def verify_term_ownership(
    term_id: UUID,
    current_user: User,
    db: AsyncSession
):
    """
    Verify that the current user owns the term's episode's podcast.

    Args:
        term_id: Term UUID
        current_user: Current authenticated user
        db: Database session

    Returns:
        Term if user is owner or admin

    Raises:
        HTTPException: 404 if not found, 403 if not authorized
    """
    from sqlalchemy.orm import selectinload

    from app.models.podcast import Term

    result = await db.execute(
        select(Term)
        .options(
            selectinload(Term.episode).selectinload(Episode.podcast)
        )
        .where(Term.id == term_id)
    )
    term = result.scalar_one_or_none()

    if not term:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Term not found"
        )

    # Verify ownership via episode->podcast chain
    if not current_user.is_admin and str(term.episode.podcast.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this term"
        )

    return term
