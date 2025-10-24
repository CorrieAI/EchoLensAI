import os
from pathlib import Path

import structlog

from app.core.config import settings
from app.services.openai_client import get_embedding_client, get_transcription_client

logger = structlog.get_logger(__name__)

# OpenAI Whisper API has a 25MB file size limit
MAX_FILE_SIZE_MB = 25
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024


async def transcribe_audio(audio_path: str, progress_callback=None) -> str:
    """
    Transcribe audio file. If file is larger than 25MB, split into chunks.

    Args:
        audio_path: Path to audio file
        progress_callback: Optional callback function(current, total, message) for progress updates
    """
    file_size = os.path.getsize(audio_path)

    # If file is under limit, transcribe directly
    if file_size < MAX_FILE_SIZE_BYTES:
        transcription_client = get_transcription_client()
        with open(audio_path, "rb") as audio_file:
            transcript = await transcription_client.audio.transcriptions.create(
                model=settings.transcription_model, file=audio_file, response_format="text"
            )
        return transcript

    # File is too large, need to chunk it
    return await transcribe_large_audio(audio_path, progress_callback)


async def transcribe_large_audio(audio_path: str, progress_callback=None) -> str:
    """
    Split large audio file into chunks and transcribe each chunk using ffmpeg directly.
    Chunks are saved in episode_dir/chunks/
    Transcribes chunks in parallel for speed.
    """
    import asyncio
    import subprocess

    chunks_dir = Path(audio_path).parent / "chunks"
    chunks_dir.mkdir(exist_ok=True)

    # Get audio duration using ffprobe
    probe_cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        audio_path,
    ]
    duration_sec = float(subprocess.check_output(probe_cmd).decode().strip())

    # Calculate safe chunk duration based on file bitrate
    MAX_CHUNK_SIZE = 25 * 1024 * 1024  # 25MB - safe margin under 26.2MB API limit
    file_size = os.path.getsize(audio_path)

    logger.info(
        "large_audio_file_info",
        audio_path=audio_path,
        size_mb=file_size / (1024 * 1024),
        duration_sec=duration_sec
    )

    # Calculate average bitrate (bytes per second)
    avg_bitrate = file_size / duration_sec

    # Calculate chunk duration that will give us ~20MB chunks (with safety margin)
    target_chunk_size = 20 * 1024 * 1024  # Target 20MB to stay well under 25MB limit
    chunk_duration_sec = int(target_chunk_size / avg_bitrate)

    # Ensure reasonable bounds (between 5 and 20 minutes)
    chunk_duration_sec = max(5 * 60, min(chunk_duration_sec, 20 * 60))

    logger.info(
        "chunk_duration_calculated",
        chunk_duration_sec=chunk_duration_sec,
        chunk_duration_min=chunk_duration_sec / 60,
        avg_bitrate_bytes_per_sec=avg_bitrate
    )

    # Split using ffmpeg directly (much faster than pydub)
    chunk_paths = []
    chunk_index = 0
    current_time = 0

    while current_time < duration_sec:
        chunk_path = chunks_dir / f"chunk_{chunk_index:03d}.mp3"

        # Calculate duration for this chunk (last chunk may be shorter)
        remaining_duration = duration_sec - current_time
        actual_chunk_duration = min(chunk_duration_sec, remaining_duration)

        # Create or validate chunk
        needs_recreation = False
        if chunk_path.exists():
            # Check if existing chunk is too large
            chunk_size = os.path.getsize(chunk_path)
            chunk_size_mb = chunk_size / (1024 * 1024)
            logger.info(
                "chunk_exists",
                chunk_index=chunk_index,
                chunk_size_mb=chunk_size_mb,
                max_size_mb=MAX_CHUNK_SIZE / (1024 * 1024)
            )
            if chunk_size > MAX_CHUNK_SIZE:
                logger.warning(
                    "chunk_too_large_recreating",
                    chunk_index=chunk_index,
                    chunk_size_mb=chunk_size_mb
                )
                chunk_path.unlink()
                needs_recreation = True
            else:
                logger.info("chunk_size_ok_reusing", chunk_index=chunk_index)
        else:
            logger.info("chunk_not_exists_creating", chunk_index=chunk_index)
            needs_recreation = True

        if needs_recreation:
            # Try creating chunk with current duration
            attempt_duration = actual_chunk_duration
            max_attempts = 5

            for attempt in range(max_attempts):
                split_cmd = [
                    "ffmpeg",
                    "-i",
                    audio_path,
                    "-ss",
                    str(current_time),
                    "-t",
                    str(attempt_duration),
                    "-acodec",
                    "libmp3lame",
                    "-y",  # Overwrite
                    str(chunk_path),
                ]
                subprocess.run(
                    split_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True
                )

                # Check size
                chunk_size = os.path.getsize(chunk_path)
                chunk_size_mb = chunk_size / (1024 * 1024)
                logger.info(
                    "chunk_creation_attempt",
                    chunk_index=chunk_index,
                    attempt=attempt + 1,
                    duration_sec=attempt_duration,
                    size_mb=chunk_size_mb
                )

                if chunk_size <= MAX_CHUNK_SIZE:
                    # Success!
                    logger.info("chunk_created_successfully", chunk_index=chunk_index, size_mb=chunk_size_mb)
                    actual_chunk_duration = attempt_duration
                    break

                # Too large, delete and try with shorter duration
                logger.warning(
                    "chunk_too_large_retry",
                    chunk_index=chunk_index,
                    size_mb=chunk_size_mb
                )
                chunk_path.unlink()
                attempt_duration = int(attempt_duration * 0.7)

                if attempt == max_attempts - 1:
                    raise ValueError(
                        f"Cannot create chunk under {MAX_CHUNK_SIZE} bytes. File bitrate too high."
                    )

        chunk_paths.append(chunk_path)
        current_time += actual_chunk_duration
        chunk_index += 1

    total_chunks = len(chunk_paths)

    # Transcribe chunks in parallel (limit to 5 concurrent requests)
    async def transcribe_chunk(chunk_index: int, chunk_path: Path) -> tuple[int, str]:
        """Transcribe a single chunk and return (index, text)"""

        logger.info("chunk_transcription_started", chunk_num=chunk_index + 1, total_chunks=total_chunks)

        if progress_callback:
            progress_callback(
                chunk_index + 1,
                total_chunks,
                f"Transcribing chunk {chunk_index + 1}/{total_chunks}",
            )

        transcription_client = get_transcription_client()
        with open(chunk_path, "rb") as audio_file:
            transcript = await transcription_client.audio.transcriptions.create(
                model=settings.transcription_model, file=audio_file, response_format="text"
            )

        logger.info(f"Completed transcription of chunk {chunk_index + 1}/{total_chunks}")
        return (chunk_index, transcript)

    # Process chunks in parallel with semaphore to limit concurrency
    semaphore = asyncio.Semaphore(5)  # Max 5 concurrent transcriptions

    async def transcribe_with_limit(idx: int, path: Path):
        async with semaphore:
            return await transcribe_chunk(idx, path)

    # Start all transcription tasks
    tasks = [transcribe_with_limit(i, chunk_path) for i, chunk_path in enumerate(chunk_paths)]

    # Wait for all to complete
    results = await asyncio.gather(*tasks)

    # Sort by index and combine transcripts
    results.sort(key=lambda x: x[0])
    transcripts = [text for _, text in results]

    # Clean up chunks after transcription (unless configured to keep them)
    if not settings.keep_audio_chunks:
        import shutil
        try:
            logger.info("cleaning_up_audio_chunks", chunks_dir=str(chunks_dir), num_chunks=len(chunk_paths))
            shutil.rmtree(chunks_dir)
            logger.info("audio_chunks_cleaned_up", chunks_dir=str(chunks_dir))
        except Exception as e:
            logger.warning("failed_to_clean_up_chunks", chunks_dir=str(chunks_dir), error=str(e))

    return " ".join(transcripts)


async def generate_embedding(text: str) -> list[float]:
    if not text or not text.strip():
        raise ValueError("Cannot generate embedding for empty text")

    embedding_client = get_embedding_client()
    response = await embedding_client.embeddings.create(
        model=settings.embedding_model, input=text.strip()
    )
    return response.data[0].embedding
