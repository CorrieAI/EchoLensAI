import shutil
from pathlib import Path
from uuid import UUID

import structlog
from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.podcasts_auth import (
    apply_user_filter,
    get_user_storage_path,
    verify_episode_ownership,
    verify_podcast_ownership,
    verify_term_ownership,
)
from app.core.security import get_current_user
from app.core.timezone import get_utc_now
from app.db.session import get_db
from app.exceptions import ValidationError
from app.models.podcast import Episode, Podcast, Summary, Term, Transcription
from app.models.user import User
from app.schemas.podcast import (
    EpisodeResponse,
    PodcastCreate,
    PodcastResponse,
    SummaryResponse,
    TermResponse,
    TranscriptionResponse,
)
from app.services import rss_parser
from app.services.validators import validate_external_url
from app.tasks.episode_processing import process_episode_task

logger = structlog.get_logger(__name__)
router = APIRouter()
episodes_router = APIRouter()


@router.post("", response_model=PodcastResponse)
async def add_podcast(
    podcast_data: PodcastCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate RSS URL to prevent SSRF attacks
    try:
        validate_external_url(podcast_data.rss_url)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=f"Invalid RSS URL: {e!s}")

    # Check if THIS USER already has this podcast
    result = await db.execute(
        select(Podcast).where(
            Podcast.rss_url == podcast_data.rss_url,
            Podcast.user_id == current_user.id
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Return the existing podcast instead of raising an error (idempotent operation)
        logger.info("podcast_already_exists", user_id=str(current_user.id), podcast_id=str(existing.id), rss_url=podcast_data.rss_url)
        return PodcastResponse(
            id=existing.id,
            rss_url=existing.rss_url,
            title=existing.title,
            description=existing.description,
            author=existing.author,
            image_url=existing.image_url,
            category=existing.category,
            created_at=existing.created_at,
        )

    try:
        feed_data = rss_parser.parse_podcast_feed(podcast_data.rss_url)
    except ValueError as e:
        # RSS parsing error - return 400 with helpful message
        error_msg = str(e)
        # Provide more user-friendly messages
        if "decompressing" in error_msg or "decompression" in error_msg:
            raise HTTPException(
                status_code=400,
                detail="Failed to fetch RSS feed (network or server issue). Please try again in a moment.",
            )
        raise HTTPException(status_code=400, detail=f"Invalid RSS feed: {error_msg}")
    except Exception as e:
        # Unexpected network/parsing errors
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching RSS feed: {e!s}. Please verify the URL and try again.",
        )

    try:
        podcast = Podcast(
            rss_url=podcast_data.rss_url,
            user_id=current_user.id,
            **feed_data
        )

        db.add(podcast)
        await db.commit()
        await db.refresh(podcast)

        await fetch_episodes(podcast.id, podcast_data.rss_url, db)

        # Create notification
        from app.models.podcast import Notification

        notification = Notification(
            type="podcast_added",
            title="Podcast Added",
            message=f"Successfully added '{podcast.title}' with {podcast.episode_count} episodes",
            level="success",
            podcast_id=podcast.id,
            user_id=current_user.id,
            read=0,
        )
        db.add(notification)
        await db.commit()

        # Reload podcast with episodes relationship
        result = await db.execute(
            select(Podcast)
            .options(
                selectinload(Podcast.episodes).selectinload(Episode.transcription),
                selectinload(Podcast.episodes).selectinload(Episode.summary),
            )
            .where(Podcast.id == podcast.id)
        )
        podcast_with_episodes = result.scalar_one()

        # Ensure episodes are loaded
        _ = podcast_with_episodes.episodes

        return podcast_with_episodes
    except HTTPException:
        # Re-raise HTTP exceptions
        await db.rollback()
        raise
    except Exception as e:
        # Database errors
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {e!s}")


@router.get("/categories")
async def list_categories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all unique podcast categories for current user's podcasts"""
    query = (
        select(Podcast.category)
        .where(Podcast.category.isnot(None))
        .distinct()
        .order_by(Podcast.category)
    )

    # Filter by user
    query = apply_user_filter(query, current_user)

    result = await db.execute(query)
    categories = [row[0] for row in result.all()]
    return {"categories": categories}


@router.get("")
async def list_podcasts(
    search: str | None = None,
    sort: str | None = None,
    category: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import asc, desc, or_

    # Build base query - don't eagerly load episodes
    query = select(Podcast)

    # Filter by user (admins see all, users see only their own)
    query = apply_user_filter(query, current_user)

    # Apply search filter
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Podcast.title.ilike(search_term),
                Podcast.author.ilike(search_term),
                Podcast.description.ilike(search_term),
            )
        )

    # Apply category filter
    if category:
        query = query.where(Podcast.category == category)

    # Apply sorting
    sort_by = sort or "updated_desc"
    if sort_by == "name_asc":
        query = query.order_by(asc(Podcast.title))
    elif sort_by == "name_desc":
        query = query.order_by(desc(Podcast.title))
    elif sort_by == "updated_desc":
        # Sort by latest episode date (most recent first), with nulls last
        query = query.order_by(desc(Podcast.latest_episode_date).nulls_last())
    elif sort_by == "episodes_desc":
        query = query.order_by(desc(Podcast.episode_count))

    result = await db.execute(query)
    podcasts = list(result.scalars().all())

    # Convert to response format without triggering lazy loads
    return [
        PodcastResponse.model_construct(
            id=p.id,
            rss_url=p.rss_url,
            title=p.title,
            description=p.description,
            author=p.author,
            image_url=p.image_url,
            category=p.category,
            episode_count=p.episode_count,
            processed_count=p.processed_count,
            latest_episode_date=p.latest_episode_date,
            created_at=p.created_at,
            updated_at=p.updated_at,
            episodes=[],  # Don't load episodes for list view
        )
        for p in podcasts
    ]


