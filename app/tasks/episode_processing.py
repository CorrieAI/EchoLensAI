import asyncio
from datetime import UTC
from uuid import UUID

import structlog
from celery import Task
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.celery_app import celery_app
from app.core.config import settings
from app.db.session import async_session_maker
from app.models.podcast import (
    Episode,
    Notification,
    Summary,
    TaskHistory,
    Term,
    Transcription,
    VectorSlice,
)
from app.services import audio_downloader, summarization, term_extraction, transcription

logger = structlog.get_logger(__name__)


def get_task_session_maker():
    """
    Create a new session maker for Celery tasks.
    This ensures database connections are bound to the current event loop.
    """
    from app.core.config import settings

    # Create a new engine for this task
    engine_config = {
        "echo": False,
        "pool_pre_ping": True,
        "pool_recycle": 3600,
    }

    if "neon.tech" in settings.database_url or "ssl=require" in settings.database_url:
        engine_config["connect_args"] = {
            "ssl": "require",
            "prepared_statement_cache_size": 0,
        }

    task_engine = create_async_engine(settings.database_url, **engine_config)
    return async_sessionmaker(task_engine, class_=AsyncSession, expire_on_commit=False)


async def update_task_history(
    task_id: str, status: str, error_message: str = None, completed: bool = False
):
    """
    Shared helper to update task history in database.
    Used by all Celery tasks to track their progress.
    """
    from datetime import datetime

    task_session_maker = get_task_session_maker()
    async with task_session_maker() as db:
        result = await db.execute(select(TaskHistory).where(TaskHistory.task_id == task_id))
        task_record = result.scalar_one_or_none()

        if task_record:
            task_record.status = status
            if error_message:
                task_record.error_message = error_message
            if completed:
                # Use naive datetime to match database column type
                task_record.completed_at = datetime.now()
            await db.commit()


async def copy_existing_processing(
    episode: Episode, db: AsyncSession, logger
) -> bool:
    """
    Check if another episode with the same audio_url already has processing results.
    If yes, copy transcription, summary, terms, and embeddings to save processing time.

    This enables deduplication: when multiple users add the same podcast,
    only the first user's processing is done. Subsequent users get instant results.

    Returns:
        True if processing was copied, False if no existing processing found
    """
    from sqlalchemy.orm import selectinload

    # Find another episode with the same audio URL that has been processed
    result = await db.execute(
        select(Episode)
        .options(
            selectinload(Episode.transcription),
            selectinload(Episode.summary),
            selectinload(Episode.terms)
        )
        .where(
            Episode.audio_url == episode.audio_url,
            Episode.id != episode.id  # Different episode
        )
    )
    source_episode = result.scalar_one_or_none()

    if not source_episode:
        logger.info("No existing processing found for this audio URL - will process from scratch")
        return False

    # Check if source has been processed (relationships are already loaded)
    if not source_episode.transcription:
        logger.info(f"Found episode {source_episode.id} but it hasn't been processed yet")
        return False

    logger.info(f"Found existing processing from episode {source_episode.id} - copying results!")

    # Copy transcription
    if source_episode.transcription and not episode.transcription:
        new_transcription = Transcription(
            episode_id=episode.id,
            text=source_episode.transcription.text,
            created_at=source_episode.transcription.created_at
        )
        db.add(new_transcription)
        logger.info("✓ Copied transcription")

    # Copy summary
    if source_episode.summary and not episode.summary:
        new_summary = Summary(
            episode_id=episode.id,
            text=source_episode.summary.text,
            audio_path=source_episode.summary.audio_path,  # Summary audio can also be shared
            created_at=source_episode.summary.created_at
        )
        db.add(new_summary)
        logger.info("✓ Copied summary")

    # Copy terms (already loaded via selectinload)
    if source_episode.terms:
        term_count = 0
        for source_term in source_episode.terms:
            new_term = Term(
                episode_id=episode.id,
                term=source_term.term,
                context=source_term.context,
                explanation=source_term.explanation,
                elaborate_explanation=source_term.elaborate_explanation,
                hidden=source_term.hidden,
                source=source_term.source,
                embedding=source_term.embedding,
                created_at=source_term.created_at
            )
            db.add(new_term)
            term_count += 1
        if term_count > 0:
            logger.info(f"✓ Copied {term_count} terms")

    # Copy vector embeddings
    source_vectors = await db.execute(
        select(VectorSlice).where(VectorSlice.episode_id == source_episode.id)
    )
    vector_count = 0
    for source_vector in source_vectors.scalars():
        new_vector = VectorSlice(
            episode_id=episode.id,
            podcast_id=episode.podcast_id,  # Include required podcast_id
            chunk_index=source_vector.chunk_index,
            text=source_vector.text,
            embedding=source_vector.embedding,  # Share the embedding vector
            created_at=source_vector.created_at
        )
        db.add(new_vector)
        vector_count += 1

    if vector_count > 0:
        logger.info(f"✓ Copied {vector_count} vector embeddings")

    await db.commit()
    # Refresh episode and reload podcast relationship to avoid greenlet errors
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Episode)
        .options(selectinload(Episode.podcast))
        .where(Episode.id == episode.id)
    )
    refreshed_episode = result.scalar_one()
    # Update the episode object's relationships
    episode.podcast = refreshed_episode.podcast

    logger.info("Successfully copied all processing results!")
    return True


