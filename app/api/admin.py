"""Admin API endpoints for user management."""

import csv
import io
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, field_serializer
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_admin, get_redis
from app.db.session import get_db
from app.models.user import User
from app.services.auth import delete_all_user_sessions, hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"])


# Pydantic schemas
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


class UserListResponse(BaseModel):
    users: list[UserResponse]
    total: int


class UpdateUserRequest(BaseModel):
    is_admin: bool | None = None
    is_active: bool | None = None

    class Config:
        json_schema_extra = {
            "example": {
                "is_admin": True,
                "is_active": True
            }
        }


class ResetPasswordRequest(BaseModel):
    new_password: str

    class Config:
        json_schema_extra = {
            "example": {
                "new_password": "newpassword123"
            }
        }


class MessageResponse(BaseModel):
    message: str


@router.get("/users", response_model=UserListResponse)
async def list_users(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    List all users (admin only).

    - Paginated with skip/limit
    - Returns user list and total count
    """
    # Get total count
    count_stmt = select(User)
    result = await db.execute(count_stmt)
    total = len(result.scalars().all())

    # Get paginated users
    stmt = select(User).offset(skip).limit(limit).order_by(User.created_at.desc())
    result = await db.execute(stmt)
    users = result.scalars().all()

    return UserListResponse(
        users=[UserResponse.model_validate(user) for user in users],
        total=total
    )


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Get specific user by ID (admin only).

    - Returns full user details
    """
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return UserResponse.model_validate(user)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    request: UpdateUserRequest,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Update user (admin only).

    - Can update is_admin and is_active status
    - Cannot demote the last admin
    """
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Prevent demoting the last admin
    if request.is_admin is False and user.is_admin:
        stmt = select(User).where(User.is_admin == True)  # noqa: E712
        result = await db.execute(stmt)
        admin_count = len(result.scalars().all())

        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote the last admin user"
            )

    # Track if user was activated (for notification)
    was_activated = False
    if request.is_active is not None and request.is_active and not user.is_active:
        was_activated = True

    # Update fields
    if request.is_admin is not None:
        user.is_admin = request.is_admin

    if request.is_active is not None:
        user.is_active = request.is_active

    await db.commit()
    await db.refresh(user)

    # Notify user if they were just activated
    if was_activated:
        from app.models.podcast import Notification

        notification = Notification(
            type="account_activated",
            title="Account Activated",
            message="Your account has been activated by an administrator. You can now log in and use the system.",
            level="success",
            read=0,
            user_id=user.id
        )
        db.add(notification)
        await db.commit()

    return UserResponse.model_validate(user)


@router.delete("/users/{user_id}", response_model=MessageResponse)
async def delete_user(
    user_id: str,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """
    Delete user (admin only).

    - Cannot delete yourself
    - Cannot delete the last admin
    - Deletes all user sessions
    - Cascades to user's podcasts and data
    """
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Prevent self-deletion
    if str(user.id) == str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete yourself"
        )

    # Prevent deleting the last admin
    if user.is_admin:
        stmt = select(User).where(User.is_admin == True)  # noqa: E712
        result = await db.execute(stmt)
        admin_count = len(result.scalars().all())

        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last admin user"
            )

    # Delete all user sessions
    await delete_all_user_sessions(user.id, redis)

    # Delete user (cascades to podcasts, etc.)
    await db.delete(user)
    await db.commit()

    return MessageResponse(message=f"User {user.email} deleted successfully")


@router.post("/users/{user_id}/reset-password", response_model=MessageResponse)
async def reset_user_password(
    user_id: str,
    request: ResetPasswordRequest,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """
    Reset user password (admin only).

    - Validates password length
    - Invalidates all user sessions (forces re-login)
    """
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Validate password length
    if len(request.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long"
        )

    # Update password
    user.hashed_password = hash_password(request.new_password)
    await db.commit()

    # Invalidate all user sessions (security measure)
    await delete_all_user_sessions(user.id, redis)

    return MessageResponse(message=f"Password reset for user {user.email}. User must log in again.")


class ImportUsersResponse(BaseModel):
    total_rows: int
    created: int
    skipped: int
    errors: list[str]
    created_users: list[str]
    skipped_users: list[str]


@router.post("/users/import-csv", response_model=ImportUsersResponse)
async def import_users_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Import users from CSV file (admin only).

    CSV format: email,password (one user per line, no header)
    - Skips existing users (based on email)
    - Creates new users as active (requires setting check)
    - Returns summary of created/skipped/errors
    """
    if not file.filename or not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a CSV file"
        )

    # Read file contents
    contents = await file.read()
    csv_text = contents.decode('utf-8')

    # Parse CSV
    csv_reader = csv.reader(io.StringIO(csv_text))

    total_rows = 0
    created = 0
    skipped = 0
    errors = []
    created_users = []
    skipped_users = []

    # Check if user approval is required
    from app.models.settings import AppSetting
    setting_stmt = select(AppSetting).where(AppSetting.key == "require_user_approval")
    setting_result = await db.execute(setting_stmt)
    setting = setting_result.scalar_one_or_none()
    require_approval = setting.value == "true" if setting else True

    for row_num, row in enumerate(csv_reader, start=1):
        total_rows += 1

        # Skip empty rows
        if not row or len(row) < 2:
            errors.append(f"Row {row_num}: Invalid format (need email,password)")
            continue

        email = row[0].strip().lower()
        password = row[1].strip()

        # Validate email
        if not email or '@' not in email:
            errors.append(f"Row {row_num}: Invalid email '{email}'")
            continue

        # Validate password
        if len(password) < 8:
            errors.append(f"Row {row_num}: Password too short for '{email}' (min 8 characters)")
            continue

        # Check if user exists
        check_stmt = select(User).where(User.email == email)
        check_result = await db.execute(check_stmt)
        existing_user = check_result.scalar_one_or_none()

        if existing_user:
            skipped += 1
            skipped_users.append(email)
            continue

        # Create new user
        try:
            new_user = User(
                email=email,
                hashed_password=hash_password(password),
                is_admin=False,
                is_active=not require_approval  # Active if approval not required
            )
            db.add(new_user)
            await db.commit()

            created += 1
            created_users.append(email)
        except Exception as e:
            await db.rollback()
            errors.append(f"Row {row_num}: Failed to create user '{email}': {str(e)}")

    return ImportUsersResponse(
        total_rows=total_rows,
        created=created,
        skipped=skipped,
        errors=errors,
        created_users=created_users,
        skipped_users=skipped_users
    )
