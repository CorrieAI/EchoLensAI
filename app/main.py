import os
import uuid
from pathlib import Path

import structlog
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import admin, auth, chat, notifications, podcasts, tasks, terms
from app.api import settings as settings_router
from app.core.config import settings
from app.core.logging_config import configure_logging
from app.db.session import async_session_maker, init_db
from app.services.prompt_loader import seed_prompts

# Configure structured logging on startup
configure_logging(log_level=getattr(settings, "log_level", "INFO"))
logger = structlog.get_logger(__name__)

app = FastAPI(title="EchoLens", version="1.0.0", description="Bring Podcasts Into Focus")

# Parse CORS origins from comma-separated string
allowed_origins = [origin.strip() for origin in settings.cors_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# Logging middleware - adds request context to all logs
@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    """Add request context to all logs within this request."""
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        request_id=request.headers.get("X-Request-ID", str(uuid.uuid4())),
        path=request.url.path,
        method=request.method,
        client_host=request.client.host if request.client else None,
    )

    response = await call_next(request)
    return response


# Security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return response


# Custom exception handlers to ensure CORS headers are always present
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": "true",
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": "true",
        },
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    # Log full error details server-side with structured logging
    logger.exception(
        "unhandled_exception",
        error_type=type(exc).__name__,
        error=str(exc),
        path=request.url.path,
        method=request.method,
    )

    # Return sanitized error message to client (never expose exception details)
    # Full error details are logged server-side for debugging
    detail = "An internal error occurred"

    return JSONResponse(
        status_code=500,
        content={"detail": detail},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": "true",
        },
    )


# Custom static file handler with Range request support for audio/video seeking
@app.get("/echolens_data/{file_path:path}")
async def serve_static_with_range(file_path: str, request: Request):
    """
    Serve static files with HTTP Range request support for audio/video seeking.
    This replaces the default StaticFiles mount which doesn't handle Range properly.
    """
    # Construct full file path
    full_path = Path("echolens_data") / file_path

    # Security: prevent directory traversal
    try:
        full_path = full_path.resolve()
        base_path = Path("echolens_data").resolve()
        if not str(full_path).startswith(str(base_path)):
            raise HTTPException(status_code=404, detail="File not found")
    except (RuntimeError, OSError):
        raise HTTPException(status_code=404, detail="File not found")

    # Check if file exists
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    # Get file size and mime type
    file_size = full_path.stat().st_size

    # Determine content type based on extension
    content_type = "application/octet-stream"
    ext = full_path.suffix.lower()
    mime_types = {
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".pdf": "application/pdf",
    }
    content_type = mime_types.get(ext, content_type)

    # Check for Range header
    range_header = request.headers.get("range")

    if not range_header:
        # No range request - return full file
        return FileResponse(
            full_path,
            media_type=content_type,
            headers={"Accept-Ranges": "bytes"}
        )

    # Parse Range header (format: "bytes=start-end")
    try:
        range_match = range_header.replace("bytes=", "").split("-")
        start = int(range_match[0]) if range_match[0] else 0
        end = int(range_match[1]) if range_match[1] else file_size - 1

        # Validate range
        if start >= file_size or start < 0:
            raise HTTPException(status_code=416, detail="Range not satisfiable")

        # Adjust end if it exceeds file size
        end = min(end, file_size - 1)
        chunk_size = end - start + 1

        # Read and stream the requested byte range
        def iterfile():
            with open(full_path, "rb") as f:
                f.seek(start)
                remaining = chunk_size
                while remaining > 0:
                    chunk = f.read(min(8192, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        # Return 206 Partial Content response
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(chunk_size),
        }

        return StreamingResponse(
            iterfile(),
            status_code=206,
            media_type=content_type,
            headers=headers
        )

    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Invalid range header")


# Fallback for non-media files (images, etc.) - can still use StaticFiles
# But the custom handler above takes precedence

app.include_router(auth.router, tags=["authentication"])
app.include_router(admin.router, tags=["admin"])
app.include_router(podcasts.router, prefix="/api/podcasts", tags=["podcasts"])
app.include_router(podcasts.episodes_router, prefix="/api/episodes", tags=["episodes"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(tasks.router, tags=["tasks"])
app.include_router(terms.router, prefix="/api/terms", tags=["terms"])
app.include_router(notifications.router, tags=["notifications"])
app.include_router(settings_router.router, prefix="/api/settings", tags=["settings"])


@app.on_event("startup")
async def startup_event():
    logger.info("application_startup", version="1.0.0")

    await init_db()
    logger.info("database_initialized")

    # Seed prompts from default .md files if not already loaded
    async with async_session_maker() as db:
        await seed_prompts(db)
        logger.info("prompts_seeded")


@app.get("/")
async def root():
    from fastapi.responses import RedirectResponse

    # Redirect to Next.js frontend
    return RedirectResponse(url="http://localhost:3000")


@app.get("/health")
async def health():
    return {"status": "healthy"}
