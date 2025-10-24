"""
Centralized OpenAI client management for EchoLens.
Provides factory functions for all OpenAI API clients to avoid duplication.
"""

from openai import AsyncOpenAI

from app.core.config import settings

# Chat client (used for chat, term extraction, summarization)
_chat_client = None


def get_chat_client() -> AsyncOpenAI:
    """Get or create the chat OpenAI client"""
    global _chat_client
    if _chat_client is None:
        client_kwargs = {"api_key": settings.chat_api_key}
        if settings.chat_api_base:
            client_kwargs["base_url"] = settings.chat_api_base
        _chat_client = AsyncOpenAI(**client_kwargs)
    return _chat_client


# Transcription client
_transcription_client = None


def get_transcription_client() -> AsyncOpenAI:
    """Get or create the transcription OpenAI client"""
    global _transcription_client
    if _transcription_client is None:
        client_kwargs = {"api_key": settings.transcription_api_key}
        if settings.transcription_api_base:
            client_kwargs["base_url"] = settings.transcription_api_base
        _transcription_client = AsyncOpenAI(**client_kwargs)
    return _transcription_client


# Embedding client
_embedding_client = None


def get_embedding_client() -> AsyncOpenAI:
    """Get or create the embedding OpenAI client"""
    global _embedding_client
    if _embedding_client is None:
        client_kwargs = {"api_key": settings.embedding_api_key}
        if settings.embedding_api_base:
            client_kwargs["base_url"] = settings.embedding_api_base
        _embedding_client = AsyncOpenAI(**client_kwargs)
    return _embedding_client


# TTS client (optional)
_tts_client = None


def get_tts_client() -> AsyncOpenAI | None:
    """
    Get or create the TTS OpenAI client.
    Returns None if TTS is disabled in settings.
    """
    global _tts_client

    if not settings.tts_enabled or not settings.tts_api_key:
        return None

    if _tts_client is None:
        client_kwargs = {"api_key": settings.tts_api_key}
        if settings.tts_api_base:
            client_kwargs["base_url"] = settings.tts_api_base
        _tts_client = AsyncOpenAI(**client_kwargs)

    return _tts_client
