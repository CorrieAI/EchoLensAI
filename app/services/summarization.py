from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.openai_client import get_chat_client, get_tts_client
from app.services.prompt_loader import render_prompt


async def generate_summary(transcript: str, db: AsyncSession) -> str:
    """
    Generate summary using chunking strategy for long transcripts.
    Splits into chunks, summarizes each, then creates final summary.
    """
    # Rough estimate: 1 token ≈ 4 characters
    # Use conservative chunk size to leave room for prompts
    max_chunk_chars = 80000  # ~20k tokens per chunk

    # If transcript fits in one chunk, summarize directly
    if len(transcript) <= max_chunk_chars:
        return await _summarize_text(transcript, db, is_chunk=False)

    # Split into chunks for large transcripts
    chunks = []
    for i in range(0, len(transcript), max_chunk_chars):
        chunks.append(transcript[i : i + max_chunk_chars])

    # Summarize each chunk
    chunk_summaries = []
    for i, chunk in enumerate(chunks):
        chunk_summary = await _summarize_text(
            chunk, db, is_chunk=True, chunk_num=i + 1, total_chunks=len(chunks)
        )
        chunk_summaries.append(chunk_summary)

    # Combine chunk summaries into final summary
    combined = "\n\n".join(chunk_summaries)

    final_prompt = await render_prompt(db, "summarization.combine_chunks", combined=combined)

    chat_client = get_chat_client()
    response = await chat_client.chat.completions.create(
        model=settings.chat_model,
        messages=[{"role": "user", "content": final_prompt}],
        temperature=0.5,
    )

    return response.choices[0].message.content


async def _summarize_text(
    text: str, db: AsyncSession, is_chunk: bool = False, chunk_num: int = 1, total_chunks: int = 1
) -> str:
    """Helper function to summarize a piece of text"""
    if is_chunk:
        prompt = await render_prompt(
            db, "summarization.chunk", chunk_num=chunk_num, total_chunks=total_chunks, text=text
        )
    else:
        prompt = await render_prompt(db, "summarization.single_pass", text=text)

    chat_client = get_chat_client()
    response = await chat_client.chat.completions.create(
        model=settings.chat_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.5,
    )

    return response.choices[0].message.content


async def generate_summary_audio(summary_text: str, output_dir: str) -> str | None:
    """
    Generate audio summary and save to episode directory.
    Output dir should be the episode-specific directory.
    TTS API has 4096 character limit - truncate if needed.
    Returns None if TTS is disabled.
    """
    tts_client = get_tts_client()
    if not tts_client:
        return None

    Path(output_dir).mkdir(parents=True, exist_ok=True)

    filename = "summary.mp3"
    filepath = Path(output_dir) / filename

    if filepath.exists():
        return str(filepath)

    # TTS API has 4096 character limit
    max_tts_chars = 4096
    tts_text = summary_text[:max_tts_chars] if len(summary_text) > max_tts_chars else summary_text

    response = await tts_client.audio.speech.create(
        model=settings.tts_model, voice=settings.tts_voice, input=tts_text
    )

    response.stream_to_file(filepath)
    return str(filepath)