class DatabaseTask(Task):
    """Base task that handles database session"""

    _session = None

    @property
    def session(self):
        if self._session is None:
            self._session = async_session_maker()
        return self._session


@celery_app.task(bind=True, base=DatabaseTask, name="process_episode")
def process_episode_task(self, episode_id: str):
    """
    Process an episode: download audio, transcribe, extract terms, generate summary

    Args:
        episode_id: UUID string of the episode to process
    """
    import asyncio

    # Get or create event loop for this task
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    # Create session maker AFTER ensuring we have the right event loop
    # This ensures all async operations use the correct loop
    task_session_maker = get_task_session_maker()

    # Setup file logging for this task
    from app.core.logging_config import setup_task_file_logging
    file_handler = setup_task_file_logging(self.request.id)

    # Bind task context for structured logging
    task_logger = logger.bind(task_id=self.request.id, episode_id=episode_id, task_name="process_episode")

    task_logger.info("task_started", episode_id=episode_id)

    async def create_notification(
        title: str, message: str, level: str, episode_id_val=None, podcast_id_val=None
    ):
        """Helper to create a notification"""

        async with task_session_maker() as db:
            notification = Notification(
                type="task_event",
                title=title,
                message=message,
                level=level,
                task_id=self.request.id,
                episode_id=episode_id_val,
                podcast_id=podcast_id_val,
            )
            db.add(notification)
            await db.commit()

    async def process():
        episode_uuid = UUID(episode_id)

        async with task_session_maker() as db:
            # Get episode with podcast info - use selectinload to avoid greenlet errors
            from sqlalchemy.orm import selectinload

            result = await db.execute(
                select(Episode)
                .options(
                    selectinload(Episode.podcast),
                    selectinload(Episode.transcription),
                    selectinload(Episode.summary)
                )
                .where(Episode.id == episode_uuid)
            )
            episode = result.scalar_one_or_none()

            if not episode:
                raise ValueError(f"Episode {episode_id} not found")

            # Update task state with episode info
            self.update_state(
                state="PROGRESS",
                meta={
                    "step": "Starting processing",
                    "episode_title": episode.title,
                    "podcast_title": episode.podcast.title if episode.podcast else "Unknown",
                    "started_at": str(self.request.id),
                },
            )

            # Update database status to PROGRESS
            await update_task_history(self.request.id, "PROGRESS")

            # DEDUPLICATION: Check if another user already processed this same episode
            # If yes, copy their results instead of re-processing
            task_logger.info("checking_deduplication", episode_id=str(episode.id))
            if await copy_existing_processing(episode, db, task_logger):
                task_logger.info("deduplication_complete", episode_id=str(episode.id), episode_title=episode.title)
                await update_task_history(self.request.id, "SUCCESS", completed=True)
                self.update_state(
                    state="SUCCESS",
                    meta={
                        "step": "Completed (deduplicated)",
                        "episode_title": episode.title,
                        "podcast_title": episode.podcast.title if episode.podcast else "Unknown",
                    },
                )
                return {
                    "status": "success",
                    "episode_id": str(episode.id),
                    "deduplicated": True,
                    "message": "Processing results copied from existing episode"
                }

            # Store metadata for all subsequent updates
            task_meta = {
                "episode_title": episode.title,
                "podcast_title": episode.podcast.title if episode.podcast else "Unknown",
            }

            # Create start notification
            await create_notification(
                title="Processing Started",
                message=f"Started processing: {episode.title}",
                level="info",
                episode_id_val=episode_uuid,
                podcast_id_val=episode.podcast_id if episode.podcast_id else None,
            )

            # Download audio with structured path (skip if already done)
            audio_path = episode.local_audio_path
            if not audio_path:
                task_logger.info("audio_download_started", episode_id=str(episode.id))
                self.update_state(state="PROGRESS", meta={**task_meta, "step": "Downloading audio"})
                audio_path = await audio_downloader.download_audio(
                    episode.audio_url,
                    settings.upload_dir,
                    podcast_title=episode.podcast.title if episode.podcast else None,
                    episode_id=str(episode.id),
                )
                episode.local_audio_path = audio_path
                await db.commit()
                task_logger.info("audio_downloaded", episode_id=str(episode.id), audio_path=audio_path)
            else:
                task_logger.info("audio_already_downloaded", episode_id=str(episode.id), audio_path=audio_path)

            # Get episode directory for saving files
            from pathlib import Path

            episode_dir = Path(audio_path).parent

            # Transcribe (skip if already done)
            transcript_text = None
            if not episode.transcription:
                task_logger.info("transcription_started", episode_id=str(episode.id), audio_path=audio_path)

                # Check file size to determine if chunking is needed
                import os

                file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
                task_logger.info("audio_file_size_checked", episode_id=str(episode.id), size_mb=file_size_mb)

                if file_size_mb >= 25:
                    task_logger.info("audio_chunking_required", episode_id=str(episode.id), size_mb=file_size_mb)
                else:
                    task_logger.info("audio_direct_transcription", episode_id=str(episode.id), size_mb=file_size_mb)

                self.update_state(
                    state="PROGRESS", meta={**task_meta, "step": "Transcribing audio"}
                )

                # Progress callback for chunk updates
                def progress_callback(current, total, message):
                    task_logger.info("transcription_progress", episode_id=str(episode.id), chunk_current=current, chunk_total=total)
                    self.update_state(
                        state="PROGRESS",
                        meta={**task_meta, "step": f"Transcribing audio: chunk {current}/{total}"},
                    )

                transcript_text = await transcription.transcribe_audio(
                    audio_path, progress_callback
                )
                task_logger.info(
                    "transcription_complete",
                    episode_id=str(episode.id),
                    char_count=len(transcript_text),
                    word_count=len(transcript_text.split())
                )

                # Save transcription immediately (before any other steps that might fail)
                transcript = Transcription(
                    episode_id=episode_uuid, text=transcript_text, embedding=None
                )
                db.add(transcript)
                await db.commit()
                # Reload episode with transcription to avoid greenlet errors
                from sqlalchemy.orm import selectinload
                result = await db.execute(
                    select(Episode)
                    .options(selectinload(Episode.transcription))
                    .where(Episode.id == episode_uuid)
                )
                episode = result.scalar_one()
            else:
                transcript_text = episode.transcription.text

            # Store vector slices (skip if already done)
            from app.services.vector_store import store_episode_vectors

            vector_check = await db.execute(
                select(VectorSlice).where(VectorSlice.episode_id == episode_uuid).limit(1)
            )
            if not vector_check.scalar_one_or_none():
                task_logger.info("vector_embeddings_started", episode_id=str(episode.id))
                self.update_state(
                    state="PROGRESS", meta={**task_meta, "step": "Creating vector embeddings"}
                )
                await store_episode_vectors(episode_uuid, episode.podcast_id, transcript_text, db)
                task_logger.info("vector_embeddings_created", episode_id=str(episode.id))
            else:
                task_logger.info("vector_embeddings_already_exist", episode_id=str(episode.id))

            # Get existing terms
            existing_terms_result = await db.execute(
                select(Term.term)
                .distinct()
                .join(Episode)
                .where(Episode.podcast_id == episode.podcast_id)
            )
            existing_terms = [row[0] for row in existing_terms_result.all()]

            # Extract terms (skip if already done for this episode)
            episode_terms_check = await db.execute(
                select(Term).where(Term.episode_id == episode_uuid).limit(1)
            )
            if not episode_terms_check.scalar_one_or_none():
                task_logger.info("term_extraction_started", episode_id=str(episode.id))
                # Use chunked extraction - same logic as incremental extraction
                chunk_size = 10000  # ~2500 words per chunk
                total_length = len(transcript_text)
                total_chunks = (total_length + chunk_size - 1) // chunk_size

                for chunk_num in range(total_chunks):
                    offset = chunk_num * chunk_size
                    chunk_text = transcript_text[offset : offset + chunk_size]

                    # Update progress
                    progress_percent = int((offset / total_length) * 100)
                    task_logger.info(
                        "term_extraction_progress",
                        episode_id=str(episode.id),
                        chunk_num=chunk_num + 1,
                        total_chunks=total_chunks,
                        progress_percent=progress_percent,
                        chunk_size=len(chunk_text)
                    )
                    self.update_state(
                        state="PROGRESS",
                        meta={
                            **task_meta,
                            "step": f"Extracting terms (chunk {chunk_num + 1}/{total_chunks})",
                            "progress_percent": progress_percent,
                        },
                    )

                    # Extract terms from this chunk using fast method
                    task_logger.info(
                        "term_extraction_ai_call",
                        episode_id=str(episode.id),
                        chunk_num=chunk_num + 1,
                        total_chunks=total_chunks
                    )
                    terms_data = await term_extraction.extract_terms_fast(
                        chunk_text, db, existing_terms, episode.title
                    )
                    task_logger.info(
                        "term_extraction_ai_complete",
                        episode_id=str(episode.id),
                        chunk_num=chunk_num + 1,
                        total_chunks=total_chunks,
                        terms_count=len(terms_data)
                    )

                    # Add new terms to database
                    new_terms_count = 0
                    for term_data in terms_data:
                        existing_check = await db.execute(
                            select(Term)
                            .join(Episode)
                            .where(
                                Episode.podcast_id == episode.podcast_id,
                                Term.term.ilike(term_data["term"]),
                            )
                        )
                        if not existing_check.scalar_one_or_none():
                            # Filter to only valid Term fields as extra safety
                            valid_fields = {"term", "context", "explanation"}
                            filtered_data = {
                                k: v for k, v in term_data.items() if k in valid_fields
                            }

                            task_logger.info(
                                "term_embedding_generated",
                                episode_id=str(episode.id),
                                term=filtered_data['term']
                            )
                            term_embedding = await transcription.generate_embedding(
                                filtered_data["term"]
                            )
                            term = Term(
                                episode_id=episode_uuid, embedding=term_embedding, **filtered_data
                            )
                            db.add(term)
                            existing_terms.append(filtered_data["term"])
                            new_terms_count += 1
                        else:
                            task_logger.info("duplicate_term_skipped", episode_id=str(episode.id), term=term_data['term'])

                    await db.commit()
                    task_logger.info(
                        "terms_saved_for_chunk",
                        episode_id=str(episode.id),
                        new_terms_count=new_terms_count,
                        chunk_num=chunk_num + 1,
                        total_chunks=total_chunks
                    )

                task_logger.info("term_extraction_complete", episode_id=str(episode.id), total_terms=len(existing_terms))
            else:
                task_logger.info("terms_already_extracted", episode_id=str(episode.id))

            # Generate summary (skip if already done)
            if not episode.summary:
                task_logger.info("summary_generation_started", episode_id=str(episode.id))
                self.update_state(
                    state="PROGRESS", meta={**task_meta, "step": "Generating summary"}
                )
                summary_text = await summarization.generate_summary(transcript_text, db)
                task_logger.info("summary_generated", episode_id=str(episode.id), char_count=len(summary_text))

                task_logger.info("summary_audio_generation_started", episode_id=str(episode.id))
                summary_audio_path = await summarization.generate_summary_audio(
                    summary_text, str(episode_dir)
                )
                if summary_audio_path:
                    task_logger.info("summary_audio_generated", episode_id=str(episode.id), audio_path=summary_audio_path)
                else:
                    task_logger.info("summary_audio_skipped", episode_id=str(episode.id), reason="tts_disabled")

                summary = Summary(
                    episode_id=episode_uuid, text=summary_text, audio_path=summary_audio_path
                )
                db.add(summary)
                await db.commit()
            else:
                task_logger.info("summary_already_exists", episode_id=str(episode.id))

            # Update podcast processed count
            from app.api.podcasts import update_podcast_counts

            await update_podcast_counts(episode.podcast_id, db)

            # Update task history as complete
            await update_task_history(self.request.id, "SUCCESS", completed=True)

            # Create completion notification
            await create_notification(
                title="Processing Complete",
                message=f"Finished processing: {episode.title}",
                level="success",
                episode_id_val=episode_uuid,
                podcast_id_val=episode.podcast_id if episode.podcast_id else None,
            )

            task_logger.info("episode_processing_complete", episode_id=str(episode.id), episode_title=episode.title)

            return {"episode_id": str(episode_uuid), "status": "completed", **task_meta}

    # Run the async function (loop and session_maker created at top of function)
    try:
        return loop.run_until_complete(process())
    except Exception as e:
        # Update task history as failed
        try:
            loop.run_until_complete(
                update_task_history(self.request.id, "FAILURE", str(e), completed=True)
            )
        except Exception:
            # If we can't update using the loop, create a new one
            error_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(error_loop)
            try:
                error_loop.run_until_complete(
                    update_task_history(self.request.id, "FAILURE", str(e), completed=True)
                )
            finally:
                error_loop.close()

        # Create error notification
        async def create_error_notification():
            from uuid import UUID
            from sqlalchemy.orm import selectinload

            async with task_session_maker() as db:
                result = await db.execute(
                    select(Episode)
                    .options(selectinload(Episode.podcast))
                    .where(Episode.id == UUID(episode_id))
                )
                episode = result.scalar_one_or_none()
                if episode:
                    from app.models.podcast import Notification

                    notification = Notification(
                        type="task_event",
                        title="Processing Failed",
                        message=f"Error processing {episode.title}: {str(e)[:100]}",
                        level="error",
                        task_id=self.request.id,
                        episode_id=episode.id,
                        podcast_id=episode.podcast_id if episode.podcast_id else None,
                    )
                    db.add(notification)
                    await db.commit()

        try:
            loop.run_until_complete(create_error_notification())
        except Exception:
            # If notification creation fails, try with new loop
            error_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(error_loop)
            try:
                error_loop.run_until_complete(create_error_notification())
            finally:
                error_loop.close()
        raise
    finally:
        # Clean up file handler
        import logging
        root_logger = logging.getLogger()
        root_logger.removeHandler(file_handler)
        file_handler.close()
        loop.close()


