"""Authentication service for password hashing and session management."""

import secrets
import uuid

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User

# Session configuration
SESSION_TTL = 60 * 60 * 24 * 7  # 7 days in seconds
SESSION_PREFIX = "session:"

# Password hasher instance
ph = PasswordHasher()


def hash_password(password: str) -> str:
    """
    Hash password using Argon2id algorithm.

    Args:
        password: Plain text password

    Returns:
        Hashed password string
    """
    return ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> tuple[bool, str | None]:
    """
    Verify password against hash and check if rehashing is needed.

    Args:
        plain_password: Plain text password to verify
        hashed_password: Stored hashed password

    Returns:
        Tuple of (is_valid, new_hash)
        - is_valid: True if password matches
        - new_hash: New hash if rehashing needed, None otherwise
    """
    try:
        ph.verify(hashed_password, plain_password)

        # Check if rehashing is needed (Argon2 parameter update)
        if ph.check_needs_rehash(hashed_password):
            return True, hash_password(plain_password)

        return True, None
    except VerifyMismatchError:
        return False, None


async def create_session(user_id: uuid.UUID, redis: Redis) -> str:
    """
    Create a new session in Redis.

    Args:
        user_id: User's UUID
        redis: Redis connection

    Returns:
        Session ID (random token)
    """
    session_id = secrets.token_urlsafe(32)
    session_key = f"{SESSION_PREFIX}{session_id}"

    # Store user_id as session value with TTL
    await redis.setex(session_key, SESSION_TTL, str(user_id))

    return session_id


async def get_session_user_id(session_id: str, redis: Redis) -> uuid.UUID | None:
    """
    Get user ID from session ID.

    Args:
        session_id: Session ID token
        redis: Redis connection

    Returns:
        User UUID if session is valid, None otherwise
    """
    session_key = f"{SESSION_PREFIX}{session_id}"
    user_id_str = await redis.get(session_key)

    if user_id_str:
        # Refresh TTL on access
        await redis.expire(session_key, SESSION_TTL)
        return uuid.UUID(user_id_str.decode() if isinstance(user_id_str, bytes) else user_id_str)

    return None


async def delete_session(session_id: str, redis: Redis) -> None:
    """
    Delete a session (logout).

    Args:
        session_id: Session ID token
        redis: Redis connection
    """
    session_key = f"{SESSION_PREFIX}{session_id}"
    await redis.delete(session_key)


async def delete_all_user_sessions(user_id: uuid.UUID, redis: Redis) -> None:
    """
    Delete all sessions for a user.

    Args:
        user_id: User's UUID
        redis: Redis connection
    """
    # Scan for all session keys
    pattern = f"{SESSION_PREFIX}*"
    cursor = 0

    while True:
        cursor, keys = await redis.scan(cursor, match=pattern, count=100)

        for key in keys:
            stored_user_id = await redis.get(key)
            if stored_user_id:
                stored_uuid = uuid.UUID(
                    stored_user_id.decode() if isinstance(stored_user_id, bytes) else stored_user_id
                )
                if stored_uuid == user_id:
                    await redis.delete(key)

        if cursor == 0:
            break


async def register_user(email: str, password: str, db: AsyncSession) -> User:
    """
    Create a new user. First user becomes admin and is active.
    Subsequent users may require admin approval based on system settings.

    Args:
        email: User's email address
        password: Plain text password
        db: Database session

    Returns:
        Created User instance
    """
    # Check if this is the first user
    stmt = select(func.count(User.id))
    result = await db.execute(stmt)
    user_count = result.scalar()
    is_first_user = user_count == 0

    # Check if user approval is required (for non-first users)
    require_approval = True  # Default to requiring approval
    if not is_first_user:
        from app.models.settings import AppSetting
        setting_stmt = select(AppSetting).where(AppSetting.key == "require_user_approval")
        setting_result = await db.execute(setting_stmt)
        setting = setting_result.scalar_one_or_none()
        if setting:
            require_approval = setting.value == "true"

    # Create user
    # First user: admin + active
    # Subsequent users: active status depends on require_approval setting
    user = User(
        email=email.lower().strip(),
        hashed_password=hash_password(password),
        is_admin=is_first_user,
        is_active=is_first_user or not require_approval
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    return user


async def authenticate_user(email: str, password: str, db: AsyncSession) -> User | None:
    """
    Verify user credentials.

    Args:
        email: User's email address
        password: Plain text password
        db: Database session

    Returns:
        User instance if credentials are valid, None otherwise
    """
    stmt = select(User).where(
        User.email == email.lower().strip(),
        User.is_active == True  # noqa: E712
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        return None

    # Verify password
    is_valid, new_hash = verify_password(password, user.hashed_password)
    if not is_valid:
        return None

    # Rehash if needed (Argon2 parameter update)
    if new_hash:
        user.hashed_password = new_hash
        await db.commit()

    return user
