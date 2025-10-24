from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.core.timezone import get_utc_now, make_aware
from app.db.session import get_db
from app.models.podcast import Notification
from app.models.user import User

router = APIRouter()


@router.get("/api/notifications")
async def get_notifications(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get recent notifications for current user"""
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(desc(Notification.created_at))
        .limit(limit)
    )
    notifications = result.scalars().all()

    return {
        "notifications": [
            {
                "id": str(n.id),
                "type": n.type,
                "title": n.title,
                "message": n.message,
                "level": n.level,
                "task_id": n.task_id,
                "episode_id": str(n.episode_id) if n.episode_id else None,
                "podcast_id": str(n.podcast_id) if n.podcast_id else None,
                "read": n.read,
                "created_at": make_aware(n.created_at).isoformat().replace("+00:00", "Z"),
                "time_ago": _get_time_ago(n.created_at),
            }
            for n in notifications
        ],
        "unread_count": sum(1 for n in notifications if n.read == 0),
    }


@router.post("/api/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark a notification as read (user-specific)"""
    from uuid import UUID

    result = await db.execute(
        select(Notification).where(
            Notification.id == UUID(notification_id),
            Notification.user_id == current_user.id
        )
    )
    notification = result.scalar_one_or_none()

    if notification:
        notification.read = 1
        await db.commit()

    return {"success": True}


@router.post("/api/notifications/read-all")
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark all notifications as read (user-specific)"""
    from sqlalchemy import update

    await db.execute(
        update(Notification)
        .values(read=1)
        .where(Notification.read == 0, Notification.user_id == current_user.id)
    )
    await db.commit()

    return {"success": True}


@router.delete("/api/notifications/clear")
async def clear_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Clear all read notifications older than 7 days (user-specific)"""
    cutoff = get_utc_now() - timedelta(days=7)
    # Convert to naive datetime for database comparison (database stores naive UTC)
    cutoff_naive = cutoff.replace(tzinfo=None)

    await db.execute(
        delete(Notification).where(
            Notification.read == 1,
            Notification.created_at < cutoff_naive,
            Notification.user_id == current_user.id
        )
    )
    await db.commit()

    return {"success": True}


def _get_time_ago(dt: datetime) -> str:
    """Convert datetime to relative time string"""
    now = get_utc_now()
    # Both datetimes are naive UTC, so we can subtract directly
    diff = now - dt

    if diff.total_seconds() < 60:
        return "just now"
    if diff.total_seconds() < 3600:
        minutes = int(diff.total_seconds() / 60)
        return f"{minutes}m ago"
    if diff.total_seconds() < 86400:
        hours = int(diff.total_seconds() / 3600)
        return f"{hours}h ago"
    if diff.days < 7:
        return f"{diff.days}d ago"
    return dt.strftime("%b %d")