@celery_app.task(name="cleanup_orphaned_tasks")
def cleanup_orphaned_tasks():
    """
    Clean up tasks that are stuck in PENDING or PROGRESS state but no longer exist in Celery.
    This handles cases where Celery workers restart or tasks are interrupted.
    """
    import asyncio
    from datetime import datetime, timedelta

    from celery.result import AsyncResult

    async def cleanup():
        session_maker = get_task_session_maker()
        async with session_maker() as db:
            # Find tasks stuck in PENDING/PROGRESS for more than 5 minutes
            # Use naive datetime to match database column type
            cutoff_time = datetime.now() - timedelta(minutes=5)
            result = await db.execute(
                select(TaskHistory).where(
                    TaskHistory.status.in_(["PENDING", "PROGRESS"]),
                    TaskHistory.started_at < cutoff_time,
                )
            )
            stuck_tasks = result.scalars().all()

            cleaned = 0
            for task in stuck_tasks:
                # Check if task still exists in Celery
                celery_result = AsyncResult(task.task_id, app=celery_app)

                # If task doesn't exist or is in a terminal state, mark as failed
                if (
                    celery_result.state in ["PENDING", "FAILURE", "REVOKED"]
                    or not celery_result.backend
                ):
                    task.status = "FAILURE"
                    task.error_message = "Task was interrupted or orphaned (worker restart/crash)"
                    # Use naive datetime to match database column type
                    task.completed_at = datetime.now()
                    cleaned += 1

            if cleaned > 0:
                await db.commit()

            return {"cleaned": cleaned, "checked": len(stuck_tasks)}

    return asyncio.run(cleanup())