@router.get("/episodes/processed")
async def list_processed_episodes(
    search: str | None = None,
    sort: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all episodes that have been AI processed (with summaries), sorted by processing date"""
    from sqlalchemy import or_

    # Get episodes with summaries, including podcast and summary info
    query = (
        select(Episode)
        .join(Summary, Summary.episode_id == Episode.id)
        .join(Podcast, Podcast.id == Episode.podcast_id)
        .options(
            selectinload(Episode.transcription),
            selectinload(Episode.summary),
            selectinload(Episode.podcast),
        )
    )

    # Filter by user - all users (including admins) only see their own content
    query = query.where(Podcast.user_id == current_user.id)

    # Apply search filter
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Episode.title.ilike(search_term),
                Episode.description.ilike(search_term),
                Podcast.title.ilike(search_term),
                Podcast.author.ilike(search_term),
            )
        )

    result = await db.execute(query)
    episodes = list(result.scalars().all())

    # Sort by processing date (summary created_at) - default is most recent first
    sort_by = sort or "processed_desc"
    if sort_by == "processed_desc":
        episodes.sort(key=lambda e: e.summary.created_at if e.summary else "", reverse=True)
    elif sort_by == "processed_asc":
        episodes.sort(key=lambda e: e.summary.created_at if e.summary else "")
    elif sort_by == "title_asc":
        episodes.sort(key=lambda e: e.title.lower())
    elif sort_by == "title_desc":
        episodes.sort(key=lambda e: e.title.lower(), reverse=True)

    # Return episodes with podcast info
    return [
        {
            "id": str(e.id),
            "podcast_id": str(e.podcast_id),
            "title": e.title,
            "description": e.description,
            "audio_url": e.audio_url,
            "duration": e.duration,
            "published_at": e.published_at.isoformat() if e.published_at else None,
            "created_at": e.created_at.isoformat(),
            "image_url": e.podcast.image_url if e.podcast else None,
            "podcast_title": e.podcast.title if e.podcast else None,
            "podcast_author": e.podcast.author if e.podcast else None,
            "summary": {"id": str(e.summary.id), "text": e.summary.text} if e.summary else None,
            "transcription": {"id": str(e.transcription.id), "text": e.transcription.text}
            if e.transcription
            else None,
            "processed_at": e.summary.created_at.isoformat() if e.summary else None,
        }
        for e in episodes
    ]


@router.get("/episodes/processed/count")
async def get_processed_episodes_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get count of AI processed episodes for current user"""
    query = (
        select(func.count(Episode.id))
        .join(Summary, Summary.episode_id == Episode.id)
        .join(Podcast, Podcast.id == Episode.podcast_id)
    )

    # Filter by user - all users (including admins) only see their own content
    query = query.where(Podcast.user_id == current_user.id)

    result = await db.execute(query)
    count = result.scalar()
    return count


@router.get("/episodes/semantic-search")
async def hybrid_search_episodes(
    query: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Hybrid search: combines exact text matching with semantic similarity"""
    from collections import defaultdict

    from app.services.vector_store import search_vectors

    if not query or not query.strip():
        return []

    # STAGE 1: Exact text search in transcriptions (whole word match)
    # Use regex word boundaries to match whole words only
    # \m and \M are PostgreSQL word boundary markers
    search_pattern = rf"\m{query}\M"
    exact_search_query = (
        select(Episode, Transcription.text)
        .join(Transcription, Transcription.episode_id == Episode.id)
        .join(Podcast, Podcast.id == Episode.podcast_id)
        .where(Transcription.text.op("~*")(search_pattern))  # ~* is case-insensitive regex match
        .options(
            selectinload(Episode.transcription),
            selectinload(Episode.summary),
            selectinload(Episode.podcast),
        )
        .limit(limit)
    )

    # Filter by user
    if not current_user.is_admin:
        exact_search_query = exact_search_query.where(Podcast.user_id == current_user.id)

    exact_result = await db.execute(exact_search_query)
    exact_matches = exact_result.all()

    # Build map of exact match episodes with snippets
    exact_episodes = {}
    for episode, transcript_text in exact_matches:
        # Find the position of the query in transcript and extract snippet
        query_lower = query.lower()
        text_lower = transcript_text.lower()
        match_pos = text_lower.find(query_lower)

        if match_pos != -1:
            # Extract snippet around the match (150 chars before, 150 after)
            start = max(0, match_pos - 150)
            end = min(len(transcript_text), match_pos + len(query) + 150)
            snippet = transcript_text[start:end]
            if start > 0:
                snippet = "..." + snippet
            if end < len(transcript_text):
                snippet = snippet + "..."
        else:
            snippet = transcript_text[:300] + "..."

        exact_episodes[str(episode.id)] = {
            "episode": episode,
            "snippet": snippet,
            "exact_match": True,
        }

    # STAGE 2: Semantic vector search
    vector_results = await search_vectors(
        query=query, db=db, episode_id=None, podcast_id=None, limit=limit * 3
    )

    # Group semantic results by episode_id
    semantic_matches = defaultdict(list)
    for result in vector_results:
        episode_id_str = str(result["episode_id"])
        # Skip if already in exact matches
        if episode_id_str not in exact_episodes:
            semantic_matches[result["episode_id"]].append(result)

    # Get semantic episode IDs (not already in exact matches)
    semantic_episode_ids = list(semantic_matches.keys())[:limit]

    # Fetch semantic match episodes
    semantic_episodes = {}
    if semantic_episode_ids:
        semantic_query = (
            select(Episode)
            .join(Podcast, Podcast.id == Episode.podcast_id)
            .where(Episode.id.in_(semantic_episode_ids))
            .options(
                selectinload(Episode.transcription),
                selectinload(Episode.summary),
                selectinload(Episode.podcast),
            )
        )

        # Filter by user
        if not current_user.is_admin:
            semantic_query = semantic_query.where(Podcast.user_id == current_user.id)

        semantic_result = await db.execute(semantic_query)
        for episode in semantic_result.scalars().all():
            episode_id = episode.id
            best_match = semantic_matches[episode_id][0]
            snippet = (
                best_match["text"][:300] + "..."
                if len(best_match["text"]) > 300
                else best_match["text"]
            )

            semantic_episodes[str(episode.id)] = {
                "episode": episode,
                "snippet": snippet,
                "exact_match": False,
                "similarity_score": best_match.get("similarity_score", 0),
            }

    # STAGE 3: Merge and sort results
    # Sort exact matches by published date (newest first)
    exact_list = sorted(
        exact_episodes.values(),
        key=lambda x: (
            x["episode"].published_at if x["episode"].published_at else x["episode"].created_at
        )
        or x["episode"].created_at,
        reverse=True,
    )

    # Sort semantic matches by similarity score (best first), then by date (newest first)
    semantic_list = sorted(
        semantic_episodes.values(),
        key=lambda x: (
            x["similarity_score"],  # Lower cosine distance = better match
            -(
                x["episode"].published_at.timestamp()
                if x["episode"].published_at
                else x["episode"].created_at.timestamp()
            ),
        ),
    )

    response = []

    # Add sorted exact matches first
    for episode_data in exact_list:
        e = episode_data["episode"]
        response.append(
            {
                "id": str(e.id),
                "podcast_id": str(e.podcast_id),
                "title": e.title,
                "description": e.description,
                "audio_url": e.audio_url,
                "duration": e.duration,
                "published_at": e.published_at.isoformat() if e.published_at else None,
                "created_at": e.created_at.isoformat(),
                "image_url": e.podcast.image_url if e.podcast else None,
                "podcast_title": e.podcast.title if e.podcast else None,
                "podcast_author": e.podcast.author if e.podcast else None,
                "summary": {"id": str(e.summary.id), "text": e.summary.text} if e.summary else None,
                "transcription": {"id": str(e.transcription.id), "text": e.transcription.text}
                if e.transcription
                else None,
                "processed_at": e.summary.created_at.isoformat() if e.summary else None,
                "match_snippet": episode_data["snippet"],
                "exact_match": True,
            }
        )

    # Add sorted semantic matches (up to limit)
    remaining_slots = limit - len(response)
    for episode_data in semantic_list[:remaining_slots]:
        e = episode_data["episode"]
        response.append(
            {
                "id": str(e.id),
                "podcast_id": str(e.podcast_id),
                "title": e.title,
                "description": e.description,
                "audio_url": e.audio_url,
                "duration": e.duration,
                "published_at": e.published_at.isoformat() if e.published_at else None,
                "created_at": e.created_at.isoformat(),
                "image_url": e.podcast.image_url if e.podcast else None,
                "podcast_title": e.podcast.title if e.podcast else None,
                "podcast_author": e.podcast.author if e.podcast else None,
                "summary": {"id": str(e.summary.id), "text": e.summary.text} if e.summary else None,
                "transcription": {"id": str(e.transcription.id), "text": e.transcription.text}
                if e.transcription
                else None,
                "processed_at": e.summary.created_at.isoformat() if e.summary else None,
                "match_snippet": episode_data["snippet"],
                "exact_match": False,
                "similarity_score": episode_data["similarity_score"],
            }
        )

    return response


@router.get("/processed", response_model=list[PodcastResponse])
async def list_processed_podcasts(
    search: str | None = None,
    sort: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get podcasts that have at least one processed episode (with summary)"""
    from sqlalchemy import or_

    # Get podcasts with at least one episode that has a summary
    query = (
        select(Podcast)
        .join(Episode, Episode.podcast_id == Podcast.id)
        .join(Summary, Summary.episode_id == Episode.id)
        .options(
            selectinload(Podcast.episodes).selectinload(Episode.transcription),
            selectinload(Podcast.episodes).selectinload(Episode.summary),
        )
        .distinct()
    )

    # Filter by user
    query = apply_user_filter(query, current_user)

    # Apply search filter
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Podcast.title.ilike(search_term),
                Podcast.author.ilike(search_term),
                Podcast.description.ilike(search_term),
            )
        )

    result = await db.execute(query)
    podcasts = list(result.scalars().all())

    # Ensure all relationships are loaded
    for podcast in podcasts:
        _ = podcast.episodes

    # Sort by most recently processed episode (default) or other options
    sort_by = sort or "processed_desc"
    if sort_by == "processed_desc":
        # Sort by most recently created summary
        podcasts.sort(
            key=lambda p: max((e.summary.created_at for e in p.episodes if e.summary), default=""),
            reverse=True,
        )
    elif sort_by == "name_asc":
        podcasts.sort(key=lambda p: p.title.lower())
    elif sort_by == "name_desc":
        podcasts.sort(key=lambda p: p.title.lower(), reverse=True)
    elif sort_by == "episodes_desc":
        podcasts.sort(key=lambda p: len(p.episodes), reverse=True)

    return podcasts


