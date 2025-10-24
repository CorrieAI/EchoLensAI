import asyncio

import structlog
from sqlalchemy import select

from app.celery_app import celery_app
from app.models.podcast import Notification, Podcast
from app.services import rss_parser

logger = structlog.get_logger(__name__)


@celery_app.task(name="refresh_all_podcasts_scheduled")
def refresh_all_podcasts_scheduled():
    """Scheduled task to refresh all podcasts"""
    from app.api.podcasts import fetch_episodes
    from app.db.session import async_session_maker

    async def _refresh():
        async with async_session_maker() as db:
            result = await db.execute(select(Podcast))
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
                    podcast.image_url = feed_data.get("image_url", podcast.image_url)
                    podcast.category = feed_data.get("category", podcast.category)

                    # Update episodes
                    await fetch_episodes(podcast.id, podcast.rss_url, db)
                    updated_count += 1
                except Exception as e:
                    logger.error("podcast_refresh_failed", podcast_id=str(podcast.id), podcast_title=podcast.title, error=str(e))
                    failed_count += 1
                    continue

            # Commit all updates
            await db.commit()

            # Create notification
            notification = Notification(
                type="scheduled_refresh_completed",
                title="Scheduled Podcast Update",
                message=f"Automatically updated {updated_count} podcast(s)"
                + (f", {failed_count} failed" if failed_count > 0 else ""),
                level="success" if failed_count == 0 else "warning",
                read=0,
            )
            db.add(notification)
            await db.commit()

            return {"updated": updated_count, "failed": failed_count}

    return asyncio.run(_refresh())
