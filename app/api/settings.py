import io
import json
import shutil
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path

import structlog
from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_version
from app.core.security import get_current_admin, get_current_user
from app.core.timezone import get_utc_now
from app.db.session import get_db
from app.models.podcast import (
    Episode,
    Podcast,
    Term,
    Transcription,
    VectorSlice,
)
from app.models.prompt import Prompt
from app.models.settings import AppSetting
from app.models.user import User
from app.services.prompt_loader import get_all_prompts, reset_prompt, update_prompt

logger = structlog.get_logger(__name__)
router = APIRouter()


@router.get("/refresh-schedule")
async def get_refresh_schedule(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Get the scheduled podcast refresh time (admin only)"""
    result = await db.execute(select(AppSetting).where(AppSetting.key == "podcast_refresh_time"))
    setting = result.scalar_one_or_none()
    return {"refresh_time": setting.value if setting else "00:00"}


@router.post("/refresh-schedule")
async def update_refresh_schedule(
    refresh_time: str,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Update the scheduled podcast refresh time (HH:MM format)"""
    import re

    # Validate time format
    if not re.match(r"^([01]\d|2[0-3]):([0-5]\d)$", refresh_time):
        raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM (24-hour)")

    result = await db.execute(select(AppSetting).where(AppSetting.key == "podcast_refresh_time"))
    setting = result.scalar_one_or_none()

    if setting:
        setting.value = refresh_time
        setting.updated_at = get_utc_now()
    else:
        setting = AppSetting(key="podcast_refresh_time", value=refresh_time)
        db.add(setting)

    await db.commit()

    # Reload celery beat schedule
    from app.celery_app import celery_app, get_beat_schedule

    celery_app.conf.beat_schedule = get_beat_schedule()

    return {"success": True, "refresh_time": refresh_time}


@router.get("/require-user-approval")
async def get_require_user_approval(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Get whether new user registrations require admin approval (admin only)"""
    result = await db.execute(select(AppSetting).where(AppSetting.key == "require_user_approval"))
    setting = result.scalar_one_or_none()
    # Default to True (require approval) if not set
    return {"require_approval": setting.value == "true" if setting else True}


class RequireApprovalRequest(BaseModel):
    require_approval: bool


@router.post("/require-user-approval")
async def update_require_user_approval(
    request: RequireApprovalRequest,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Update whether new user registrations require admin approval (admin only)"""
    result = await db.execute(select(AppSetting).where(AppSetting.key == "require_user_approval"))
    setting = result.scalar_one_or_none()

    if setting:
        setting.value = "true" if request.require_approval else "false"
        setting.updated_at = get_utc_now()
    else:
        setting = AppSetting(key="require_user_approval", value="true" if request.require_approval else "false")
        db.add(setting)

    await db.commit()

    return {"success": True, "require_approval": request.require_approval}


@router.get("/system-info")
async def get_system_info(
    current_user: User = Depends(get_current_user),  # Changed from get_current_admin - all users can see version
    db: AsyncSession = Depends(get_db)
):
    """Get system information. Storage details require admin, but version is available to all users."""
    import os

    from sqlalchemy import text

    # Calculate directory sizes
    def get_dir_size(path):
        """Calculate total size of a directory"""
        total = 0
        try:
            for entry in os.scandir(path):
                if entry.is_file(follow_symlinks=False):
                    total += entry.stat().st_size
                elif entry.is_dir(follow_symlinks=False):
                    total += get_dir_size(entry.path)
        except (PermissionError, FileNotFoundError):
            pass
        return total

    # Get database size
    try:
        result = await db.execute(text("SELECT pg_database_size(current_database())"))
        db_size = result.scalar() or 0
    except Exception:
        db_size = 0

    # Get uploads directory size
    upload_dir = Path("echolens_data/uploads")
    uploads_size = get_dir_size(upload_dir) if upload_dir.exists() else 0

    # Get exports directory size
    export_dir = Path("echolens_data/exports")
    exports_size = get_dir_size(export_dir) if export_dir.exists() else 0

    # Get task logs size
    logs_dir = Path("task_logs")
    logs_size = get_dir_size(logs_dir) if logs_dir.exists() else 0

    # Calculate total
    total_size = db_size + uploads_size + exports_size + logs_size

    return {
        "database_size": db_size,
        "uploads_size": uploads_size,
        "exports_size": exports_size,
        "logs_size": logs_size,
        "total_size": total_size,
        "version": get_version(),
    }


@router.get("/export-rss-links")
async def export_rss_links(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Export all RSS feed URLs as a text file (one per line) - admin only"""
    result = await db.execute(select(Podcast.rss_url).order_by(Podcast.title))
    rss_urls = [row[0] for row in result.all()]

    # Create text content with one URL per line
    content = "\n".join(rss_urls)

    # Return as downloadable file
    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="text/plain",
        headers={"Content-Disposition": "attachment; filename=rss.txt"},
    )


@router.get("/export-estimate")
async def get_export_estimate(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Estimate the size of an export with and without audio files (admin only).
    """
    from sqlalchemy import func, text

    # Try to get database size using SQLAlchemy query
    sql_dump_size = 120 * 1024 * 1024  # Default 120MB estimate

    try:
        # Query database size using SQLAlchemy text() for raw SQL
        result = await db.execute(text("SELECT pg_database_size(current_database())"))
        db_size_bytes = result.scalar()

        if db_size_bytes:
            # pg_dump text format is usually 1.5x the database size
            # (includes SQL commands, CREATE statements, data as text, etc.)
            sql_dump_size = int(db_size_bytes * 1.5)
    except Exception:
        # Use default estimate if query fails
        pass

    # Calculate audio/uploads folder size (excluding chunk files)
    uploads_dir = Path("echolens_data/uploads")
    audio_size = 0
    audio_count = 0

    if uploads_dir.exists():
        for file_path in uploads_dir.rglob("*"):
            if file_path.is_file() and "chunks" not in file_path.parts:
                audio_size += file_path.stat().st_size
                audio_count += 1

    # Get counts for display (using efficient count queries)
    podcast_count = await db.scalar(select(func.count()).select_from(Podcast))
    episode_count = await db.scalar(select(func.count()).select_from(Episode))
    transcription_count = await db.scalar(select(func.count()).select_from(Transcription))
    term_count = await db.scalar(select(func.count()).select_from(Term))
    vector_count = await db.scalar(select(func.count()).select_from(VectorSlice))

    return {
        "metadata_size": sql_dump_size,  # SQL dump size estimate
        "audio_size": audio_size,
        "audio_count": audio_count,
        "podcast_count": podcast_count or 0,
        "episode_count": episode_count or 0,
        "transcription_count": transcription_count or 0,
        "term_count": term_count or 0,
        "vector_count": vector_count or 0,
    }


@router.post("/export")
async def export_data(
    include_audio: bool = Query(False, description="Include audio files in export"),
    current_user: User = Depends(get_current_admin),
):
    """
    Trigger background export task (admin only).
    Returns task ID for tracking progress.

    Deletes all existing exports before creating a new one (only keeps one export at a time).
    """
    try:
        from app.tasks.episode_processing import export_data_task

        # Delete all existing exports (only keep one at a time)
        exports_dir = Path("echolens_data/exports")
        exports_dir.mkdir(parents=True, exist_ok=True)
        if exports_dir.exists():
            for file_path in exports_dir.glob("*"):
                if file_path.is_file():
                    file_path.unlink()

        # Start the background export task
        task = export_data_task.delay(include_audio=include_audio)

        return JSONResponse(
            {
                "task_id": task.id,
                "status": "started",
                "message": "Previous exports deleted. New export started.",
            }
        )
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to start export: {e!s}")


@router.get("/export/download/{filename}")
async def download_export(
    filename: str,
    current_user: User = Depends(get_current_admin)
):
    """
    Download a completed export file (admin only).
    Uses FileResponse for optimal streaming with automatic file closing,
    Content-Length header, and range request support.
    """
    from pathlib import Path

    from fastapi.responses import FileResponse

    exports_dir = Path("echolens_data/exports")
    file_path = exports_dir / filename

    # Security: prevent path traversal
    if not file_path.resolve().parent == exports_dir.resolve():
        raise HTTPException(status_code=400, detail="Invalid filename")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Export file not found")

    # Determine media type
    if filename.endswith(".zip"):
        media_type = "application/zip"
    elif filename.endswith(".sql"):
        media_type = "application/sql"
    else:
        media_type = "application/octet-stream"

    # FileResponse automatically:
    # - Closes file handle after streaming
    # - Adds Content-Length header (enables progress bar)
    # - Supports range requests (resume capability)
    # - Uses optimal chunk size
    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=filename,
    )


@router.get("/export/list")
async def list_exports(
    current_user: User = Depends(get_current_admin)
):
    """
    List all available export files (admin only).
    """
    from pathlib import Path

    exports_dir = Path("echolens_data/exports")
    exports_dir.mkdir(parents=True, exist_ok=True)

    files = []
    for file_path in exports_dir.glob("*"):
        if file_path.is_file():
            stat = file_path.stat()
            files.append(
                {
                    "filename": file_path.name,
                    "size": stat.st_size,
                    "created": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                    "type": "zip" if file_path.suffix == ".zip" else "sql",
                }
            )

    # Sort by creation time, newest first
    files.sort(key=lambda x: x["created"], reverse=True)

    return JSONResponse({"exports": files})


@router.delete("/export/{filename}")
async def delete_export(
    filename: str,
    current_user: User = Depends(get_current_admin)
):
    """
    Delete an export file (admin only).
    """
    from pathlib import Path

    exports_dir = Path("echolens_data/exports")
    file_path = exports_dir / filename

    # Security: prevent path traversal
    if not file_path.resolve().parent == exports_dir.resolve():
        raise HTTPException(status_code=400, detail="Invalid filename")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Export file not found")

    file_path.unlink()

    return JSONResponse({"success": True, "message": "Export deleted"})


@router.post("/export-old")
async def export_data_old(
    include_audio: bool = Query(False, description="Include audio files in export"),
    db: AsyncSession = Depends(get_db),
):
    """
    OLD ENDPOINT - Direct export (kept for reference, will be removed).
    Export all data from the database to a JSON file.
    Includes podcasts, episodes, transcriptions, embeddings, terms, summaries, chats, etc.
    """
    export_data = {
        "version": get_version(),
        "exported_at": get_utc_now().isoformat(),
        "include_audio": include_audio,
        "podcasts": [],
    }

    # Get all podcasts with all related data
    result = await db.execute(select(Podcast))
    podcasts = result.scalars().all()

    for podcast in podcasts:
        # Refresh relationships
        await db.refresh(podcast, ["episodes"])

        podcast_data = {
            "rss_url": podcast.rss_url,
            "title": podcast.title,
            "description": podcast.description,
            "author": podcast.author,
            "image_url": podcast.image_url,
            "episodes": [],
        }

        for episode in podcast.episodes:
            # Refresh all episode relationships
            await db.refresh(
                episode, ["transcription", "terms", "summary", "playback_progress", "chat"]
            )

            episode_data = {
                "title": episode.title,
                "description": episode.description,
                "audio_url": episode.audio_url,
                "duration": episode.duration,
                "published_at": episode.published_at.isoformat() if episode.published_at else None,
                "notes": episode.notes,
                "local_audio_path": episode.local_audio_path,
                "transcription": None,
                "terms": [],
                "summary": None,
                "vector_slices": [],
                "playback_progress": None,
                "chat": None,
            }

            # Transcription with embedding
            if episode.transcription:
                episode_data["transcription"] = {
                    "text": episode.transcription.text,
                    "embedding": episode.transcription.embedding.tolist()
                    if episode.transcription.embedding is not None
                    else None,
                }

            # Terms with embeddings
            for term in episode.terms:
                if not term.hidden:  # Only export visible terms
                    episode_data["terms"].append(
                        {
                            "term": term.term,
                            "context": term.context,
                            "explanation": term.explanation,
                            "elaborate_explanation": term.elaborate_explanation,
                            "embedding": term.embedding.tolist()
                            if term.embedding is not None
                            else None,
                        }
                    )

            # Summary
            if episode.summary:
                episode_data["summary"] = {
                    "text": episode.summary.text,
                    "audio_path": episode.summary.audio_path,
                }

            # Vector slices
            vector_result = await db.execute(
                select(VectorSlice).where(VectorSlice.episode_id == episode.id)
            )
            vector_slices = vector_result.scalars().all()
            for vs in vector_slices:
                episode_data["vector_slices"].append(
                    {
                        "text": vs.text,
                        "chunk_index": vs.chunk_index,
                        "embedding": vs.embedding.tolist() if vs.embedding is not None else None,
                    }
                )

            # Playback progress
            if episode.playback_progress:
                episode_data["playback_progress"] = {
                    "current_time": episode.playback_progress.current_time
                }

            # Chat with messages
            if episode.chat:
                await db.refresh(episode.chat, ["messages"])
                episode_data["chat"] = {
                    "title": episode.chat.title,
                    "messages": [
                        {
                            "role": msg.role,
                            "content": msg.content,
                            "created_at": msg.created_at.isoformat(),
                        }
                        for msg in episode.chat.messages
                    ],
                }

            podcast_data["episodes"].append(episode_data)

        export_data["podcasts"].append(podcast_data)

    # If audio files not included, just return JSON
    if not include_audio:
        json_str = json.dumps(export_data, indent=2)
        return StreamingResponse(
            io.BytesIO(json_str.encode()),
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename=echolens-backup-{get_utc_now().strftime('%Y%m%d')}.json"
            },
        )

    # Create ZIP file with JSON + audio files
    temp_dir = tempfile.mkdtemp()
    try:
        zip_path = Path(temp_dir) / "echolens-backup.zip"

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
            # Add JSON metadata
            json_str = json.dumps(export_data, indent=2)
            zipf.writestr("backup.json", json_str)

            # Add audio files
            for podcast in podcasts:
                await db.refresh(podcast, ["episodes"])
                for episode in podcast.episodes:
                    if episode.local_audio_path:
                        audio_path = Path(episode.local_audio_path)
                        if audio_path.exists():
                            # Store in zip with relative path structure
                            arcname = f"audio/{audio_path.parent.name}/{audio_path.name}"
                            zipf.write(audio_path, arcname)

        # Read zip file and return as stream
        with open(zip_path, "rb") as f:
            zip_data = f.read()

        return StreamingResponse(
            io.BytesIO(zip_data),
            media_type="application/zip",
            headers={
                "Content-Disposition": f"attachment; filename=echolens-backup-{get_utc_now().strftime('%Y%m%d')}.zip"
            },
        )
    finally:
        # Clean up temp directory
        shutil.rmtree(temp_dir, ignore_errors=True)


@router.post("/import")
async def import_data(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_admin)
):
    """
    Import data from a SQL dump or ZIP export file (SQL + uploads) - admin only.
    Starts a background task and returns immediately with a task ID.

    WARNING: This will DROP and recreate the database, removing all existing data!
    """
    from app.tasks.data_import import import_data_task

    logger.info("import_request_received", filename=file.filename, content_type=file.content_type, user_id=str(current_user.id))

    # Save uploaded file to exports directory (same as exports go)
    exports_dir = Path("echolens_data/exports")
    exports_dir.mkdir(parents=True, exist_ok=True)

    # Use timestamp to avoid filename conflicts
    import datetime

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"import_{timestamp}_{file.filename}"
    upload_file = exports_dir / safe_filename

    try:
        logger.info("saving_upload_file", upload_file=str(upload_file), user_id=str(current_user.id))

        # Stream file to disk in chunks to handle large files
        chunk_size = 1024 * 1024  # 1MB chunks
        total_bytes = 0

        with open(upload_file, "wb") as f:
            while chunk := await file.read(chunk_size):
                f.write(chunk)
                total_bytes += len(chunk)

        logger.info("upload_file_saved", upload_file=str(upload_file), total_bytes=total_bytes, user_id=str(current_user.id))

        # Start background task
        task = import_data_task.delay(str(upload_file), file.filename)

        return {"task_id": task.id, "message": "File uploaded, import started in background"}

    except Exception as e:
        logger.exception("import_start_failed", upload_file=str(upload_file), user_id=str(current_user.id), error=str(e))
        # Clean up on error
        if upload_file.exists():
            upload_file.unlink()
        raise HTTPException(
            status_code=500, detail=f"Failed to start import: {e!s}"
        )


