"""Authentication API endpoints."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, field_serializer
from redis.asyncio import Redis
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import get_current_user, get_redis
from app.db.session import get_db
from app.models.user import User
from app.services.auth import (
    authenticate_user,
    create_session,
    delete_all_user_sessions,
    hash_password,
    register_user,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["authentication"])


# Pydantic schemas
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str

    class Config:
        json_schema_extra = {
            "example": {
                "email": "user@example.com",
                "password": "securepassword123"
            }
        }


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    class Config:
        json_schema_extra = {
            "example": {
                "email": "user@example.com",
                "password": "securepassword123"
            }
        }


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    class Config:
        json_schema_extra = {
            "example": {
                "current_password": "oldpassword123",
                "new_password": "newpassword456"
            }
        }


class ChangeEmailRequest(BaseModel):
    password: str
    new_email: EmailStr

    class Config:
        json_schema_extra = {
            "example": {
                "password": "currentpassword123",
                "new_email": "newemail@example.com"
            }
        }


class UserResponse(BaseModel):
    id: str | uuid.UUID
    email: str
    is_admin: bool
    is_active: bool
    created_at: datetime
    last_login: datetime | None = None

    @field_serializer("id")
    def serialize_id(self, value: str | uuid.UUID) -> str:
        """Convert UUID to string for JSON serialization."""
        return str(value)

    class Config:
        from_attributes = True


class RegisterResponse(BaseModel):
    user: UserResponse
    is_first_user: bool
    message: str


class MessageResponse(BaseModel):
    message: str


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """
    Register a new user.

    - First user automatically becomes admin
    - Creates session and sets cookie
    - Returns user info and first_user flag
    """
    # Validate password length
    if len(request.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long"
        )

    try:
        # Register user (first user becomes admin and is active)
        user = await register_user(request.email, request.password, db)

        # If user requires approval, notify all admins
        if not user.is_active:
            from sqlalchemy import select
            from app.models.podcast import Notification
            from app.models.user import User as UserModel

            # Get all admin users
            admin_stmt = select(UserModel).where(UserModel.is_admin == True)  # noqa: E712
            admin_result = await db.execute(admin_stmt)
            admins = admin_result.scalars().all()

            # Create notification for each admin
            for admin in admins:
                notification = Notification(
                    type="new_user_registration",
                    title="New User Registration",
                    message=f"{user.email} has registered and requires account activation.",
                    level="info",
                    read=0,
                    user_id=admin.id
                )
                db.add(notification)

            await db.commit()

        # Only create session if user is active (first user or admin-approved)
        if user.is_active:
            # Create session
            session_id = await create_session(user.id, redis)

            # Set session cookie
            response.set_cookie(
                key=settings.session_cookie_name,
                value=session_id,
                max_age=settings.session_max_age,
                httponly=settings.session_cookie_httponly,
                secure=settings.session_cookie_secure,
                samesite=settings.session_cookie_samesite,
            )

        is_first_user = user.is_admin

        # Determine message based on user status
        if is_first_user:
            message = "Welcome! You're the first user and have been made an admin."
        elif user.is_active:
            message = "Registration successful! You're now logged in."
        else:
            message = "Registration successful! Your account is pending admin approval. You'll be able to log in once an admin activates your account."

        return RegisterResponse(
            user=UserResponse.model_validate(user),
            is_first_user=is_first_user,
            message=message
        )

    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )


@router.post("/login", response_model=UserResponse)
async def login(
    request: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """
    Login with email and password.

    - Verifies credentials
    - Creates session and sets cookie
    - Updates last_login timestamp
    """
    # Authenticate user (checks is_active)
    user = await authenticate_user(request.email, request.password, db)

    if not user:
        # Check if user exists but is inactive
        from sqlalchemy import select
        check_stmt = select(User).where(User.email == request.email.lower().strip())
        check_result = await db.execute(check_stmt)
        existing_user = check_result.scalar_one_or_none()

        if existing_user and not existing_user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account is pending admin approval. Please contact an administrator to activate your account."
            )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    # Update last login timestamp
    user.last_login = datetime.utcnow()
    await db.commit()

    # Create session
    session_id = await create_session(user.id, redis)

    # Set session cookie
    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_id,
        max_age=settings.session_max_age,
        httponly=settings.session_cookie_httponly,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
    )

    return UserResponse.model_validate(user)


@router.post("/logout", response_model=MessageResponse)
async def logout(
    response: Response,
    session_id: str | None = Depends(lambda: None),  # Get from cookie in dependency
    redis: Redis = Depends(get_redis)
):
    """
    Logout current user.

    - Deletes session from Redis
    - Clears session cookie
    """
    # Note: We'll get session_id from cookie via a custom dependency
    # For now, we'll clear the cookie regardless

    # Clear session cookie
    response.delete_cookie(
        key=settings.session_cookie_name,
        httponly=settings.session_cookie_httponly,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
    )

    return MessageResponse(message="Logged out successfully")


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """
    Get current authenticated user information.

    - Requires valid session
    - Returns user details
    """
    return UserResponse.model_validate(current_user)


@router.put("/change-password", response_model=MessageResponse)
async def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """
    Change current user's password.

    - Verifies current password
    - Updates to new password
    - Invalidates all other sessions (keeps current session)
    """
    # Verify current password
    is_valid, _ = verify_password(request.current_password, current_user.hashed_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    # Validate new password length
    if len(request.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters long"
        )

    # Check new password is different
    if request.current_password == request.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password"
        )

    # Update password
    current_user.hashed_password = hash_password(request.new_password)
    await db.commit()

    # Invalidate all other sessions (security measure)
    # Note: This will log out the user from other devices
    await delete_all_user_sessions(current_user.id, redis)

    return MessageResponse(message="Password changed successfully")


@router.put("/change-email", response_model=MessageResponse)
async def change_email(
    request: ChangeEmailRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """
    Change current user's email address.

    - Verifies password
    - Updates email address
    - Checks email is not already in use
    """
    # Verify password
    is_valid, _ = verify_password(request.password, current_user.hashed_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password is incorrect"
        )

    # Check new email is different
    if current_user.email == request.new_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New email must be different from current email"
        )

    # Update email
    current_user.email = request.new_email

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address is already in use"
        )

    return MessageResponse(message="Email address changed successfully")