@router.post("/refresh-all")
async def refresh_all_podcasts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Refresh all podcasts RSS feeds (JSON endpoint for Next.js)"""
    from app.models.podcast import Notification

    # Get user's podcasts only
    query = select(Podcast)
    query = apply_user_filter(query, current_user)

    result = await db.execute(query)
    podcasts = result.scalars().all()

    updated_count = 0
    failed_count = 0
    for podcast in podcasts:
        try:
            # Update podcast metadata (title, author, category, etc.)
            feed_data = rss_parser.parse_podcast_feed(podcast.rss_url)
            podcast.title = feed_data.get("title", podcast.title)
            podcast.description = feed_data.get("description", podcast.description)
            podcast.author = feed_data.get("author", podcast.author)

            # Only update image_url if it's not a custom uploaded image
            # Custom images are stored as /echolens_data/uploads/{podcast_slug}/cover.{ext}
            is_custom_image = (
                podcast.image_url
                and podcast.image_url.startswith("/echolens_data/uploads/")
                and "cover." in podcast.image_url
            )
            if not is_custom_image:
                podcast.image_url = feed_data.get("image_url", podcast.image_url)

            podcast.category = feed_data.get("category", podcast.category)

            # Update episodes
            await fetch_episodes(podcast.id, podcast.rss_url, db)
            updated_count += 1
        except Exception as e:
            logger.error("podcast_refresh_failed", podcast_id=str(podcast.id), podcast_title=podcast.title, user_id=str(current_user.id), error=str(e))
            failed_count += 1
            continue

    # Commit all updates
    await db.commit()

    # Create notification
    notification = Notification(
        type="refresh_completed",
        title="Podcasts Updated",
        message=f"Successfully updated {updated_count} podcast(s)"
        + (f", {failed_count} failed" if failed_count > 0 else ""),
        level="success" if failed_count == 0 else "warning",
        user_id=current_user.id,
        read=0,
    )
    db.add(notification)
    await db.commit()

    return {"updated": updated_count, "failed": failed_count}


@router.post("/{podcast_id}/refresh")
async def refresh_podcast(
    podcast_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Refresh a single podcast's RSS feed"""
    from app.models.podcast import Notification

    # Verify ownership and get podcast
    podcast = await verify_podcast_ownership(podcast_id, current_user, db)

    try:
        # Update podcast metadata (title, author, category, etc.)
        feed_data = rss_parser.parse_podcast_feed(podcast.rss_url)
        podcast.title = feed_data.get("title", podcast.title)
        podcast.description = feed_data.get("description", podcast.description)
        podcast.author = feed_data.get("author", podcast.author)

        # Only update image_url if it's not a custom uploaded image
        # Custom images are stored as /echolens_data/uploads/{podcast_slug}/cover.{ext}
        is_custom_image = (
            podcast.image_url
            and podcast.image_url.startswith("/echolens_data/uploads/")
            and "cover." in podcast.image_url
        )
        if not is_custom_image:
            podcast.image_url = feed_data.get("image_url", podcast.image_url)

        podcast.category = feed_data.get("category", podcast.category)

        # Update episodes
        await fetch_episodes(podcast.id, podcast.rss_url, db)
        await db.commit()

        # Create notification
        notification = Notification(
            type="refresh_completed",
            title="Podcast Updated",
            message=f"Successfully updated '{podcast.title}'",
            level="success",
            podcast_id=podcast.id,
            user_id=current_user.id,
            read=0,
        )
        db.add(notification)
        await db.commit()

        return {"status": "success", "message": f"Refreshed {podcast.title}"}
    except Exception as e:
        await db.rollback()
        logger.exception("podcast_refresh_failed", podcast_id=str(podcast_id), podcast_title=podcast.title, user_id=str(current_user.id), error=str(e))
        raise HTTPException(status_code=500, detail=f"Failed to refresh podcast: {e!s}")