@celery_app.task(bind=True, name="extract_terms_incremental")
def extract_terms_incremental_task(self, episode_id: str):
    """
    Extract terms from entire transcript incrementally using fast extraction method.
    Processes in chunks, updating progress as it goes.

    Args:
        episode_id: UUID string of the episode
    """
    # Setup file logging for this task
    from app.core.logging_config import setup_task_file_logging
    file_handler = setup_task_file_logging(self.request.id)

    async def process():
        episode_uuid = UUID(episode_id)

        # Create a new session maker for this event loop
        session_maker = get_task_session_maker()
        async with session_maker() as db:
            # Get episode with podcast relationship - use selectinload to avoid greenlet errors
            from sqlalchemy.orm import selectinload

            episode_result = await db.execute(
                select(Episode)
                .options(selectinload(Episode.podcast))
                .where(Episode.id == episode_uuid)
            )
            episode = episode_result.scalar_one_or_none()

            if not episode:
                raise ValueError(f"Episode {episode_id} not found")

            transcript_result = await db.execute(
                select(Transcription).where(Transcription.episode_id == episode_uuid)
            )
            transcript = transcript_result.scalar_one_or_none()

            if not transcript:
                raise ValueError(f"Transcription not found for episode {episode_id}")

            # Set initial task state with episode info
            self.update_state(
                state="PROGRESS",
                meta={
                    "step": "Starting term extraction",
                    "episode_title": episode.title,
                    "podcast_title": episode.podcast.title if episode.podcast else "Unknown",
                    "progress_percent": 0,
                },
            )

            # Store metadata for all subsequent updates
            task_meta = {
                "episode_title": episode.title,
                "podcast_title": episode.podcast.title if episode.podcast else "Unknown",
            }

            # Get existing terms for this podcast to avoid duplicates
            existing_terms_result = await db.execute(
                select(Term.term)
                .distinct()
                .join(Episode)
                .where(Episode.podcast_id == episode.podcast_id)
            )
            existing_terms = [row[0] for row in existing_terms_result.all()]

            # Chunk settings - smaller chunks for faster processing
            chunk_size = 10000  # ~2500 words per chunk
            transcript_text = transcript.text
            total_length = len(transcript_text)
            total_chunks = (total_length + chunk_size - 1) // chunk_size

            total_added = 0

            # Process each chunk
            for chunk_num in range(total_chunks):
                offset = chunk_num * chunk_size
                chunk_text = transcript_text[offset : offset + chunk_size]

                # Update progress
                progress_percent = int((offset / total_length) * 100)
                self.update_state(
                    state="PROGRESS",
                    meta={
                        **task_meta,
                        "step": "Extracting terms",
                        "progress_percent": progress_percent,
                        "chunk_num": chunk_num + 1,
                        "total_chunks": total_chunks,
                        "total_terms": len(existing_terms) + total_added,
                    },
                )

                # Extract terms from this chunk using fast method
                new_terms_data = await term_extraction.extract_terms_fast(
                    chunk_text, db, existing_terms, episode.title
                )

                # Add new terms to database
                for term_data in new_terms_data:
                    # Check if term already exists for this podcast (case-insensitive)
                    existing_check = await db.execute(
                        select(Term)
                        .join(Episode)
                        .where(
                            Episode.podcast_id == episode.podcast_id,
                            Term.term.ilike(term_data["term"]),
                        )
                    )
                    if not existing_check.scalar_one_or_none():
                        # Filter to only valid Term fields as extra safety
                        valid_fields = {"term", "context", "explanation"}
                        filtered_data = {k: v for k, v in term_data.items() if k in valid_fields}

                        # Generate embedding for term
                        term_embedding = await transcription.generate_embedding(
                            filtered_data["term"]
                        )
                        term = Term(
                            episode_id=episode_uuid, embedding=term_embedding, **filtered_data
                        )
                        db.add(term)
                        existing_terms.append(filtered_data["term"])
                        total_added += 1

                await db.commit()

            # Final state
            self.update_state(
                state="SUCCESS",
                meta={
                    **task_meta,
                    "step": "Complete",
                    "progress_percent": 100,
                    "total_terms": len(existing_terms),
                    "added_this_run": total_added,
                },
            )

            return {"total_terms": len(existing_terms), "added_this_run": total_added}

    # Use asyncio.run() which properly manages event loop lifecycle
    try:
        result = asyncio.run(process())
        # Update task history as successful
        asyncio.run(update_task_history(self.request.id, "SUCCESS", completed=True))
        return result
    except Exception as e:
        # Update task history as failed
        asyncio.run(update_task_history(self.request.id, "FAILURE", str(e), completed=True))
        raise
    finally:
        # Clean up file handler
        import logging
        root_logger = logging.getLogger()
        root_logger.removeHandler(file_handler)
        file_handler.close()


