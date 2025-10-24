from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.podcast import Chat, ChatMessage, Episode
from app.services.openai_client import get_chat_client
from app.services.prompt_loader import render_prompt
from app.services.vector_store import search_vectors


async def _fetch_episode_titles_for_context(
    db: AsyncSession, context_slices: list[dict]
) -> dict[UUID, str]:
    """Fetch episode titles for a list of context slices"""
    episode_titles = {}
    for s in context_slices:
        ep_id = s["episode_id"]
        if ep_id not in episode_titles:
            result = await db.execute(select(Episode).where(Episode.id == ep_id))
            ep = result.scalar_one_or_none()
            if ep:
                episode_titles[ep_id] = ep.title
            else:
                episode_titles[ep_id] = str(ep_id)  # Fallback to ID if title not found
    return episode_titles


async def _build_context_and_messages(
    query: str,
    db: AsyncSession,
    episode_id: UUID | None,
    podcast_id: UUID | None,
    conversation_history: list[dict] | None,
) -> tuple[list[dict], str, str, list[dict]]:
    """
    Build context slices, context text, system message, and message array.

    Returns:
        tuple of (context_slices, context_text, scope, messages)
    """
    # Get relevant context from vector search
    context_slices = await search_vectors(
        query=query,
        db=db,
        episode_id=episode_id,
        podcast_id=podcast_id,
        limit=5,
        similarity_threshold=2.0,  # Accept all results for chat context
    )

    # Fetch episode titles for context slices
    episode_titles = await _fetch_episode_titles_for_context(db, context_slices)

    # Build context string with episode titles
    context_text = "\n\n".join(
        [
            f"[{episode_titles.get(s['episode_id'], s['episode_id'])}, Chunk {s['chunk_index']}]: {s['text']}"
            for s in context_slices
        ]
    )

    # Determine scope
    scope = "this episode" if episode_id else "this podcast" if podcast_id else "all your podcasts"

    # Build system message
    system_message = await render_prompt(db, "chat.system_message", scope=scope, context_text=context_text)

    # Build messages
    messages = [{"role": "system", "content": system_message}]
    if conversation_history:
        messages.extend(conversation_history)
    messages.append({"role": "user", "content": query})

    return context_slices, context_text, scope, messages


async def get_or_create_chat(db: AsyncSession, episode_id: UUID, user_id: UUID) -> Chat:
    """Get existing chat or create new one for an episode - one chat per episode per user"""
    # Check if chat exists for this user and episode
    result = await db.execute(
        select(Chat).where(
            Chat.episode_id == episode_id,
            Chat.user_id == user_id
        )
    )
    chat = result.scalar_one_or_none()

    if not chat:
        # Create new chat for this user and episode
        chat = Chat(episode_id=episode_id, user_id=user_id)
        db.add(chat)
        await db.commit()
        await db.refresh(chat)

    return chat


async def save_chat_message(
    db: AsyncSession, chat_id: UUID, role: str, content: str
) -> ChatMessage:
    """Save a chat message to the database"""
    message = ChatMessage(chat_id=chat_id, role=role, content=content)
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message


async def update_chat_title(db: AsyncSession, chat_id: UUID, title: str):
    """Update the chat title"""
    result = await db.execute(select(Chat).where(Chat.id == chat_id))
    chat = result.scalar_one_or_none()
    if chat:
        chat.title = title
        await db.commit()


async def get_chat_history(db: AsyncSession, episode_id: UUID, user_id: UUID) -> list[dict]:
    """Get chat history for an episode for a specific user"""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Chat).where(
            Chat.episode_id == episode_id,
            Chat.user_id == user_id
        ).options(selectinload(Chat.messages))
    )
    chat = result.scalar_one_or_none()

    if not chat:
        return []

    # Chat messages are already ordered by created_at via relationship
    return [{"role": msg.role, "content": msg.content} for msg in chat.messages]


async def chat_with_context(
    query: str,
    db: AsyncSession,
    episode_id: UUID | None = None,
    podcast_id: UUID | None = None,
    conversation_history: list[dict] | None = None,
) -> dict:
    """Chat with AI using podcast context from vector search - non-streaming"""

    # Build context and messages using shared helper
    context_slices, context_text, scope, messages = await _build_context_and_messages(
        query, db, episode_id, podcast_id, conversation_history
    )

    # Get response from OpenAI
    client = get_chat_client()
    response = await client.chat.completions.create(
        model=settings.chat_model,
        messages=messages,
        temperature=settings.chat_temperature,
        max_tokens=settings.chat_max_tokens,
    )

    answer = response.choices[0].message.content

    return {
        "answer": answer,
        "context_slices": context_slices,
        "scope": scope,
    }


async def chat_with_context_stream(
    query: str,
    db: AsyncSession,
    episode_id: UUID | None = None,
    podcast_id: UUID | None = None,
    conversation_history: list[dict] | None = None,
):
    """Chat with AI using podcast context from vector search - streaming

    Returns: tuple of (generator, chat_id, callback) where callback should be called
    with the full response text after streaming is complete
    """

    # Get or create chat for the episode
    chat = None
    chat_id = None
    if episode_id:
        chat = await get_or_create_chat(db, episode_id)
        chat_id = chat.id

        # Load chat history from database if not provided
        if not conversation_history:
            conversation_history = await get_chat_history(db, episode_id)

    # Build context and messages using shared helper
    context_slices, context_text, scope, messages = await _build_context_and_messages(
        query, db, episode_id, podcast_id, conversation_history
    )

    # Save user message
    if chat:
        await save_chat_message(db, chat.id, "user", query)

    # Get streaming response from OpenAI
    client = get_chat_client()
    stream = await client.chat.completions.create(
        model=settings.chat_model,
        messages=messages,
        temperature=settings.chat_temperature,
        max_tokens=settings.chat_max_tokens,
        stream=True,
    )

    # Yield context first
    yield {
        "type": "context",
        "context_slices": context_slices,
        "scope": scope,
        "chat_id": chat_id,
    }

    # Stream the response
    async for chunk in stream:
        if chunk.choices[0].delta.content:
            content = chunk.choices[0].delta.content
            yield {
                "type": "content",
                "content": content,
            }


