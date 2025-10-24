"""Security dependencies for FastAPI authentication."""


from fastapi import Cookie, Depends, HTTPException, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.user import User
from app.services.auth import get_session_user_id


async def get_redis() -> Redis:
    """
    Get Redis connection for session management.

    Returns:
        Redis connection instance
    """
    from app.core.config import settings

    redis = Redis.from_url(settings.redis_url, decode_responses=False)
    try:
        yield redis
    finally:
        await redis.close()


async def get_current_user(
    session_id_cookie: str | None = Cookie(None, alias="session_id"),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
) -> User:
    """
    Get current authenticated user from session cookie.

    Args:
        session_id_cookie: Session ID from cookie
        db: Database session
        redis: Redis connection

    Returns:
        Current User instance

    Raises:
        HTTPException: 401 if not authenticated or session invalid
    """
    if not session_id_cookie:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    user_id = await get_session_user_id(session_id_cookie, redis)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid"
        )

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )

    return user


async def get_current_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Get current user if they are an admin.

    Args:
        current_user: Current authenticated user

    Returns:
        Current User instance (admin)

    Raises:
        HTTPException: 403 if user is not an admin
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    return current_user


async def get_optional_user(
    session_id_cookie: str | None = Cookie(None, alias="session_id"),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
) -> User | None:
    """
    Get current user if authenticated, None otherwise.
    Useful for routes that work with or without authentication.

    Args:
        session_id_cookie: Session ID from cookie
        db: Database session
        redis: Redis connection

    Returns:
        User instance if authenticated, None otherwise
    """
    if not session_id_cookie:
        return None

    user_id = await get_session_user_id(session_id_cookie, redis)
    if not user_id:
        return None

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        return None

    return user
