"""Timezone utilities for handling timezone-aware datetimes"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from app.core.config import settings


def get_utc_now() -> datetime:
    """Get current UTC time as timezone-naive datetime for database storage

    Returns a timezone-naive datetime in UTC. This is used for database storage
    where columns are defined as TIMESTAMP WITHOUT TIME ZONE.

    Use make_aware() when reading from database for timezone-aware operations.
    """
    return datetime.now(UTC).replace(tzinfo=None)


def get_timezone() -> ZoneInfo:
    """Get the configured timezone"""
    return ZoneInfo(settings.timezone)


def to_user_timezone(dt: datetime) -> datetime:
    """Convert a UTC datetime to the user's configured timezone

    Args:
        dt: A timezone-aware datetime in UTC

    Returns:
        Datetime converted to user's timezone
    """
    if dt.tzinfo is None:
        # If timezone-naive, assume UTC
        dt = dt.replace(tzinfo=UTC)

    return dt.astimezone(get_timezone())


def from_user_timezone(dt: datetime) -> datetime:
    """Convert a datetime in user's timezone to UTC

    Args:
        dt: A timezone-aware datetime in user's timezone

    Returns:
        Datetime converted to UTC
    """
    if dt.tzinfo is None:
        # If timezone-naive, assume user's timezone
        dt = dt.replace(tzinfo=get_timezone())

    return dt.astimezone(UTC)


def make_aware(dt: datetime | None) -> datetime | None:
    """Convert a timezone-naive datetime to timezone-aware (assumes UTC)

    Args:
        dt: A datetime that might be timezone-naive

    Returns:
        Timezone-aware datetime in UTC, or None if input is None
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        # Assume UTC for naive datetimes from database
        return dt.replace(tzinfo=UTC)
    return dt
