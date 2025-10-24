from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

# Initialize Celery
celery_app = Celery(
    "echolens",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

# Celery configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 hour max per task
    worker_prefetch_multiplier=1,  # Process one task at a time per worker
    worker_max_tasks_per_child=50,  # Restart worker after 50 tasks to prevent memory leaks
)


# Function to get dynamic schedule
def get_beat_schedule():
    """Get beat schedule with dynamic podcast refresh time from database"""
    # Default schedule - will be updated when settings change
    hour, minute = 0, 0  # Default to midnight

    try:
        import asyncio

        from sqlalchemy import select

        from app.db.session import async_session_maker
        from app.models.settings import AppSetting

        async def get_refresh_time():
            try:
                async with async_session_maker() as db:
                    result = await db.execute(
                        select(AppSetting).where(AppSetting.key == "podcast_refresh_time")
                    )
                    setting = result.scalar_one_or_none()
                    return setting.value if setting else "00:00"
            except Exception:
                return "00:00"

        refresh_time = asyncio.run(get_refresh_time())
        hour, minute = map(int, refresh_time.split(":"))
    except Exception:
        pass  # Use default midnight time

    return {
        "cleanup-orphaned-tasks": {
            "task": "cleanup_orphaned_tasks",
            "schedule": 300.0,  # Run every 5 minutes
        },
        "refresh-all-podcasts-scheduled": {
            "task": "refresh_all_podcasts_scheduled",
            "schedule": crontab(hour=hour, minute=minute),  # Dynamic time from settings
        },
    }


# Periodic tasks - set initial schedule
celery_app.conf.beat_schedule = get_beat_schedule()

# Auto-discover tasks
celery_app.autodiscover_tasks(["app.tasks"])
