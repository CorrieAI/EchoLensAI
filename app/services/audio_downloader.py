import re
from pathlib import Path

import httpx

from app.exceptions import ValidationError
from app.services.validators import validate_external_url


async def download_audio(
    url: str, save_dir: str, podcast_title: str = None, episode_id: str = None
) -> str:
    """
    Download audio file to structured directory with deduplication.

    Structure: uploads/{podcast_slug}/{episode_id}/audio.{ext}

    Files are organized by episode_id:
    - Multiple users adding same podcast/episode share the same audio files
    - Saves storage space and download bandwidth
    - All episode files (audio, summary, etc.) live in same directory
    """
    # Validate URL to prevent SSRF attacks
    try:
        validate_external_url(url)
    except ValidationError as e:
        raise ValidationError(f"Invalid audio URL: {e!s}")

    # Create episode directory: uploads/{podcast_slug}/{episode_id}/
    if podcast_title and episode_id:
        podcast_slug = _slugify(podcast_title)
        episode_dir = Path(save_dir) / podcast_slug / episode_id
    else:
        # Fallback to root uploads dir
        episode_dir = Path(save_dir)

    episode_dir.mkdir(parents=True, exist_ok=True)

    # Use simple filename since directory structure handles uniqueness
    extension = _extract_extension(url)
    filename = f"audio{extension}"
    filepath = episode_dir / filename

    # If file already exists, return path (deduplication in action!)
    if filepath.exists():
        return str(filepath)

    # Download the file
    async with httpx.AsyncClient(timeout=300.0, follow_redirects=True) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()

            with open(filepath, "wb") as f:
                async for chunk in response.aiter_bytes(chunk_size=8192):
                    f.write(chunk)

    return str(filepath)


def _slugify(text: str) -> str:
    """Convert text to lowercase slug suitable for directory names."""
    # Convert to lowercase
    text = text.lower()
    # Replace spaces and special characters with underscores
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "_", text)
    # Trim and limit length
    text = text.strip("_")[:100]
    return text or "unknown"


def _extract_extension(url: str) -> str:
    path = url.split("?")[0]
    if "." in path:
        ext = path.rsplit(".", 1)[-1].lower()
        if ext in ["mp3", "m4a", "wav", "ogg"]:
            return f".{ext}"
    return ".mp3"
