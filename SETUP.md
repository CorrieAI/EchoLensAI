# EchoLens Setup Guide

**Bring Podcasts Into Focus**

## Clean System Installation

This guide ensures EchoLens can be set up on a fresh system with all functionality working correctly.

## Prerequisites

- Python 3.12+
- Docker & Docker Compose
- PostgreSQL (via Docker)
- Redis (via Docker)
- uv (Python package installer)

## Database Tables

The application uses 11 tables that are automatically created on first startup:

1. **podcasts** - Podcast metadata and RSS feed info
2. **episodes** - Episode metadata, audio URLs, and local paths
3. **transcriptions** - Full episode transcripts with embeddings
4. **terms** - Extracted terms with explanations and embeddings
5. **summaries** - Episode summaries with audio
6. **vector_slices** - Chunked transcript embeddings for semantic search
7. **task_history** - Processing task status and history
8. **playback_progress** - Audio playback position tracking
9. **chats** - Chat conversations per episode
10. **chat_messages** - Individual chat messages
11. **notifications** - System notifications (task events, errors, etc.)

## Setup Steps

### 1. Clone and Install Dependencies

```bash
cd /path/to/echolens
uv sync
```

### 2. Environment Configuration

Create a `.env` file in the project root with:

```env
# Database
DATABASE_URL=postgresql+asyncpg://podmaxai:podmaxai_dev@localhost:5432/podmaxai

# Celery
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0

# OpenAI
OPENAI_API_KEY=your_key_here

# Directories
UPLOAD_DIR=uploads
```

### 3. Start Infrastructure Services

```bash
cd local-services
docker compose up -d
```

This starts:
- PostgreSQL with pgvector extension
- Redis for Celery
- Celery worker for background tasks
- Celery beat for periodic tasks (cleanup)

### 4. Database Initialization

The database is automatically initialized on first app startup via `init_db()` in `app/main.py`.

This process:
1. Creates the `vector` PostgreSQL extension
2. Creates all 11 tables with proper indexes and foreign keys
3. Sets up CASCADE delete relationships

**No manual database setup is required.**

### 5. Start the Application

```bash
# Development mode (recommended for local dev)
./scripts/start-dev.sh

# Or production mode
./scripts/start.sh
```

This starts:
- Backend server (FastAPI) on port 8000
- Frontend CSS watcher

Access at: http://localhost:8000/web/

## Verification

Run the database initialization test:

```bash
uv run python test_db_init.py
```

This verifies:
- All 11 tables are created
- Vector extension is installed
- Foreign keys have CASCADE delete
- Notifications table has correct schema

Expected output: `✅ ALL CHECKS PASSED`

## Key Features

### Automatic Background Tasks

1. **Episode Processing** - Transcription, term extraction, summarization
2. **Orphaned Task Cleanup** - Runs every 5 minutes to clean up stuck tasks

### Notification System

- Database-backed notifications persist for 7 days
- Automatic notifications for:
  - Task started
  - Task completed (success)
  - Task failed (error)
- Frontend polls every 5 seconds
- Unread badge and read/unread status

### Data Persistence

All data persists in Docker volumes:
- `podmaxai_postgres_data` - Database
- `podmaxai_redis_data` - Redis/Celery state
- `uploads/` - Audio files, transcripts, summaries

## Clean Reset

To reset to a fresh database:

```bash
# Stop services
cd local-services
docker compose down

# Remove volumes
docker volume rm podmaxai_postgres_data podmaxai_redis_data

# Restart - database will be recreated
docker compose up -d
./scripts/start-dev.sh
```

The application will automatically recreate all tables on next startup.

## Troubleshooting

### Tables not created

Check that all models are imported in `app/models/__init__.py`:
```python
from app.models.podcast import (
    Podcast, Episode, Transcription, Term, Summary, VectorSlice,
    TaskHistory, PlaybackProgress, Chat, ChatMessage, Notification
)
```

### Celery tasks stuck

Orphaned tasks are automatically cleaned up every 5 minutes by Celery beat. Tasks stuck in PENDING/PROGRESS for >5 minutes are marked as FAILURE.

### Notifications not showing

1. Check Celery worker is running: `docker ps | grep celery`
2. Check notifications API: `curl http://localhost:8000/api/notifications`
3. Check browser console for polling errors

## Architecture

```
┌─────────────────┐
│   Frontend      │  CSS + HTMX
│   (Tailwind)    │
└────────┬────────┘
         │
┌────────▼────────┐
│   FastAPI       │  Main application
│   Backend       │
└────────┬────────┘
         │
    ┌────┴────┬─────────────┬──────────┐
    │         │             │          │
┌───▼───┐ ┌──▼──────┐ ┌────▼─────┐ ┌─▼────────┐
│ Postgres│ │ Redis   │ │  Celery  │ │  Celery  │
│ pgvector│ │         │ │  Worker  │ │   Beat   │
└─────────┘ └─────────┘ └──────────┘ └──────────┘
```

## Models Overview

All models use SQLAlchemy with AsyncPG and are defined in `app/models/podcast.py`.

Key relationships:
- Podcast → Episodes (one-to-many)
- Episode → Transcription (one-to-one)
- Episode → Terms (one-to-many)
- Episode → Summary (one-to-one)
- Episode → VectorSlices (one-to-many)
- Episode → TaskHistory (one-to-many)
- Episode → Chat (one-to-one)
- Chat → ChatMessages (one-to-many)
- Episode/Podcast → Notifications (one-to-many)

All relationships use CASCADE delete for data integrity.
