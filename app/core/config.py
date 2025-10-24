import secrets
import tomllib
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def get_version() -> str:
    """Read version from pyproject.toml"""
    try:
        pyproject_path = Path(__file__).parent.parent.parent / "pyproject.toml"
        with open(pyproject_path, "rb") as f:
            data = tomllib.load(f)
            return data.get("project", {}).get("version", "unknown")
    except Exception:
        return "unknown"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str
    upload_dir: str = "./echolens_data/uploads"
    max_upload_size: int = 524288000
    timezone: str = "UTC"

    # CORS settings
    cors_origins: str = "http://localhost:3000"

    # Docker production passwords (not used by app, only by docker-compose.yaml)
    postgres_password: str | None = None
    redis_password: str | None = None

    # Debug/Development mode
    debug_mode: bool = True  # Set to False in production

    # Celery settings
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/0"

    # Chat API settings
    chat_api_key: str
    chat_api_base: str | None = None
    chat_model: str = "gpt-4o-mini"
    chat_streaming: bool = True
    chat_temperature: float = 0.7
    chat_max_tokens: int = 2000

    # Embedding API settings
    embedding_api_key: str
    embedding_api_base: str | None = None
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536  # OpenAI: 1536, nomic-embed-text: 768

    # Transcription API settings (Whisper)
    transcription_api_key: str
    transcription_api_base: str | None = None
    transcription_model: str = "whisper-1"
    keep_audio_chunks: bool = False  # Keep audio chunks after transcription (for debugging)

    # Text-to-Speech API settings
    tts_enabled: bool = True
    tts_api_key: str | None = None
    tts_api_base: str | None = None
    tts_model: str = "tts-1"
    tts_voice: str = "alloy"  # alloy, echo, fable, onyx, nova, shimmer

    # Session Management (Authentication)
    session_secret_key: str = secrets.token_urlsafe(32)  # Auto-generate if not set
    session_cookie_name: str = "session_id"
    session_max_age: int = 60 * 60 * 24 * 7  # 7 days in seconds
    session_cookie_secure: bool = False  # Set to True in production (HTTPS), False in dev (HTTP)
    session_cookie_httponly: bool = True
    session_cookie_samesite: str = "lax"  # lax, strict, or none

    # Redis URL (for sessions)
    redis_url: str = "redis://localhost:6379/0"

    # Frontend URL (for CORS)
    frontend_url: str = "http://localhost:3000"


settings = Settings()
