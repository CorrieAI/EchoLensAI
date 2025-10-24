import structlog
from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.celery_app import celery_app
from app.core.security import get_current_user
from app.core.timezone import get_utc_now, make_aware
from app.db.session import get_db
from app.models.podcast import Episode, Podcast, TaskHistory, Term, VectorSlice
from app.models.user import User

logger = structlog.get_logger(__name__)
router = APIRouter()
# templates = Jinja2Templates(directory="templates")  # HTMX only - commented out


@router.get("/api/tasks/{task_id}/logs")
async def get_task_logs(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get task-specific logs from log file (user-specific)"""
    import html
    from pathlib import Path
    from uuid import UUID

    # Convert database ID to Celery task_id if needed
    celery_task_id = task_id
    try:
        uuid_id = UUID(task_id)
        result = await db.execute(
            select(TaskHistory)
            .options(selectinload(TaskHistory.podcast))
            .where(TaskHistory.id == uuid_id)
        )
        task_record = result.scalar_one_or_none()
        if task_record:
            # Verify ownership (unless admin)
            if not current_user.is_admin and task_record.podcast:
                if str(task_record.podcast.user_id) != str(current_user.id):
                    raise HTTPException(status_code=403, detail="Not authorized to view this task")
            celery_task_id = task_record.task_id
    except ValueError:
        pass

    # Read from task-specific log file (shared volume)
    try:
        log_file = Path(f"task_logs/{celery_task_id}.log")

        if not log_file.exists():
            return HTMLResponse(content="No logs available for this task yet...")

        # Read the file
        with open(log_file) as f:
            lines = f.readlines()

        # Get last 200 lines
        task_logs = [line.rstrip() for line in lines[-200:]]

        if not task_logs or (len(task_logs) == 1 and not task_logs[0].strip()):
            return HTMLResponse(content="No logs available yet...")

        # Escape HTML and return
        log_html = "\n".join(html.escape(line) for line in task_logs if line.strip())

        return HTMLResponse(content=log_html if log_html else "No logs available yet...")

    except Exception as e:
        return HTMLResponse(content=f"Error fetching logs: {e!s}")


@router.get("/api/tasks")
async def get_tasks_json(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all tasks (active, queued, recent) - JSON endpoint for Next.js (user-specific)"""
    try:
        from sqlalchemy.orm import selectinload

        # Build base query filter (admins see all tasks, users see only their podcasts' tasks)
        def apply_user_filter(query):
            if not current_user.is_admin:
                # Filter to user's podcasts only
                query = query.join(Podcast).where(Podcast.user_id == current_user.id)
            return query

        # Get active tasks (PROGRESS - matches HTMX version)
        active_query = (
            select(TaskHistory)
            .options(selectinload(TaskHistory.episode), selectinload(TaskHistory.podcast))
            .where(TaskHistory.status == "PROGRESS")
            .order_by(TaskHistory.started_at.desc())
        )
        active_result = await db.execute(apply_user_filter(active_query))
        active_tasks = active_result.scalars().all()

        # Get queued tasks (PENDING)
        queued_query = (
            select(TaskHistory)
            .options(selectinload(TaskHistory.episode), selectinload(TaskHistory.podcast))
            .where(TaskHistory.status == "PENDING")
            .order_by(TaskHistory.started_at.desc())
        )
        queued_result = await db.execute(apply_user_filter(queued_query))
        queued_tasks = queued_result.scalars().all()

        # Get recent tasks (SUCCESS, FAILURE, CANCELLED)
        recent_query = (
            select(TaskHistory)
            .options(selectinload(TaskHistory.episode), selectinload(TaskHistory.podcast))
            .where(TaskHistory.status.in_(["SUCCESS", "FAILURE", "CANCELLED"]))
            .order_by(TaskHistory.started_at.desc())
            .limit(20)
        )
        recent_result = await db.execute(apply_user_filter(recent_query))
        recent_tasks = recent_result.scalars().all()

        def serialize_task(task):
            # Create task_name from podcast and episode titles (like HTMX version)
            podcast_title = task.podcast.title if task.podcast else "Unknown Podcast"
            episode_title = task.episode.title if task.episode else "Unknown Episode"
            task_name = f"{podcast_title} - {episode_title}"

            # Make timestamps timezone-aware and format with Z suffix
            started_at_str = None
            if task.started_at:
                aware_dt = make_aware(task.started_at)
                started_at_str = aware_dt.isoformat().replace("+00:00", "Z")

            completed_at_str = None
            if task.completed_at:
                aware_dt = make_aware(task.completed_at)
                completed_at_str = aware_dt.isoformat().replace("+00:00", "Z")

            return {
                "id": str(task.id),
                "task_id": task.task_id,
                "task_name": task_name,
                "status": task.status,
                "started_at": started_at_str,
                "completed_at": completed_at_str,
                "episode_id": str(task.episode_id) if task.episode_id else None,
                "podcast_id": str(task.podcast_id) if task.podcast_id else None,
                "error_message": task.error_message,
                "episode": {
                    "id": str(task.episode.id),
                    "title": task.episode.title,
                    "duration": task.episode.duration,
                }
                if task.episode
                else None,
                "podcast": {"id": str(task.podcast.id), "title": task.podcast.title}
                if task.podcast
                else None,
            }

        return {
            "active": [serialize_task(task) for task in active_tasks],
            "queued": [serialize_task(task) for task in queued_tasks],
            "recent": [serialize_task(task) for task in recent_tasks],
        }
    except Exception as e:
        logger.exception("error_in_get_tasks_json", user_id=str(current_user.id), error=str(e))
        return {"active": [], "queued": [], "recent": []}


@router.get("/api/tasks/{task_id}/detail")
async def get_task_detail_json(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed task status with current step - JSON endpoint for Next.js (user-specific)"""
    from uuid import UUID

    # Get task from database first (task_id might be database ID or Celery task_id)
    # Try as database ID first (UUID format)
    task_record = None
    celery_task_id = task_id

    try:
        # Try to parse as UUID (database ID)
        uuid_id = UUID(task_id)
        db_result = await db.execute(
            select(TaskHistory)
            .options(selectinload(TaskHistory.episode), selectinload(TaskHistory.podcast))
            .where(TaskHistory.id == uuid_id)
        )
        task_record = db_result.scalar_one_or_none()
        if task_record:
            # Verify ownership (unless admin)
            if not current_user.is_admin and task_record.podcast:
                if str(task_record.podcast.user_id) != str(current_user.id):
                    raise HTTPException(status_code=403, detail="Not authorized to view this task")
            celery_task_id = task_record.task_id
    except ValueError:
        # Not a UUID, treat as Celery task_id
        pass

    # If not found by database ID, try by Celery task_id
    if not task_record:
        db_result = await db.execute(
            select(TaskHistory)
            .options(selectinload(TaskHistory.episode), selectinload(TaskHistory.podcast))
            .where(TaskHistory.task_id == task_id)
        )
        task_record = db_result.scalar_one_or_none()
        if task_record:
            # Verify ownership (unless admin)
            if not current_user.is_admin and task_record.podcast:
                if str(task_record.podcast.user_id) != str(current_user.id):
                    raise HTTPException(status_code=403, detail="Not authorized to view this task")
            celery_task_id = task_record.task_id

    # Get task from Celery using the Celery task_id
    task_result = AsyncResult(celery_task_id, app=celery_app)

    # Define processing steps
    steps = [
        "Starting processing",
        "Downloading audio",
        "Transcribing audio",
        "Creating vector embeddings",
        "Extracting terms",
        "Generating summary",
    ]

    current_step_index = -1
    current_step_message = ""

    # Determine current step from Celery state
    if task_result.status == "PROGRESS":
        # Get step info from Celery metadata
        if task_result.info and isinstance(task_result.info, dict):
            current_step_message = task_result.info.get("step", "Processing...")

            # Match step by name (substring matching)
            for i, step in enumerate(steps):
                if step.lower() in current_step_message.lower():
                    current_step_index = i
                    break
        else:
            # If no metadata, assume first step
            current_step_index = 0
            current_step_message = "Processing..."
    elif task_result.status == "SUCCESS":
        current_step_index = len(steps)  # All completed

    # Build step status
    step_statuses = []
    for i, step in enumerate(steps):
        if current_step_index > i or task_result.status == "SUCCESS":
            status = "completed"
        elif current_step_index == i:
            status = "active"
        else:
            status = "pending"

        step_statuses.append(
            {
                "name": step,
                "status": status,
                "detail": current_step_message.split(":", 1)[1].strip()
                if status == "active" and ":" in current_step_message
                else None,
            }
        )

    # Include progress info for export tasks and other tasks that use it
    progress_info = None
    if task_result.status == "PROGRESS" and task_result.info and isinstance(task_result.info, dict):
        progress_info = task_result.info

    return {
        "task_id": task_id,
        "status": task_result.status,
        "episode_title": task_record.episode.title
        if task_record and task_record.episode
        else "Unknown Episode",
        "podcast_title": task_record.podcast.title
        if task_record and task_record.podcast
        else "Unknown Podcast",
        "current_step": current_step_message,
        "steps": step_statuses,
        "progress": progress_info,  # Include raw progress info for export tasks
        "error_message": task_record.error_message if task_record else None,
        "error": str(task_result.info) if task_result.status == "FAILURE" else None,
    }


@router.post("/api/tasks/{task_id}/cancel")
async def cancel_task(
    task_id: str,
    cleanup: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Cancel a running task (user-specific).

    Args:
        task_id: The task ID (database ID or Celery task_id)
        cleanup: If True, also clean up any data created during the task
    """
    import shutil
    from pathlib import Path
    from uuid import UUID

    from app.celery_app import celery_app

    # Convert database ID to Celery task_id if needed
    celery_task_id = task_id
    task_record = None

    try:
        uuid_id = UUID(task_id)
        result = await db.execute(
            select(TaskHistory)
            .options(selectinload(TaskHistory.podcast))
            .where(TaskHistory.id == uuid_id)
        )
        task_record = result.scalar_one_or_none()
        if task_record:
            # Verify ownership (unless admin)
            if not current_user.is_admin and task_record.podcast:
                if str(task_record.podcast.user_id) != str(current_user.id):
                    raise HTTPException(status_code=403, detail="Not authorized to cancel this task")
            celery_task_id = task_record.task_id
    except ValueError:
        pass

    # If not found by database ID, try by Celery task_id
    if not task_record:
        result = await db.execute(
            select(TaskHistory)
            .options(selectinload(TaskHistory.podcast))
            .where(TaskHistory.task_id == task_id)
        )
        task_record = result.scalar_one_or_none()
        if task_record:
            # Verify ownership (unless admin)
            if not current_user.is_admin and task_record.podcast:
                if str(task_record.podcast.user_id) != str(current_user.id):
                    raise HTTPException(status_code=403, detail="Not authorized to cancel this task")
            celery_task_id = task_record.task_id

    # Revoke the Celery task
    celery_app.control.revoke(celery_task_id, terminate=True, signal="SIGKILL")

    if task_record:
        task_record.status = "CANCELLED"
        task_record.completed_at = get_utc_now()

        # If cleanup requested, remove data created during this task
        if cleanup and task_record.episode_id:
            episode_id = task_record.episode_id

            # Get episode to find associated data
            episode_result = await db.execute(select(Episode).where(Episode.id == episode_id))
            episode = episode_result.scalar_one_or_none()

            if episode:
                # Delete transcription (need to fetch it separately)
                from app.models.podcast import Summary, Transcription

                transcription_result = await db.execute(
                    select(Transcription).where(Transcription.episode_id == episode_id)
                )
                transcription = transcription_result.scalar_one_or_none()
                if transcription:
                    await db.delete(transcription)

                # Delete summary
                summary_result = await db.execute(
                    select(Summary).where(Summary.episode_id == episode_id)
                )
                summary = summary_result.scalar_one_or_none()
                if summary:
                    await db.delete(summary)

                # Delete terms for this episode
                await db.execute(delete(Term).where(Term.episode_id == episode_id))

                # Delete vector slices
                await db.execute(delete(VectorSlice).where(VectorSlice.episode_id == episode_id))

                # Delete audio file and episode directory
                if episode.local_audio_path:
                    audio_path = Path(episode.local_audio_path)
                    episode_dir = audio_path.parent

                    if episode_dir.exists():
                        shutil.rmtree(episode_dir, ignore_errors=True)

                    episode.local_audio_path = None

        await db.commit()

    return {"status": "cancelled", "task_id": task_id, "cleanup_performed": cleanup}


@router.post("/api/tasks/clear-history")
async def clear_task_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Clear all completed/failed/cancelled tasks from history - JSON endpoint for Next.js (user-specific)"""
    from app.models.podcast import Notification

    # Build query to delete user's completed tasks (admins clear all tasks)
    if current_user.is_admin:
        # Admin clears all tasks
        result = await db.execute(
            delete(TaskHistory).where(TaskHistory.status.in_(["SUCCESS", "FAILURE", "CANCELLED"]))
        )
    else:
        # User clears only their podcast's tasks
        # We need to use a subquery to filter by podcast ownership
        user_podcasts_subquery = select(Podcast.id).where(Podcast.user_id == current_user.id)
        result = await db.execute(
            delete(TaskHistory).where(
                TaskHistory.status.in_(["SUCCESS", "FAILURE", "CANCELLED"]),
                TaskHistory.podcast_id.in_(user_podcasts_subquery)
            )
        )

    deleted_count = result.rowcount
    await db.commit()

    # Create user-specific notification
    notification = Notification(
        type="task_history_cleared",
        title="Task History Cleared",
        message=f"Cleared {deleted_count} completed task{'' if deleted_count == 1 else 's'} from history",
        level="info",
        read=0,
        user_id=current_user.id,
    )
    db.add(notification)
    await db.commit()

    return {"status": "success", "deleted_count": deleted_count}


@router.post("/api/tasks/cleanup-orphaned")
async def cleanup_orphaned_tasks(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Clean up tasks stuck in PENDING or PROGRESS that no longer exist in Celery.
    Marks them as FAILED with an error message (user-specific).
    """
    from datetime import datetime, timedelta

    from app.models.podcast import Notification

    # Find tasks stuck in PENDING/PROGRESS for more than 5 minutes
    cutoff_time = datetime.now() - timedelta(minutes=5)

    # Build query to find stuck tasks (admins see all, users see only their podcasts)
    query = (
        select(TaskHistory)
        .options(selectinload(TaskHistory.podcast))
        .where(
            TaskHistory.status.in_(["PENDING", "PROGRESS"]),
            TaskHistory.started_at < cutoff_time
        )
    )

    if not current_user.is_admin:
        # Filter to user's podcasts only
        query = query.join(Podcast).where(Podcast.user_id == current_user.id)

    result = await db.execute(query)
    stuck_tasks = result.scalars().all()

    cleaned = 0
    for task in stuck_tasks:
        # Check if task still exists in Celery
        celery_result = AsyncResult(task.task_id, app=celery_app)

        # If task doesn't exist or is in a failed/revoked state, mark as failed
        # PENDING in Celery means the task was never received by a worker
        if celery_result.state in ["PENDING", "FAILURE", "REVOKED"]:
            task.status = "FAILURE"
            task.error_message = "Task was interrupted or orphaned (worker restart/crash)"
            task.completed_at = datetime.now()
            cleaned += 1

    if cleaned > 0:
        await db.commit()

        # Create user-specific notification
        notification = Notification(
            type="tasks_cleaned",
            title="Orphaned Tasks Cleaned",
            message=f"Cleaned up {cleaned} orphaned task{'' if cleaned == 1 else 's'}",
            level="info",
            read=0,
            user_id=current_user.id,
        )
        db.add(notification)
        await db.commit()

    return {"status": "success", "cleaned": cleaned, "checked": len(stuck_tasks)}