@celery_app.task(bind=True, name="export_data")
def export_data_task(self, include_audio: bool = False):
    """
    Export database and optionally audio files.
    Uses pg_dump for complete database backup, optionally ZIPs with uploads folder.

    Args:
        include_audio: Whether to include audio files in the export
    """
    import os
    import shutil
    import subprocess
    import tempfile
    import zipfile
    from datetime import datetime
    from pathlib import Path
    from urllib.parse import urlparse

    # Setup file logging for this task
    from app.core.logging_config import setup_task_file_logging
    file_handler = setup_task_file_logging(self.request.id)

    def create_notification_sync(task_id: str, title: str, message: str, level: str = "info"):
        """Create a notification synchronously using sync database connection"""
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        from app.core.config import settings

        # Create sync engine from async URL
        sync_db_url = settings.database_url.replace("postgresql+asyncpg://", "postgresql://")
        engine = create_engine(sync_db_url, pool_pre_ping=True)
        SessionLocal = sessionmaker(bind=engine)

        with SessionLocal() as db:
            notification = Notification(
                type="export_complete" if level == "success" else "export_failed",
                title=title,
                message=message,
                level=level,
                task_id=task_id,
            )
            db.add(notification)
            db.commit()

    def export():
        # Create exports directory if it doesn't exist
        exports_dir = Path("echolens_data/exports")
        exports_dir.mkdir(parents=True, exist_ok=True)

        # Create temp directory for work in progress
        temp_dir = tempfile.mkdtemp()

        try:
            # Update progress
            self.update_state(
                state="PROGRESS", meta={"step": "Starting database export", "progress": 10}
            )

            # Parse database URL to get connection parameters
            db_url = settings.database_url
            db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")
            parsed = urlparse(db_url)

            # Generate filename with timestamp
            timestamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
            sql_filename = f"echolens-export-{timestamp}.sql"

            # Create SQL in temp directory first
            temp_sql_path = Path(temp_dir) / sql_filename

            # Run pg_dump
            self.update_state(
                state="PROGRESS", meta={"step": "Creating database dump", "progress": 30}
            )

            env = os.environ.copy()
            if parsed.password:
                env["PGPASSWORD"] = parsed.password

            cmd = [
                "pg_dump",
                "-h",
                parsed.hostname or "postgres",
                "-p",
                str(parsed.port or 5432),
                "-U",
                parsed.username,
                "-d",
                parsed.path.lstrip("/"),
                "-F",
                "p",  # Plain text format
                "-f",
                str(temp_sql_path),
            ]

            result = subprocess.run(
                cmd,
                check=False,
                env=env,
                capture_output=True,
                text=True,
                timeout=300,  # 5 minutes timeout
            )

            if result.returncode != 0:
                raise Exception(f"pg_dump failed: {result.stderr}")

            # If audio files not included, move SQL to exports
            if not include_audio:
                self.update_state(
                    state="PROGRESS", meta={"step": "Finalizing export", "progress": 90}
                )

                final_sql_path = exports_dir / sql_filename
                shutil.move(str(temp_sql_path), str(final_sql_path))

                self.update_state(
                    state="PROGRESS", meta={"step": "Export complete", "progress": 100}
                )

                create_notification_sync(
                    task_id=self.request.id,
                    title="Export Complete",
                    message="Database export completed successfully",
                    level="success",
                )

                return {
                    "filename": sql_filename,
                    "type": "sql",
                    "size": final_sql_path.stat().st_size,
                }

            # Create ZIP file with SQL + uploads folder
            self.update_state(
                state="PROGRESS", meta={"step": "Creating ZIP with files", "progress": 60}
            )

            zip_filename = f"echolens-export-{timestamp}.zip"
            temp_zip_path = Path(temp_dir) / zip_filename

            uploads_dir = Path("echolens_data/uploads")

            # Use ZIP_DEFLATED for best compression, compresslevel=6 for balanced speed/size
            with zipfile.ZipFile(
                temp_zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6
            ) as zipf:
                # Add database dump with compression (text compresses well)
                self.update_state(
                    state="PROGRESS", meta={"step": "Adding database to ZIP", "progress": 65}
                )
                zipf.write(temp_sql_path, "database.sql")

                # Add entire uploads directory (excluding chunk files)
                if uploads_dir.exists():
                    # Count total files first, excluding chunks directory
                    all_files = [
                        f for f in uploads_dir.rglob("*") if f.is_file() and "chunks" not in f.parts
                    ]
                    total_files = len(all_files)

                    self.update_state(
                        state="PROGRESS",
                        meta={"step": f"Adding audio files (0/{total_files})", "progress": 70},
                    )

                    for idx, file_path in enumerate(all_files, 1):
                        arcname = str(file_path.relative_to(uploads_dir.parent))

                        # Audio files are already compressed (MP3/M4A) - store without compression
                        # This is MUCH faster and saves CPU with minimal size difference
                        file_ext = file_path.suffix.lower()
                        if file_ext in [".mp3", ".m4a", ".mp4", ".aac", ".ogg", ".wav"]:
                            zipf.write(file_path, arcname, compress_type=zipfile.ZIP_STORED)
                        else:
                            # Compress other files (images, text, etc.)
                            zipf.write(file_path, arcname)

                        # Update progress every 10 files or on last file
                        if idx % 10 == 0 or idx == total_files:
                            # Progress from 70% to 90% based on files processed
                            progress = 70 + int((idx / total_files) * 20)
                            self.update_state(
                                state="PROGRESS",
                                meta={
                                    "step": f"Adding audio files ({idx}/{total_files})",
                                    "progress": progress,
                                },
                            )

            # Move ZIP to exports directory only when complete
            self.update_state(state="PROGRESS", meta={"step": "Finalizing export", "progress": 95})
            final_zip_path = exports_dir / zip_filename
            shutil.move(str(temp_zip_path), str(final_zip_path))

            self.update_state(state="PROGRESS", meta={"step": "Export complete", "progress": 100})

            create_notification_sync(
                task_id=self.request.id,
                title="Export Complete",
                message="Database and files export completed successfully",
                level="success",
            )

            return {"filename": zip_filename, "type": "zip", "size": final_zip_path.stat().st_size}

        finally:
            # Clean up temp directory
            shutil.rmtree(temp_dir, ignore_errors=True)

    # Run the export
    try:
        result = export()
        return result
    except Exception as e:
        # Create error notification
        create_notification_sync(
            task_id=self.request.id, title="Export Failed", message=str(e), level="error"
        )
        raise
    finally:
        # Clean up file handler
        import logging
        root_logger = logging.getLogger()
        root_logger.removeHandler(file_handler)
        file_handler.close()