@router.get("/{podcast_id}", response_model=PodcastResponse)
async def get_podcast(
    podcast_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify ownership
    podcast = await verify_podcast_ownership(podcast_id, current_user, db)

    # Reload with relationships
    result = await db.execute(
        select(Podcast)
        .options(
            selectinload(Podcast.episodes).selectinload(Episode.transcription),
            selectinload(Podcast.episodes).selectinload(Episode.summary),
        )
        .where(Podcast.id == podcast_id)
    )
    podcast = result.scalar_one()

    return podcast


@router.get("/{podcast_id}/storage")
async def get_podcast_storage(
    podcast_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get estimated storage usage for a podcast (audio files, transcriptions, embeddings)"""
    import os

    # Verify ownership and get podcast
    podcast = await verify_podcast_ownership(podcast_id, current_user, db)

    # Get user-specific storage path
    storage_path = get_user_storage_path(podcast.user_id, podcast.title)
    podcast_dir = Path(storage_path)

    total_bytes = 0

    # Calculate directory size if it exists
    if podcast_dir.exists():
        for dirpath, dirnames, filenames in os.walk(podcast_dir):
            for filename in filenames:
                filepath = os.path.join(dirpath, filename)
                try:
                    total_bytes += os.path.getsize(filepath)
                except (OSError, FileNotFoundError):
                    pass

    # Format bytes to human-readable format
    def format_bytes(bytes_size):
        for unit in ["B", "KB", "MB", "GB", "TB"]:
            if bytes_size < 1024.0:
                return f"{bytes_size:.1f} {unit}"
            bytes_size /= 1024.0
        return f"{bytes_size:.1f} PB"

    return {
        "podcast_id": str(podcast_id),
        "total_bytes": total_bytes,
        "formatted_size": format_bytes(total_bytes),
    }


@router.delete("/{podcast_id}")
async def delete_podcast(
    podcast_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a podcast and all associated data (episodes, transcriptions, audio files, etc.)"""

    from sqlalchemy import delete as sql_delete

    # Verify ownership and get podcast
    podcast = await verify_podcast_ownership(podcast_id, current_user, db)

    # Get user-specific storage path
    storage_path = get_user_storage_path(podcast.user_id, podcast.title)
    podcast_dir = Path(storage_path)

    # Delete filesystem files (audio files, custom images)
    if podcast_dir.exists():
        try:
            shutil.rmtree(podcast_dir)
        except Exception as e:
            # Log error but continue with database deletion
            logger.warning("podcast_directory_delete_failed", podcast_id=str(podcast_id), podcast_dir=str(podcast_dir), user_id=str(current_user.id), error=str(e))

    # Delete podcast from database
    # This will CASCADE delete:
    # - Episodes (via relationship cascade="all, delete-orphan")
    # - Transcriptions (via Episode relationship)
    # - Terms (via Episode relationship)
    # - Summaries (via Episode relationship)
    # - Chats and ChatMessages (via Episode relationship)
    # - VectorSlices (via ForeignKey ondelete="CASCADE")
    # - TaskHistory (via ForeignKey ondelete="CASCADE")
    # - PlaybackProgress (via Episode relationship)
    # - Notifications (via ForeignKey ondelete="CASCADE")
    await db.execute(sql_delete(Podcast).where(Podcast.id == podcast_id))
    await db.commit()

    return {"status": "success", "message": f"Podcast '{podcast.title}' deleted successfully"}


class AutoDownloadSettings(BaseModel):
    auto_download: int
    auto_download_limit: int | None


@router.patch("/{podcast_id}/auto-download-settings")
async def update_auto_download_settings(
    podcast_id: UUID,
    settings: AutoDownloadSettings,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update auto-download settings for a podcast"""
    # Verify ownership and get podcast
    podcast = await verify_podcast_ownership(podcast_id, current_user, db)

    podcast.auto_download = settings.auto_download
    podcast.auto_download_limit = settings.auto_download_limit
    await db.commit()

    return {"status": "success"}


@router.get("/{podcast_id}/episodes", response_model=list[EpisodeResponse])
async def list_episodes(
    podcast_id: UUID,
    search: str = "",
    processed_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify ownership
    await verify_podcast_ownership(podcast_id, current_user, db)

    query = (
        select(Episode)
        .options(
            selectinload(Episode.transcription),
            selectinload(Episode.summary),
            selectinload(Episode.podcast),
        )
        .where(Episode.podcast_id == podcast_id)
    )

    # Apply search filter
    if search:
        search_term = f"%{search}%"
        query = query.where(
            Episode.title.ilike(search_term) | Episode.description.ilike(search_term)
        )

    # Filter by processed episodes
    if processed_only:
        query = query.where(Episode.transcription.has())

    # Order by published date descending
    query = query.order_by(Episode.published_at.desc())

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/episodes/{episode_id}", response_model=EpisodeResponse)
async def get_episode(
    episode_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify ownership
    episode = await verify_episode_ownership(episode_id, current_user, db)

    # Reload with relationships
    result = await db.execute(
        select(Episode)
        .options(
            selectinload(Episode.transcription),
            selectinload(Episode.summary),
            selectinload(Episode.podcast),
        )
        .where(Episode.id == episode_id)
    )
    episode = result.scalar_one()

    # Convert to dict and add podcast image_url and podcast info
    episode_dict = {
        "id": episode.id,
        "podcast_id": episode.podcast_id,
        "title": episode.title,
        "description": episode.description,
        "audio_url": episode.audio_url,
        "local_audio_path": episode.local_audio_path,
        "duration": episode.duration,
        "published_at": episode.published_at,
        "created_at": episode.created_at,
        "image_url": episode.podcast.image_url if episode.podcast else None,
        "transcription": episode.transcription,
        "summary": episode.summary,
        "podcast": {"id": episode.podcast.id, "title": episode.podcast.title}
        if episode.podcast
        else None,
    }

    return episode_dict


@router.post("/{podcast_id}/episodes/{episode_id}/download")
async def download_episode_audio(
    podcast_id: UUID,
    episode_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download episode audio without AI processing"""
    from fastapi.responses import JSONResponse

    from app.core.config import settings
    from app.services import audio_downloader

    # Verify ownership
    await verify_podcast_ownership(podcast_id, current_user, db)

    result = await db.execute(
        select(Episode)
        .options(selectinload(Episode.podcast))
        .where(Episode.id == episode_id, Episode.podcast_id == podcast_id)
    )
    episode = result.scalar_one_or_none()

    if not episode:
        return JSONResponse(content={"error": "Episode not found"}, status_code=404)

    # Check if already downloaded
    if episode.local_audio_path:
        return JSONResponse(
            content={"message": "Audio already downloaded", "path": episode.local_audio_path}
        )

    try:
        # Download audio
        audio_path = await audio_downloader.download_audio(
            episode.audio_url,
            settings.upload_dir,
            podcast_title=episode.podcast.title if episode.podcast else None,
            episode_title=episode.title,
        )

        # Save path to database
        episode.local_audio_path = audio_path
        await db.commit()

        # Create notification
        from app.models.podcast import Notification

        notification = Notification(
            type="episode_downloaded",
            title="Episode Downloaded",
            message=f"'{episode.title}' has been downloaded successfully",
            level="success",
            episode_id=episode_id,
            podcast_id=podcast_id,
            user_id=current_user.id,
            read=0,
        )
        db.add(notification)
        await db.commit()

        return JSONResponse(
            content={"message": "Audio downloaded successfully", "path": audio_path}
        )
    except Exception as e:
        logger.exception("audio_download_failed", episode_id=str(episode_id), podcast_id=str(podcast_id), user_id=str(current_user.id), error=str(e))
        return JSONResponse(content={"error": "Failed to download audio"}, status_code=500)


@router.delete("/{podcast_id}/episodes/{episode_id}/local-data")
async def delete_episode_local_data(
    podcast_id: UUID,
    episode_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete local data for an episode (audio, transcription, summary, terms, embeddings)"""

    from fastapi.responses import JSONResponse
    from sqlalchemy import delete as sql_delete

    from app.models.podcast import Summary, Term, Transcription, VectorSlice

    # Verify ownership
    await verify_podcast_ownership(podcast_id, current_user, db)

    result = await db.execute(
        select(Episode)
        .options(selectinload(Episode.podcast))
        .where(Episode.id == episode_id, Episode.podcast_id == podcast_id)
    )
    episode = result.scalar_one_or_none()

    if not episode:
        return JSONResponse(content={"error": "Episode not found"}, status_code=404)

    try:
        # Delete audio file if exists
        if episode.local_audio_path:
            audio_file = Path(episode.local_audio_path)
            if audio_file.exists():
                try:
                    audio_file.unlink()
                except Exception as e:
                    logger.warning("audio_file_delete_failed", episode_id=str(episode_id), audio_file=str(audio_file), user_id=str(current_user.id), error=str(e))
            episode.local_audio_path = None

        # Delete summary audio file if exists
        summary_result = await db.execute(select(Summary).where(Summary.episode_id == episode_id))
        summary = summary_result.scalar_one_or_none()
        if summary and summary.audio_path:
            summary_audio = Path(summary.audio_path)
            if summary_audio.exists():
                try:
                    summary_audio.unlink()
                except Exception as e:
                    logger.warning("summary_audio_delete_failed", episode_id=str(episode_id), summary_audio=str(summary_audio), user_id=str(current_user.id), error=str(e))

        # Delete database records
        await db.execute(sql_delete(Transcription).where(Transcription.episode_id == episode_id))
        await db.execute(sql_delete(Summary).where(Summary.episode_id == episode_id))
        await db.execute(sql_delete(Term).where(Term.episode_id == episode_id))
        await db.execute(sql_delete(VectorSlice).where(VectorSlice.episode_id == episode_id))

        await db.commit()

        # Create notification
        from app.models.podcast import Notification

        notification = Notification(
            type="episode_data_deleted",
            title="Episode Data Deleted",
            message=f"Local data for '{episode.title}' has been deleted",
            level="info",
            episode_id=episode_id,
            podcast_id=podcast_id,
            user_id=current_user.id,
            read=0,
        )
        db.add(notification)
        await db.commit()

        return JSONResponse(content={"message": "Local data deleted successfully"})
    except Exception as e:
        logger.exception("local_data_delete_failed", episode_id=str(episode_id), podcast_id=str(podcast_id), user_id=str(current_user.id), error=str(e))
        return JSONResponse(content={"error": "Failed to delete local data"}, status_code=500)


@router.post("/{podcast_id}/episodes/bulk-process")
async def bulk_process_episodes(
    podcast_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Process multiple episodes at once"""
    from app.models.podcast import TaskHistory

    # Verify ownership
    await verify_podcast_ownership(podcast_id, current_user, db)

    # Get episode IDs from form data
    form = await request.form()
    episode_ids_str = form.get("episode_ids", "")

    if not episode_ids_str:
        return HTMLResponse(
            content='<div class="text-red-500">No episodes selected</div>', status_code=400
        )

    # Parse episode IDs
    episode_ids = [UUID(id.strip()) for id in episode_ids_str.split(",") if id.strip()]

    if not episode_ids:
        return HTMLResponse(
            content='<div class="text-red-500">No valid episodes selected</div>', status_code=400
        )

    # Verify all episodes exist and belong to this podcast
    result = await db.execute(
        select(Episode).where(Episode.id.in_(episode_ids), Episode.podcast_id == podcast_id)
    )
    episodes = result.scalars().all()

    if len(episodes) != len(episode_ids):
        return HTMLResponse(
            content='<div class="text-red-500">Some episodes not found</div>', status_code=404
        )

    # Queue all episodes for processing
    queued_count = 0
    for episode in episodes:
        task = process_episode_task.delay(str(episode.id))

        # Create task history entry
        task_history = TaskHistory(
            task_id=task.id, episode_id=episode.id, podcast_id=podcast_id, status="PENDING"
        )
        db.add(task_history)
        queued_count += 1

    await db.commit()

    # Create notification
    from app.models.podcast import Notification

    # Get podcast for notification
    podcast_result = await db.execute(select(Podcast).where(Podcast.id == podcast_id))
    podcast = podcast_result.scalar_one()

    notification = Notification(
        type="bulk_processing_started",
        title="Bulk Processing Started",
        message=f"Queued {queued_count} episode{'s' if queued_count != 1 else ''} from '{podcast.title}' for AI processing",
        level="info",
        podcast_id=podcast_id,
        user_id=current_user.id,
        read=0,
    )
    db.add(notification)
    await db.commit()

    return {"queued": queued_count}


@router.post("/episodes/{episode_id}/extract-more-terms")
async def extract_more_terms(
    episode_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Start background task to extract terms from entire transcript.

    Returns:
        JSON with task_id for polling progress
    """
    from fastapi.responses import JSONResponse

    from app.models.podcast import TaskHistory
    from app.tasks.episode_processing import extract_terms_incremental_task

    # Verify ownership
    episode = await verify_episode_ownership(episode_id, current_user, db)

    transcript_result = await db.execute(
        select(Transcription).where(Transcription.episode_id == episode_id)
    )
    transcript = transcript_result.scalar_one_or_none()

    if not transcript:
        return JSONResponse({"error": "Transcription not found"}, status_code=404)

    # Start background task
    task = extract_terms_incremental_task.delay(str(episode_id))

    # Create task history entry
    task_history = TaskHistory(
        task_id=task.id, episode_id=episode_id, podcast_id=episode.podcast_id, status="PENDING"
    )
    db.add(task_history)
    await db.commit()

    return JSONResponse({"task_id": task.id, "status": "started"})


@router.get("/episodes/{episode_id}/extract-terms-progress/{task_id}")
async def get_extraction_progress(
    episode_id: UUID,
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Poll progress of term extraction task.

    Returns:
        JSON with progress info and updated terms HTML
    """
    from celery.result import AsyncResult
    from fastapi.responses import JSONResponse

    # Verify ownership
    await verify_episode_ownership(episode_id, current_user, db)

    # Get task status
    task = AsyncResult(task_id)

    # Get current terms for this episode (excluding hidden)
    all_terms_result = await db.execute(
        select(Term).where(Term.episode_id == episode_id, Term.hidden == 0)
    )
    all_terms = all_terms_result.scalars().all()

    # Build terms HTML with kebab menu
    terms_html = ""
    for term in all_terms:
        context_html = (
            f'<p class="text-xs text-gray-500 dark:text-gray-400 italic mb-2 border-l-2 border-gray-300 dark:border-gray-600 pl-2">"{term.context}"</p>'
            if term.context
            else ""
        )
        explanation_html = (
            f'<p class="text-sm text-gray-700 dark:text-gray-300" id="explanation-{term.id}">{term.explanation}</p>'
            if term.explanation
            else '<p class="text-sm text-gray-500 dark:text-gray-400 italic">No explanation available</p>'
        )
        elaborate_btn = (
            f'<button hx-get="/api/terms/{term.id}/elaborate-modal" hx-target="#modal-container" hx-swap="innerHTML" class="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline">View detailed explanation</button>'
            if term.elaborate_explanation
            else ""
        )

        terms_html += f"""
        <div class="bg-white dark:bg-gray-800 border border-light-border dark:border-dark-border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow relative" data-term-id="{term.id}">
            <div class="flex items-start justify-between mb-2">
                <h5 class="font-semibold text-lg text-blue-600 dark:text-blue-400 flex-1">{term.term}</h5>
                <div class="relative">
                    <button onclick="toggleTermMenu('{term.id}')" class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                        <svg class="w-5 h-5 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 16 16">
                            <circle cx="8" cy="3" r="1.5"/>
                            <circle cx="8" cy="8" r="1.5"/>
                            <circle cx="8" cy="13" r="1.5"/>
                        </svg>
                    </button>
                    <div id="menu-{term.id}" class="hidden absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 border border-light-border dark:border-dark-border rounded-lg shadow-lg z-10">
                        <button hx-post="/api/terms/{term.id}/hide" hx-swap="outerHTML" hx-target="[data-term-id='{term.id}']" hx-on::after-request="if(event.detail.successful) {{ showToast('Term hidden', 'success'); }}" class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path></svg>
                            Hide
                        </button>
                        <button hx-post="/api/terms/{term.id}/elaborate" hx-swap="none" hx-indicator="#elaborate-spinner-{term.id}" hx-on::before-request="document.getElementById('menu-{term.id}').classList.add('hidden');" hx-on::after-request="if(event.detail.successful) {{ showToast('Elaborate explanation generated', 'success'); location.reload(); }}" class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 border-t border-light-border dark:border-dark-border flex items-center gap-2">
                            <svg id="elaborate-spinner-{term.id}" class="htmx-indicator w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            Elaborate
                        </button>
                    </div>
                </div>
            </div>
            {context_html}
            {explanation_html}
            {elaborate_btn}
        </div>
        """

    # Build response based on task state
    if task.state == "PENDING":
        return JSONResponse(
            {
                "status": "pending",
                "progress_percent": 0,
                "total_terms": len(all_terms),
                "terms_html": terms_html,
            }
        )
    if task.state == "STARTED":
        # Task just started but hasn't set progress yet
        return JSONResponse(
            {
                "status": "processing",
                "progress_percent": 0,
                "chunk_num": 0,
                "total_chunks": 0,
                "total_terms": len(all_terms),
                "terms_html": terms_html,
            }
        )
    if task.state == "PROGRESS":
        meta = task.info or {}
        # Handle case where task.info is not a dict (e.g., initial state)
        if not isinstance(meta, dict):
            return JSONResponse(
                {
                    "status": "processing",
                    "progress_percent": 0,
                    "chunk_num": 0,
                    "total_chunks": 0,
                    "total_terms": len(all_terms),
                    "terms_html": terms_html,
                }
            )
        return JSONResponse(
            {
                "status": "processing",
                "progress_percent": meta.get("progress_percent", 0),
                "chunk_num": meta.get("chunk_num", 0),
                "total_chunks": meta.get("total_chunks", 0),
                "total_terms": len(all_terms),
                "terms_html": terms_html,
            }
        )
    if task.state == "SUCCESS":
        result = task.info or {}
        if not isinstance(result, dict):
            result = {}
        return JSONResponse(
            {
                "status": "complete",
                "progress_percent": 100,
                "total_terms": len(all_terms),
                "added_this_run": result.get("added_this_run", 0),
                "terms_html": terms_html,
            }
        )
    if task.state == "FAILURE":
        # Get the actual error from the result
        error_msg = "Extraction failed"
        try:
            if hasattr(task.info, "__str__"):
                error_msg = str(task.info)
        except:
            pass
        return JSONResponse(
            {"status": "error", "error": error_msg, "terms_html": terms_html}, status_code=500
        )
    # Unknown state - return as processing
    return JSONResponse(
        {
            "status": "processing",
            "progress_percent": 0,
            "total_terms": len(all_terms),
            "terms_html": terms_html,
        }
    )


@router.get("/episodes/{episode_id}/transcription", response_model=TranscriptionResponse)
async def get_transcription(
    episode_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify ownership
    await verify_episode_ownership(episode_id, current_user, db)

    result = await db.execute(select(Transcription).where(Transcription.episode_id == episode_id))
    transcript = result.scalar_one_or_none()

    if not transcript:
        raise HTTPException(status_code=404, detail="Transcription not found")

    return transcript


@router.get("/episodes/{episode_id}/transcription/download")
async def download_transcription(
    episode_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Download episode transcription as plain text file"""
    import re

    from fastapi.responses import Response

    # Verify ownership
    await verify_episode_ownership(episode_id, current_user, db)

    # Get transcription
    transcript_result = await db.execute(
        select(Transcription).where(Transcription.episode_id == episode_id)
    )
    transcript = transcript_result.scalar_one_or_none()

    if not transcript:
        raise HTTPException(status_code=404, detail="Transcription not found")

    # Get episode and podcast for filename
    episode_result = await db.execute(select(Episode).where(Episode.id == episode_id))
    episode = episode_result.scalar_one_or_none()

    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    # Get podcast
    podcast_result = await db.execute(select(Podcast).where(Podcast.id == episode.podcast_id))
    podcast = podcast_result.scalar_one_or_none()

    # Create filename from podcast and episode titles
    def slugify(text: str) -> str:
        """Convert text to safe filename"""
        text = text.lower()
        text = re.sub(r"[^\w\s-]", "", text)
        text = re.sub(r"[-\s]+", "_", text)
        return text[:100]  # Limit length

    podcast_slug = slugify(podcast.title) if podcast else "podcast"
    episode_slug = slugify(episode.title)
    filename = f"{podcast_slug}_{episode_slug}_transcript.txt"

    # Return as downloadable text file
    return Response(
        content=transcript.text,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/episodes/{episode_id}/terms/hidden/count")
async def get_hidden_terms_count(
    episode_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get count of hidden terms for an episode"""
    # Verify ownership
    await verify_episode_ownership(episode_id, current_user, db)

    result = await db.execute(
        select(func.count(Term.id)).where(Term.episode_id == episode_id, Term.hidden == 1)
    )
    count = result.scalar()
    return {"count": count}


@router.get("/episodes/{episode_id}/terms", response_model=list[TermResponse])
async def get_terms(
    episode_id: UUID,
    include_hidden: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get terms for an episode, excluding hidden terms by default"""
    from sqlalchemy import case

    # Verify ownership
    await verify_episode_ownership(episode_id, current_user, db)

    query = select(Term).where(Term.episode_id == episode_id)
    if not include_hidden:
        query = query.where(Term.hidden == 0)

    # Sort: manual terms first, then by created_at desc
    query = query.order_by(case((Term.source == "manual", 0), else_=1), Term.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.patch("/terms/{term_id}/hide")
async def hide_term(
    term_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Hide a term"""
    # Verify ownership
    term = await verify_term_ownership(term_id, current_user, db)

    term.hidden = 1
    await db.commit()
    return {"status": "success", "hidden": True}


@router.patch("/terms/{term_id}/unhide")
async def unhide_term(
    term_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Unhide a term"""
    # Verify ownership
    term = await verify_term_ownership(term_id, current_user, db)

    term.hidden = 0
    await db.commit()
    return {"status": "success", "hidden": False}


@router.post("/episodes/{episode_id}/terms")
async def create_term(
    episode_id: UUID,
    term: str = Body(...),
    context: str = Body(None),
    explanation: str = Body(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually create a term for an episode"""
    from app.services import transcription

    # Verify ownership
    episode = await verify_episode_ownership(episode_id, current_user, db)

    # Check if term already exists for this episode
    existing_term = await db.execute(
        select(Term).where(Term.episode_id == episode_id, Term.term.ilike(term))
    )
    if existing_term.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Term already exists for this episode")

    # Generate embedding for term
    term_embedding = await transcription.generate_embedding(term)

    # Create term
    new_term = Term(
        episode_id=episode_id,
        term=term,
        context=context,
        explanation=explanation,
        source="manual",
        embedding=term_embedding,
    )
    db.add(new_term)
    await db.commit()
    await db.refresh(new_term)

    return new_term


@router.get("/episodes/{episode_id}/summary", response_model=SummaryResponse)
async def get_summary(
    episode_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify ownership
    await verify_episode_ownership(episode_id, current_user, db)

    result = await db.execute(select(Summary).where(Summary.episode_id == episode_id))
    summary = result.scalar_one_or_none()

    if not summary:
        raise HTTPException(status_code=404, detail="Summary not found")

    return summary


async def update_podcast_counts(podcast_id: UUID, db: AsyncSession):
    """Update episode_count, processed_count, and latest_episode_date for a podcast"""
    # Get episode count
    episode_count_result = await db.execute(
        select(func.count(Episode.id)).where(Episode.podcast_id == podcast_id)
    )
    episode_count = episode_count_result.scalar()

    # Get processed count (episodes with summaries)
    processed_count_result = await db.execute(
        select(func.count(Episode.id))
        .join(Summary, Summary.episode_id == Episode.id)
        .where(Episode.podcast_id == podcast_id)
    )
    processed_count = processed_count_result.scalar()

    # Get latest episode date
    latest_date_result = await db.execute(
        select(func.max(Episode.published_at)).where(Episode.podcast_id == podcast_id)
    )
    latest_episode_date = latest_date_result.scalar()

    # Update podcast
    podcast_result = await db.execute(select(Podcast).where(Podcast.id == podcast_id))
    podcast = podcast_result.scalar_one()
    podcast.episode_count = episode_count
    podcast.processed_count = processed_count
    podcast.latest_episode_date = latest_episode_date

    await db.commit()


async def fetch_episodes(podcast_id: UUID, rss_url: str, db: AsyncSession):
    """Helper function to fetch and store episodes from RSS feed"""
    episodes_data = rss_parser.parse_episodes(rss_url)

    for ep_data in episodes_data:
        # Check if episode already exists by audio_url (unique identifier)
        result = await db.execute(
            select(Episode).where(
                Episode.podcast_id == podcast_id, Episode.audio_url == ep_data["audio_url"]
            )
        )
        existing_episode = result.scalar_one_or_none()

        if existing_episode:
            # Update existing episode
            for key, value in ep_data.items():
                setattr(existing_episode, key, value)
        else:
            # Create new episode
            episode = Episode(podcast_id=podcast_id, **ep_data)
            db.add(episode)

    await db.commit()

    # Update episode counts
    await update_podcast_counts(podcast_id, db)


@router.get("/{podcast_id}/episodes/{episode_id}/playback-progress")
async def get_playback_progress(
    podcast_id: UUID,
    episode_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get saved playback progress for an episode (user-specific)"""
    from fastapi.responses import JSONResponse

    from app.models.podcast import PlaybackProgress

    # Verify ownership
    await verify_podcast_ownership(podcast_id, current_user, db)

    # Get user-specific progress
    result = await db.execute(
        select(PlaybackProgress).where(
            PlaybackProgress.episode_id == episode_id,
            PlaybackProgress.user_id == current_user.id
        )
    )
    progress = result.scalar_one_or_none()

    if not progress:
        return JSONResponse({"current_time": 0})

    return JSONResponse(
        {"current_time": progress.current_time, "last_updated": progress.last_updated.isoformat()}
    )


@router.post("/{podcast_id}/episodes/{episode_id}/playback-progress")
async def save_playback_progress(
    podcast_id: UUID,
    episode_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Save or update playback progress for an episode (user-specific)"""
    from fastapi.responses import JSONResponse

    from app.models.podcast import PlaybackProgress

    # Verify ownership
    await verify_podcast_ownership(podcast_id, current_user, db)

    # Get request body
    body = await request.json()
    current_time = body.get("current_time", 0)

    # Check if user-specific progress already exists
    result = await db.execute(
        select(PlaybackProgress).where(
            PlaybackProgress.episode_id == episode_id,
            PlaybackProgress.user_id == current_user.id
        )
    )
    progress = result.scalar_one_or_none()

    if progress:
        # Update existing
        progress.current_time = current_time
        progress.last_updated = get_utc_now()
    else:
        # Create new user-specific progress
        progress = PlaybackProgress(
            episode_id=episode_id,
            current_time=current_time,
            user_id=current_user.id
        )
        db.add(progress)

    await db.commit()

    return JSONResponse({"status": "saved", "current_time": current_time})


@router.delete("/{podcast_id}/episodes/{episode_id}/playback-progress")
async def delete_playback_progress(
    podcast_id: UUID,
    episode_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete playback progress (when episode is finished) - user-specific"""
    from fastapi.responses import JSONResponse
    from sqlalchemy import delete as sql_delete

    from app.models.podcast import PlaybackProgress

    # Verify ownership
    await verify_podcast_ownership(podcast_id, current_user, db)

    # Delete only this user's progress
    await db.execute(
        sql_delete(PlaybackProgress).where(
            PlaybackProgress.episode_id == episode_id,
            PlaybackProgress.user_id == current_user.id
        )
    )
    await db.commit()

    return JSONResponse({"status": "deleted"})


class NotesUpdate(BaseModel):
    notes: str


@router.get("/{podcast_id}/episodes/{episode_id}/notes/get")
async def get_episode_notes(
    podcast_id: UUID,
    episode_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user notes for an episode"""
    # Verify ownership
    await verify_podcast_ownership(podcast_id, current_user, db)

    result = await db.execute(select(Episode).where(Episode.id == episode_id))
    episode = result.scalar_one_or_none()

    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    return {"notes": episode.notes or ""}


@router.post("/{podcast_id}/episodes/{episode_id}/notes")
async def save_episode_notes(
    podcast_id: UUID,
    episode_id: UUID,
    notes_data: NotesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save user notes for an episode"""
    # Verify ownership
    await verify_podcast_ownership(podcast_id, current_user, db)

    result = await db.execute(select(Episode).where(Episode.id == episode_id))
    episode = result.scalar_one_or_none()

    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    episode.notes = notes_data.notes
    await db.commit()

    return {"status": "success"}


@router.get("/{podcast_id}/episodes/{episode_id}/notes/download")
async def download_episode_notes(
    podcast_id: UUID,
    episode_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download episode notes as markdown file"""
    # Verify ownership
    await verify_podcast_ownership(podcast_id, current_user, db)

    result = await db.execute(
        select(Episode).options(selectinload(Episode.podcast)).where(Episode.id == episode_id)
    )
    episode = result.scalar_one_or_none()

    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    # Convert HTML to markdown (basic conversion)
    import re

    import html2text

    h = html2text.HTML2Text()
    h.ignore_links = False
    h.ignore_images = False
    h.body_width = 0  # Don't wrap text

    if episode.notes:
        markdown_content = h.handle(episode.notes)
        # Remove lines that only contain whitespace
        markdown_content = re.sub(r"^\s+$", "", markdown_content, flags=re.MULTILINE)
        # Clean up excessive blank lines (more than 2 consecutive newlines)
        markdown_content = re.sub(r"\n{3,}", "\n\n", markdown_content)
        # Strip leading/trailing whitespace
        markdown_content = markdown_content.strip()
    else:
        markdown_content = "# No notes yet\n\nStart taking notes about this episode."

    # Create filename
    safe_title = "".join(c for c in episode.title if c.isalnum() or c in (" ", "-", "_")).rstrip()
    filename = f"{safe_title[:50]}_notes.md"

    return Response(
        content=markdown_content,
        media_type="text/markdown",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@episodes_router.get("/processing-status/all")
async def get_all_processing_episodes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all episode IDs that are currently being processed for user's podcasts"""
    from app.models.podcast import TaskHistory

    # Get all active or pending tasks for user's podcasts
    query = (
        select(TaskHistory.episode_id)
        .join(Episode, Episode.id == TaskHistory.episode_id)
        .join(Podcast, Podcast.id == Episode.podcast_id)
        .where(TaskHistory.status.in_(["PENDING", "PROGRESS"]))
        .where(TaskHistory.episode_id.isnot(None))
        .distinct()
    )

    # Filter by user - all users (including admins) only see their own content
    query = query.where(Podcast.user_id == current_user.id)

    result = await db.execute(query)
    episode_ids = [str(row[0]) for row in result.all()]

    return {"processing_episode_ids": episode_ids}


@episodes_router.get("/{episode_id}/processing-status")
async def get_episode_processing_status(
    episode_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Check if an episode is currently being processed"""
    from app.models.podcast import TaskHistory

    # Verify ownership
    await verify_episode_ownership(episode_id, current_user, db)

    # Check for active or pending tasks for this episode
    result = await db.execute(
        select(TaskHistory)
        .where(TaskHistory.episode_id == episode_id)
        .where(TaskHistory.status.in_(["PENDING", "PROGRESS"]))
        .order_by(TaskHistory.started_at.desc())
        .limit(1)
    )
    task = result.scalar_one_or_none()

    if task:
        return {
            "is_processing": True,
            "status": task.status,
            "task_id": task.task_id,
            "started_at": task.started_at.isoformat() if task.started_at else None,
        }
    return {"is_processing": False}


@episodes_router.post("/{episode_id}/process")
async def process_episode_endpoint(
    episode_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Process an episode (JSON endpoint for Next.js)"""
    from app.models.podcast import Notification, TaskHistory

    # Verify ownership
    episode = await verify_episode_ownership(episode_id, current_user, db)

    # Queue the processing task
    task = process_episode_task.delay(str(episode_id))

    # Create task history record
    task_history = TaskHistory(
        task_id=task.id, episode_id=episode_id, podcast_id=episode.podcast_id, status="PENDING"
    )
    db.add(task_history)

    # Create notification
    notification = Notification(
        type="task_event",
        title="Episode Queued for Processing",
        message=f'Episode "{episode.title}" has been queued for processing',
        level="info",
        task_id=task.id,
        episode_id=episode_id,
        podcast_id=episode.podcast_id,
        user_id=current_user.id,
    )
    db.add(notification)

    await db.commit()

    return {
        "status": "queued",
        "episode_id": str(episode_id),
        "task_id": task.id,
        "message": "Episode queued for processing",
    }


@router.post("/{podcast_id}/upload-image")
async def upload_podcast_image(
    podcast_id: UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload a custom image for a podcast with security validation"""
    import io

    from PIL import Image

    # Verify ownership
    podcast = await verify_podcast_ownership(podcast_id, current_user, db)

    # 1. Size validation (5MB max)
    MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    # 2. Content-based MIME type validation (not just header)
    mime = None
    try:
        import magic

        mime = magic.from_buffer(content, mime=True)
        allowed_mimes = ["image/jpeg", "image/png", "image/webp"]
        if mime not in allowed_mimes:
            raise HTTPException(status_code=400, detail=f"Invalid image type. Detected: {mime}")
    except ImportError:
        # Fallback if python-magic not available
        pass

    # 3. Validate image integrity and detect format
    try:
        img = Image.open(io.BytesIO(content))
        img.verify()  # Verify it's actually a valid image
        # Re-open to get format (verify() makes image unusable)
        img = Image.open(io.BytesIO(content))
        image_format = img.format.lower() if img.format else None
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Corrupted or invalid image: {e!s}")

    # Get user-specific storage path
    storage_path = get_user_storage_path(podcast.user_id, podcast.title)
    podcast_dir = Path(storage_path)

    # Validate directory path (prevent path traversal)
    uploads_base = Path("echolens_data/uploads").resolve()
    podcast_dir = podcast_dir.resolve()
    if not str(podcast_dir).startswith(str(uploads_base)):
        raise HTTPException(status_code=400, detail="Invalid directory path")

    podcast_dir.mkdir(parents=True, exist_ok=True)

    # Generate secure filename with hash
    import hashlib

    file_hash = hashlib.sha256(content).hexdigest()[:8]

    # Determine file extension from mime type or PIL format
    if mime:
        ext = mime.split("/")[-1]
    elif image_format:
        ext = "jpg" if image_format == "jpeg" else image_format
    else:
        ext = "jpg"  # Fallback

    filename = f"cover_{file_hash}.{ext}"
    file_path = podcast_dir / filename

    # Save file with restrictive permissions
    try:
        import os

        with open(file_path, "wb") as buffer:
            buffer.write(content)
        os.chmod(file_path, 0o644)  # Read-only for group/others
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save image: {e!s}")

    # Update podcast image_url in database
    podcast.image_url = f"/echolens_data/uploads/{podcast_slug}/{filename}"
    await db.commit()

    return {"status": "success", "image_url": podcast.image_url}