@router.get("/import/status/{task_id}")
async def get_import_status(
    task_id: str,
    current_user: User = Depends(get_current_admin)
):
    """
    Get the status and progress of an import task (admin only).
    """
    from celery.result import AsyncResult

    task = AsyncResult(task_id)

    if task.state == "PENDING":
        return {"state": task.state, "status": "Waiting to start..."}
    if task.state == "PROGRESS":
        return {
            "state": task.state,
            "step": task.info.get("step", "Processing..."),
            "progress": task.info.get("progress", 0),
            "total": task.info.get("total", 100),
        }
    if task.state == "SUCCESS":
        return {"state": task.state, "result": task.info}
    if task.state == "FAILURE":
        return {
            "state": task.state,
            "error": str(task.info.get("error", "Unknown error")),
            "traceback": task.info.get("traceback", ""),
        }
    return {"state": task.state, "status": "Processing..."}


# Prompt Management Endpoints


@router.get("/prompts")
async def get_prompts(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Get all AI prompts grouped by category (admin only)"""
    prompts = await get_all_prompts(db)

    # Group by category
    grouped = {}
    for prompt in prompts:
        if prompt.category not in grouped:
            grouped[prompt.category] = []
        grouped[prompt.category].append(
            {
                "key": prompt.key,
                "name": prompt.name,
                "category": prompt.category,
                "description": prompt.description,
                "variables": prompt.variables,
                "content": prompt.content,
                "default_content": prompt.default_content,
                "updated_at": prompt.updated_at.isoformat(),
            }
        )

    return grouped


@router.get("/prompts/{key}")
async def get_prompt(
    key: str,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific prompt by key (admin only)"""
    result = await db.execute(select(Prompt).where(Prompt.key == key))
    prompt = result.scalar_one_or_none()

    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")

    return {
        "key": prompt.key,
        "name": prompt.name,
        "category": prompt.category,
        "description": prompt.description,
        "variables": prompt.variables,
        "content": prompt.content,
        "default_content": prompt.default_content,
        "updated_at": prompt.updated_at.isoformat(),
    }


@router.put("/prompts/{key}")
async def update_prompt_content(
    key: str,
    content: dict,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Update a prompt's content (admin only)"""
    if "content" not in content:
        raise HTTPException(status_code=400, detail="Missing 'content' field")

    try:
        prompt = await update_prompt(db, key, content["content"])
        return {
            "key": prompt.key,
            "name": prompt.name,
            "content": prompt.content,
            "updated_at": prompt.updated_at.isoformat(),
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/prompts/{key}/reset")
async def reset_prompt_to_default(
    key: str,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Reset a prompt to its default content (admin only)"""
    try:
        prompt = await reset_prompt(db, key)
        return {
            "key": prompt.key,
            "name": prompt.name,
            "content": prompt.content,
            "updated_at": prompt.updated_at.isoformat(),
            "message": "Prompt reset to default",
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
