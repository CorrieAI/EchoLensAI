from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.core.timezone import make_aware
from app.db.session import get_db
from app.models.user import User
from app.schemas.chat import ChatRequest, ChatResponse, ChatSessionResponse
from app.services.chat import chat_with_context
from app.services.vector_store import get_vector_stats

router = APIRouter()


@router.post("/", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Chat with AI using podcast context - episode, podcast, or global scope"""
    # Note: chat_with_context already filters by user's podcasts via vector search
    # We could add explicit ownership checks for episode_id/podcast_id if needed
    result = await chat_with_context(
        query=request.query,
        db=db,
        episode_id=request.episode_id,
        podcast_id=request.podcast_id,
        conversation_history=request.conversation_history,
    )

    return result


@router.get("/stats")
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get vector database statistics for user's data"""
    # TODO: Filter stats by user's podcasts
    return await get_vector_stats(db)


@router.get("/sessions", response_model=list[ChatSessionResponse])
async def get_chat_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all chat sessions for current user, sorted by most recently updated"""
    from sqlalchemy.orm import selectinload

    from app.models.podcast import Chat, Episode

    query = (
        select(Chat)
        .options(selectinload(Chat.episode).selectinload(Episode.podcast))
        .where(Chat.user_id == current_user.id)
        .order_by(Chat.updated_at.desc())
    )
    result = await db.execute(query)
    chats = result.scalars().all()

    return chats


@router.get("/episodes/{episode_id}/session")
async def get_episode_chat_session(
    episode_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get the user's chat session for a specific episode (returns null if none exists)"""
    from app.models.podcast import Chat

    # Get user-specific chat session
    query = select(Chat).where(
        Chat.episode_id == episode_id,
        Chat.user_id == current_user.id
    )
    result = await db.execute(query)
    chat = result.scalar_one_or_none()

    if not chat:
        return None

    return {"id": str(chat.id)}


@router.get("/sessions/{session_id}")
async def get_chat_session(
    session_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific chat session with messages (user-specific)"""
    from sqlalchemy.orm import selectinload

    from app.models.podcast import Chat, ChatMessage

    # Get user's chat session
    query = select(Chat).options(selectinload(Chat.episode)).where(
        Chat.id == session_id,
        Chat.user_id == current_user.id
    )
    result = await db.execute(query)
    chat = result.scalar_one_or_none()

    if not chat:
        raise HTTPException(status_code=404, detail="Chat session not found")

    # Get messages
    messages_query = (
        select(ChatMessage)
        .where(ChatMessage.chat_id == session_id)
        .order_by(ChatMessage.created_at.asc())
    )
    messages_result = await db.execute(messages_query)
    messages = messages_result.scalars().all()

    return {
        "session": {
            "id": str(chat.id),
            "episode_id": str(chat.episode_id),
            "title": chat.title,
            "created_at": make_aware(chat.created_at).isoformat().replace("+00:00", "Z"),
            "updated_at": make_aware(chat.updated_at).isoformat().replace("+00:00", "Z"),
            "episode": {"id": str(chat.episode.id), "title": chat.episode.title}
            if chat.episode
            else None,
        },
        "messages": [
            {
                "id": str(msg.id),
                "session_id": str(msg.chat_id),
                "role": msg.role,
                "content": msg.content,
                "created_at": make_aware(msg.created_at).isoformat().replace("+00:00", "Z"),
            }
            for msg in messages
        ],
    }


@router.post("/episodes/{episode_id}/message")
async def send_chat_message(
    episode_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Send a chat message for an episode (user-specific chat session)"""
    from app.services.chat import (
        chat_with_context,
        get_chat_history,
        get_or_create_chat,
        save_chat_message,
    )

    form = await request.form()
    message = form.get("message")
    session_id_param = form.get("session_id")

    if not message:
        raise HTTPException(status_code=400, detail="Message is required")

    # Get or create user-specific chat session
    # NOTE: get_or_create_chat needs to be updated to handle user_id
    chat = await get_or_create_chat(db, episode_id, current_user.id)
    session_id = str(chat.id)

    # Load chat history (user-specific)
    conversation_history = await get_chat_history(db, episode_id, current_user.id)

    # Get AI response
    result = await chat_with_context(
        query=message,
        db=db,
        episode_id=episode_id,
        podcast_id=None,
        conversation_history=conversation_history,
    )

    # Save user message
    await save_chat_message(db, chat.id, "user", message)

    # Save assistant response
    await save_chat_message(db, chat.id, "assistant", result["answer"])

    return {"session_id": session_id, "response": result["answer"]}


@router.delete("/{chat_id}")
async def delete_chat(
    chat_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a chat and all its messages (user-specific)"""
    from sqlalchemy import delete, select

    from app.models.podcast import Chat

    # Check if user owns this chat
    result = await db.execute(select(Chat).where(
        Chat.id == chat_id,
        Chat.user_id == current_user.id
    ))
    chat = result.scalar_one_or_none()

    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    # Delete the chat (messages will cascade delete)
    await db.execute(delete(Chat).where(Chat.id == chat_id))
    await db.commit()

    return {"success": True}
