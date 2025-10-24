from datetime import datetime

import feedparser
import httpx
import structlog

logger = structlog.get_logger(__name__)


def parse_podcast_feed(rss_url: str) -> dict:
    """
    Parse podcast feed with robust error handling.

    Handles common issues:
    - Gzip decompression errors
    - Network timeouts
    - Malformed feeds
    """
    feed = _fetch_feed_with_retry(rss_url)

    # Only raise error if we have a bozo exception AND no feed data
    # Many feeds have encoding mismatches but parse fine
    if feed.bozo and not feed.feed:
        error_msg = str(feed.bozo_exception)
        # Provide more helpful error messages for common issues
        if "decompressing" in error_msg.lower():
            raise ValueError(
                "Feed decompression error (corrupted or incomplete response). Try again or check the RSS URL."
            )
        raise ValueError(f"Invalid RSS feed: {error_msg}")

    # Check if we at least have a title
    if not feed.feed.get("title"):
        raise ValueError("Invalid RSS feed: No title found")

    return {
        "title": feed.feed.get("title", "Unknown"),
        "description": feed.feed.get("description", ""),
        "author": feed.feed.get("author", feed.feed.get("itunes_author", "")),
        "image_url": _extract_image_url(feed.feed),
        "category": _extract_category(feed.feed),
    }


def _fetch_feed_with_retry(rss_url: str, max_retries: int = 2):
    """
    Fetch RSS feed with retry logic and explicit HTTP handling.

    This helps avoid decompression errors by:
    1. Using explicit HTTP client with proper headers
    2. Retrying on transient failures
    3. Disabling automatic decompression if needed
    """
    for attempt in range(max_retries):
        try:
            # Try with httpx first for better control
            with httpx.Client(timeout=30.0, follow_redirects=True) as client:
                headers = {
                    "User-Agent": "EchoLens/1.0 (Podcast Aggregator)",
                    "Accept": "application/rss+xml, application/xml, text/xml, */*",
                }
                response = client.get(rss_url, headers=headers)
                response.raise_for_status()

                # Parse the content directly
                feed = feedparser.parse(response.content)
                return feed

        except (httpx.HTTPError, Exception) as e:
            logger.warning("rss_fetch_attempt_failed", attempt=attempt + 1, max_retries=max_retries, rss_url=rss_url, error=str(e))
            if attempt == max_retries - 1:
                # Last attempt - try with feedparser's default method
                try:
                    logger.info("trying_feedparser_default", rss_url=rss_url)
                    return feedparser.parse(rss_url)
                except Exception:
                    raise ValueError(
                        f"Failed to fetch RSS feed after {max_retries} attempts: {e!s}"
                    )

    # Fallback - should not reach here
    return feedparser.parse(rss_url)


def parse_episodes(rss_url: str) -> list[dict]:
    """Parse episodes from RSS feed with error handling."""
    feed = _fetch_feed_with_retry(rss_url)
    episodes = []

    for entry in feed.entries:
        episode = {
            "title": entry.get("title", "Untitled"),
            "description": entry.get("description", ""),
            "audio_url": _extract_audio_url(entry),
            "duration": _extract_duration(entry),
            "published_at": _parse_published_date(entry),
        }

        if episode["audio_url"]:
            episodes.append(episode)

    return episodes


def _extract_image_url(feed_data: dict) -> str | None:
    if hasattr(feed_data, "image"):
        return feed_data.image.get("href")
    if hasattr(feed_data, "itunes_image"):
        return feed_data.itunes_image.get("href")
    return None


def _extract_category(feed_data: dict) -> str | None:
    """Extract iTunes category from feed"""
    # Check for tags (most common)
    if hasattr(feed_data, "tags"):
        for tag in feed_data.tags:
            if tag.get("term"):
                return tag.get("term")

    # Check for itunes_category
    if hasattr(feed_data, "itunes_category"):
        return feed_data.itunes_category

    # Check for categories list
    if hasattr(feed_data, "categories"):
        for cat in feed_data.categories:
            if isinstance(cat, tuple) and len(cat) > 0:
                return cat[0]
            if isinstance(cat, str):
                return cat

    return None


def _extract_audio_url(entry: dict) -> str | None:
    for link in entry.get("links", []):
        if link.get("type", "").startswith("audio/"):
            return link.get("href")

    for enclosure in entry.get("enclosures", []):
        if enclosure.get("type", "").startswith("audio/"):
            return enclosure.get("href")

    return None


def _extract_duration(entry: dict) -> int | None:
    duration = entry.get("itunes_duration")
    if duration:
        try:
            parts = str(duration).split(":")
            if len(parts) == 3:
                return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
            if len(parts) == 2:
                return int(parts[0]) * 60 + int(parts[1])
            return int(duration)
        except ValueError:
            return None
    return None


def _parse_published_date(entry: dict) -> datetime | None:
    published = entry.get("published_parsed")
    if published:
        return datetime(*published[:6])
    return None
