# EchoLensAI by CorrieAI

<p align="center">
  <img src="assets/img/echolens-image1.png" alt="EchoLensAI Logo" width="1000" />
</p>

**Reflect On What Your Podcasts Mean and Bring Concepts Into Focus**

Transform your podcast listening experience with AI-powered analysis. EchoLensAI automatically transcribes episodes, extracts key terms with explanations, generates summaries, provides chat capabilities with your podcasts, and enables semantic search across your entire podcast library.

![Modern UI with Dark Mode](https://img.shields.io/badge/UI-Dark%20%2F%20Light%20Mode-blue)
![Built with AI](https://img.shields.io/badge/AI-Powered-green)
![Vector Search](https://img.shields.io/badge/Search-Semantic-purple)

## 📷 Product Images

- [Dark Mode Product Images](assets/darkmode.md)
- [Light Mode Product Images](assets/lightmode.md)

## ✨ Features

### 🎙️ **Podcast Management**

- Add podcasts via RSS feed URLs
- Automatic episode discovery and updates
- Scheduled daily refresh to fetch new episodes
- Bulk episode processing with concurrent workers
- Smart caching to avoid re-downloading audio

### 👥 **Authentication & User Management**

- **Session-Based Authentication**: Secure login with Redis-backed sessions and HTTP-only cookies
- **First User is Admin**: The first user to register automatically becomes the global administrator
- **Multi-User Support**: Each user has their own isolated podcast library and data
- **User Settings**: Update email address and password from the Settings page
- **Admin Dashboard**:
  - Manage all users (promote/demote admin, activate/deactivate accounts)
  - Reset user passwords
  - Export/Import system data
  - Configure RSS refresh schedules
  - Manage AI prompts
  - View system information
- **Protected Routes**: Automatic redirection for unauthenticated users
- **Admin-Only Features**: Certain features (user management, system settings) require admin privileges

### 🤖 **AI-Powered Analysis**

- **Transcription**: Automatic speech-to-text using OpenAI Compatible Whisper (use Groq for speed and cost savings)
- **Term Extraction**: Identifies technical terms, jargon, and concepts with AI-generated explanations
- **Summarization**: Creates concise text summaries of episodes
- **Vector Embeddings**: Generates semantic embeddings for intelligent search
- **Chat Interface**: Ask questions about episodes using RAG (Retrieval Augmented Generation) and OpenAI compatible AI models (can use Groq for speed or Ollama for local chat)

### 🔍 **Search & Discovery**

- **Hybrid Transcript Search**: Combines exact keyword matching with semantic AI search on the AI Enhanced page
  - **Exact matches** appear first with green "Exact Match" badges
  - **Semantic matches** find conceptually related content even when exact keywords aren't present
  - Search what was actually *said* in episodes, not just titles and descriptions
- **Quick Text Search**: Fast keyword search across titles, descriptions, and authors
- **Term Browser**: Explore all extracted terms across your podcast library
- **Filter & Sort**: By podcast, date, processed status, and more

### 📊 **Task Management**

- Real-time task status monitoring with progress indicators
- Detailed developer logs for each task (isolated per task)
- Background processing with Celery workers (2 concurrent by default)
- Automatic cleanup of orphaned tasks
- Task history with success/failure tracking

### 🎨 **Modern User Interface**

- **Next.js 15**: Built with the latest App Router and React Server Components
- **Dark/Light Mode**: System-aware theme with manual toggle
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- **Real-time Updates**: Live progress tracking without page refreshes
- **Minimalist Aesthetic**: Clean, focused design built with Tailwind CSS

### 💾 **Data Management**

- **Export/Import**: Full database backup with PostgreSQL pg_dump
- **Audio Export**: Optional inclusion of audio files in exports
- **Size Estimation**: Preview export size before downloading
- **One-Click Restore**: Complete database restoration from backups
- **RSS Export**: Export podcast RSS URLs as text file

### 🔔 **Notifications**

- Real-time notifications for task completion
- Podcast refresh completion alerts
- Error notifications with details
- Unread notification counter

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- OpenAI API key
- Groq API key (recommended for faster transcription)

### Docker Setup (Recommended)

**This is the easiest way to get started. Everything runs in containers.**

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/echolens.git
cd echolens
```

2. **Configure environment**

**For Development:**
```bash
cp .env.example .env
# Edit .env with your API keys (uses simple passwords for local dev)
```

**For Production:**
```bash
cp .env.prod.example .env.prod
# Edit .env.prod with your API keys and strong passwords
```

The `.env.example` file (development) is organized with required settings at the top:

- **🔑 REQUIRED API Keys** (edit these first):
  - `CHAT_API_KEY`: For summaries, term extraction, and chat (OpenAI, Groq, or Ollama)
  - `EMBEDDING_API_KEY`: For vector search (OpenAI or Ollama - Groq doesn't support embeddings)
  - `TRANSCRIPTION_API_KEY`: For speech-to-text (Groq recommended for speed/cost)
  - `TTS_API_KEY`: Optional, for audio summary generation
- **🔐 Passwords**: Development passwords are pre-set, change production passwords before deploying
- **⚙️ OPTIONAL**: Advanced settings have working defaults (model names, endpoints, etc.)

3. **Start all services**

```bash
# Development mode (uses .env)
./scripts/start-dev.sh

# Production mode (uses .env.prod with security hardening)
./scripts/start.sh
```

**Important:** Production mode (`docker-compose.yaml`) automatically uses `.env.prod` for security-hardened settings. Development mode (`docker-compose.dev.yaml`) uses `.env` with simpler passwords and all ports exposed for debugging.

4. **Access the application**

- Frontend: <http://localhost:3000>
- Backend API (dev only): <http://localhost:8000>
- API Docs (dev only): <http://localhost:8000/docs>
- Adminer (dev only): <http://localhost:8080> (user: echolens, password: echolens_dev)

5. **Create your admin account**

When you first access the application at <http://localhost:3000>, you'll be redirected to the registration page:

- Register with your email and password (minimum 8 characters)
- **The first user to register automatically becomes the global administrator**
- You'll be logged in and redirected to the main podcast library
- Subsequent users who register will be regular users (not admins) until promoted by an admin

**Port Conflicts?** You can customize all ports in your `.env` file:

```bash
FRONTEND_PORT=3001
BACKEND_PORT=8001
POSTGRES_PORT=5433
REDIS_PORT=6380
ADMINER_PORT=8081
CORS_ORIGINS=http://localhost:3001  # Must match FRONTEND_PORT!
```

See [DOCKER.md](DOCKER.md) for detailed Docker documentation.

### Manual Setup (Alternative)

If you prefer running services locally without Docker, see [DEVELOPMENT.md](DEVELOPMENT.md) for manual setup instructions.

**Note:** The manual setup requires Python 3.12+ and Node.js 18+.

## 🎮 Common Commands

### Starting & Stopping

```bash
# Development mode (hot-reload enabled)
./scripts/start-dev.sh    # Start development services
./scripts/stop-dev.sh     # Stop development services

# Production mode (optimized builds)
./scripts/start.sh        # Start production services
./scripts/stop.sh         # Stop production services
```

### Monitoring

```bash
# Check what's running
./scripts/status.sh

# View logs
docker compose -f docker-compose.dev.yaml logs -f              # All services
docker compose -f docker-compose.dev.yaml logs -f echolens-backend  # Backend only
docker compose -f docker-compose.dev.yaml logs -f celery-worker     # Celery only

# Restart services
./scripts/restart.sh      # Restart development (default)
./scripts/restart.sh --prod  # Restart production
```

### Data Management

```bash
# Full reset - ⚠️ DELETES ALL DATA
./scripts/full-reset.sh
# This will:
# - Stop and remove all containers and volumes
# - Delete all podcast data, transcriptions, summaries, chat history
# - Delete all local data echolens data directories
# - Requires TWO confirmations: type 'DELETE ALL DATA' then 'YES'
# - Cannot be undone!

# Use this when you want to start completely fresh
```

See [DOCKER.md](DOCKER.md) for more Docker commands and troubleshooting.

## 📖 Usage

### User Registration & Login

**First Time Setup:**

1. Navigate to <http://localhost:3000>
2. Click "Sign up" on the login page
3. Enter your email and password (minimum 8 characters)
4. **Important**: The first user to register becomes the global administrator
5. You'll be automatically logged in

**Subsequent Users:**

- New users can register using the same sign-up page
- They will have regular user accounts (not admin) by default
- Admins can promote users to admin status from the Admin Dashboard

**Login:**

- Use your registered email and password
- Sessions are stored securely with Redis and HTTP-only cookies
- You'll remain logged in until you explicitly log out

### User Settings

All users can access their personal settings:

1. Click your email in the top-right corner
2. Select "Settings"
3. **User Profile** section:
   - Change email address (requires password confirmation)
   - Change password (requires current password)
4. **Display Preferences** section:
   - Card layout (2 or 3 columns)
   - Loading mode (pagination or infinite scroll)
   - Items per page

### Admin Dashboard

Admins have access to additional features via the Admin Dashboard:

**User Management:**
- View all registered users
- Promote/demote admin privileges
- Activate/deactivate user accounts
- Reset user passwords
- Delete users (cannot delete self)

**RSS Refresh Schedule:**
- Configure daily podcast refresh time
- Set timezone for scheduled tasks

**Export/Import:**
- Export entire database (with optional audio files)
- Import database from backup
- **Note**: Current admin credentials are preserved during import

**AI Prompts:**
- Edit AI prompt templates used for:
  - Episode summarization
  - Term extraction
  - Chat responses
- Reset prompts to defaults

**System Information:**
- View application version
- Check database stats
- Monitor storage usage

### Adding Podcasts

1. Click "Add Podcast" in the UI
2. Enter the RSS feed URL
3. Click "Add" - episodes will be automatically fetched

### Processing Episodes

- **Single Episode**: Click "Process" on any episode
- **Bulk Processing**: Use "Process All Unprocessed" on a podcast
- **Progress Tracking**: View real-time progress in the Tasks page

### Searching

- **Semantic Search**: Enter natural language queries to find relevant episodes
- **Term Browser**: Explore extracted terms and their explanations
- **Filter**: Narrow down by podcast, processed status, etc.

### Chat with Episodes

1. Open an episode detail page
2. Use the chat interface to ask questions
3. AI will answer based on the episode's transcript and context

### Export/Import

- **Export**: Settings → Export Data → Choose with/without audio
- **Import**: Settings → Import Data → Upload .sql or .zip file
- **Warning**: Import will replace all existing data

## 🔧 Configuration

Configuration is managed through environment files:

- **Development**: `.env` (copied from `.env.example`) - Simple passwords, all ports exposed
- **Production**: `.env.prod` (copied from `.env.prod.example`) - Strong passwords, only frontend exposed

### Development vs Production

| Aspect | Development (`.env`) | Production (`.env.prod`) |
|--------|---------------------|--------------------------|
| **Passwords** | Simple (e.g., `echolens_dev`) | Strong random strings |
| **Debug Mode** | `DEBUG_MODE=true` | `DEBUG_MODE=false` |
| **Cookie Security** | `SESSION_COOKIE_SECURE=false` | `SESSION_COOKIE_SECURE=true` |
| **CORS** | `http://localhost:3000` | `https://yourdomain.com` |
| **Ports Exposed** | All (backend, DB, Redis) | Frontend only |
| **Compose File** | `docker-compose.dev.yaml` | `docker-compose.yaml` |

**Security Note:** `.env.prod.example` includes detailed production deployment checklist and instructions for generating secure secrets.

### Environment Variables Reference

#### Docker Production Passwords

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `POSTGRES_PASSWORD` | PostgreSQL password for production | `change_this_in_production` | Yes (prod) |
| `REDIS_PASSWORD` | Redis password for production | `change_this_in_production` | Yes (prod) |

#### Database Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection URL | `postgresql+asyncpg://echolens:echolens_dev@localhost:5432/echolens` | Yes |
| `TIMEZONE` | Timezone for display/logging | `UTC` | No |

#### Port Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `FRONTEND_PORT` | Host port for frontend | `3000` | No |
| `BACKEND_PORT` | Host port for backend (dev mode only) | `8000` | No |
| `POSTGRES_PORT` | Host port for PostgreSQL | `5432` | No |
| `REDIS_PORT` | Host port for Redis | `6379` | No |
| `ADMINER_PORT` | Host port for Adminer (dev mode only) | `8080` | No |

**Note:** These are the ports exposed on your host machine. Internal container ports remain the same. If you change `FRONTEND_PORT`, you must also update `CORS_ORIGINS` to match.

#### CORS & File Storage

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CORS_ORIGINS` | Allowed frontend URLs (comma-separated) | `http://localhost:3000` | Yes |
| `UPLOAD_DIR` | Directory for uploaded files | `./echolens_data/uploads` | No |
| `MAX_UPLOAD_SIZE` | Maximum upload size in bytes | `524288000` (500MB) | No |

**Important:** If you change `FRONTEND_PORT` above, you must update `CORS_ORIGINS` to match the new port (e.g., `http://localhost:3001`).

#### Chat Model (GPT-4 for summaries, terms, chat)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CHAT_API_KEY` | API key for chat model | - | Yes |
| `CHAT_API_BASE` | API base URL (leave empty for OpenAI) | Empty | No |
| `CHAT_MODEL` | Model name | `gpt-4o-mini` | No |
| `CHAT_STREAMING` | Enable streaming responses | `true` | No |
| `CHAT_TEMPERATURE` | Model temperature (0-2) | `0.7` | No |
| `CHAT_MAX_TOKENS` | Maximum tokens per response | `2000` | No |

#### Embedding Model (for vector search)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `EMBEDDING_API_KEY` | API key for embeddings | - | Yes |
| `EMBEDDING_API_BASE` | API base URL (leave empty for OpenAI) | Empty | No |
| `EMBEDDING_MODEL` | Model name | `text-embedding-3-small` | No |
| `EMBEDDING_DIMENSIONS` | Vector dimensions (must match model) | `1536` | Yes |

**Important:** Groq doesn't support embeddings. Use OpenAI or Ollama.

**⚠️ WARNING - Changing Embedding Models:**

If you've already processed episodes and want to switch to a different embedding model (e.g., from OpenAI to Ollama or vice versa), you **must run a full reset**:

1. Run `./full-reset.sh` to delete all data and reset the database
2. Update `EMBEDDING_DIMENSIONS` in `.env` to match your new model:
   - OpenAI `text-embedding-3-small`: 1536
   - OpenAI `text-embedding-3-large`: 3072
   - Ollama `nomic-embed-text`: 768
3. Restart the stack and re-add/process your podcasts

The application will detect dimension mismatches and refuse to start if existing embeddings don't match the configured dimensions. This is by design to prevent data corruption.

#### Transcription Model (Whisper)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `TRANSCRIPTION_API_KEY` | API key for transcription | - | Yes |
| `TRANSCRIPTION_API_BASE` | API base URL (leave empty for OpenAI) | Empty | No |
| `TRANSCRIPTION_MODEL` | Whisper model name | `whisper-1` | No |

**Tip:** Use Groq for 10x faster transcription!

#### Text-to-Speech (Optional)

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `TTS_ENABLED` | Enable audio summary generation | `true` | No |
| `TTS_API_KEY` | API key for TTS | - | If enabled |
| `TTS_API_BASE` | API base URL (leave empty for OpenAI) | Empty | No |
| `TTS_MODEL` | TTS model name | `tts-1` | No |
| `TTS_VOICE` | Voice (`alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`) | `alloy` | No |

#### Celery Worker Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CELERY_WORKER_CONCURRENCY` | Number of concurrent worker processes | `2` | No |

**Recommendations:**

- `1`: Low-resource systems
- `2`: Default, good for most systems
- `4`: More parallel processing (needs more CPU/memory)

### Common Configuration Examples

**All OpenAI:**

```bash
CHAT_API_KEY=sk-...
EMBEDDING_API_KEY=sk-...
TRANSCRIPTION_API_KEY=sk-...
TTS_API_KEY=sk-...
```

**Groq + OpenAI (Recommended for speed and price):**

```bash
# Chat via Groq (faster, cheaper)
CHAT_API_KEY=gsk-...
CHAT_API_BASE=https://api.groq.com/openai/v1
CHAT_MODEL=openai/gpt-oss-120b

# Transcription via Groq (10x faster!)
TRANSCRIPTION_API_KEY=gsk-...
TRANSCRIPTION_API_BASE=https://api.groq.com/openai/v1
TRANSCRIPTION_MODEL=whisper-large-v3-turbo

# Embeddings + TTS via OpenAI (Groq doesn't support)
EMBEDDING_API_KEY=sk-...
TTS_API_KEY=sk-...
```

**Local Ollama + OpenAI:**

```bash
# Chat via Ollama (free, local)
CHAT_API_KEY=ollama
CHAT_API_BASE=http://localhost:11434/v1
CHAT_MODEL=llama3.1

# Rest via OpenAI
EMBEDDING_API_KEY=sk-...
TRANSCRIPTION_API_KEY=sk-...
TTS_API_KEY=sk-...
```

### Scheduled Tasks

EchoLens includes a scheduled task to refresh all podcasts daily:

- **Default**: 00:00 UTC
- **Configure**: Settings page in the UI

## 🛠️ Technology Stack

### Backend

- **FastAPI**: Modern Python web framework with async support
- **SQLAlchemy**: ORM with async support for PostgreSQL
- **PostgreSQL + pgvector**: Vector database for semantic search
- **Celery**: Distributed task queue for background processing
- **Redis**: Message broker, result backend, and session storage
- **Argon2**: Password hashing for secure credential storage
- **Session Authentication**: HTTP-only cookies with Redis-backed sessions
- **Structlog**: Structured logging for production monitoring
- **Groq API**: Fast Whisper transcription and OpenAI API compatibility. Leverage gpt-oss-120b for excellent speed and cost.
- **OpenAI API**: GPT-4o-mini for term extraction, summaries, and chat

### Frontend

- **Next.js 15** (App Router): Modern React framework with server components
- **Tailwind CSS**: Utility-first CSS framework
- **TypeScript**: Type-safe JavaScript
- **React 19**: Latest React with improved server components

### Infrastructure

- **Docker**: Containerized PostgreSQL, Redis, and Celery workers
- **UV**: Fast Python package manager and virtual environment
- **Feedparser**: RSS/Atom feed parsing
- **Pydub**: Audio file manipulation

## 🚀 Future Integrations

The following features are planned for future releases:

### 🎯 High Priority

- **DockerHub Images**: Pre-built Docker images for faster deployment
  - One-command installation without building
  - Automatic updates via tagged releases
  - Multi-architecture support (amd64, arm64)

- **Auto-Process Entire Feed**: Automatically process all episodes when adding a podcast
  - Option to process all episodes or just recent ones
  - Configurable episode limit (e.g., "process last 10 episodes")
  - Background processing queue for large feeds
  - Progress tracking in UI

- **Local Whisper Support**: Run Whisper models locally without API calls
  - Support for faster-whisper library
  - GPU acceleration support (CUDA, Metal)
  - Model selection (tiny, base, small, medium, large)
  - No API costs for transcription

### 🔮 Future Enhancements

- **Automatic Speaker Diarization**: Identify and label different speakers with Deepgram integration
- **Playback Transcription Sync**: Sync transcript with audio playback for interactive reading using Deepgram
- **Cost Estimation For AI Processing and Chat**: Use TikToken and other methods to calculate estimated cost of processing for each episode and chat
- **Integrate Web Search Tool Calling**: Allow processing to call web search tools for more accurate and up to date information
- **Podcast Search**: Easily find new podcasts to add to your catalog

Want to contribute? Check out our [Contributing](#-contributing) section!

## 📁 Project Structure

```
echolens/
├── app/                      # Backend application (FastAPI)
│   ├── api/                  # API endpoints
│   │   ├── auth.py           # Authentication endpoints (login, register, logout)
│   │   ├── admin.py          # Admin-only endpoints (user management)
│   │   ├── podcasts.py       # Podcast management endpoints
│   │   ├── chat.py           # Chat interface endpoints
│   │   ├── tasks.py          # Task monitoring endpoints
│   │   ├── settings.py       # System settings & export/import
│   │   └── ...               # Other API endpoints
│   ├── models/               # SQLAlchemy models
│   │   ├── user.py           # User model (authentication)
│   │   ├── podcast.py        # Podcast, Episode, Term, etc.
│   │   └── ...               # Other database models
│   ├── services/             # Business logic
│   │   ├── auth.py           # Authentication service (sessions, passwords)
│   │   ├── transcription.py  # Whisper API integration
│   │   ├── chat.py           # RAG chat implementation
│   │   └── ...               # Other services
│   ├── tasks/                # Celery background tasks
│   ├── db/                   # Database configuration
│   ├── migrations/           # Database migration scripts (SQL)
│   └── core/                 # Core settings & configuration
│       ├── security.py       # Authentication dependencies
│       ├── config.py         # Environment configuration
│       └── logging_config.py # Structured logging setup
├── frontend/                 # Next.js frontend application
│   ├── app/                  # App Router pages & layouts
│   │   ├── login/            # Login page
│   │   ├── register/         # Registration page
│   │   ├── admin/            # Admin dashboard (admin only)
│   │   ├── settings/         # User settings page
│   │   └── ...               # Other pages
│   ├── components/           # React components
│   │   ├── protected-route.tsx  # Route protection wrapper
│   │   └── ...               # Other components
│   ├── contexts/             # React contexts
│   │   └── auth-context.tsx  # Authentication state management
│   ├── lib/                  # Utilities & helpers
│   │   └── api.ts            # API client with auth
│   └── public/               # Static assets
├── docker/                   # Docker configuration files
│   ├── backend/
│   │   ├── Dockerfile        # Production backend image
│   │   └── Dockerfile.dev    # Development backend image (hot-reload)
│   └── frontend/
│       ├── Dockerfile        # Production frontend image
│       └── Dockerfile.dev    # Development frontend image (hot-reload)
├── scripts/                  # Operational scripts
│   ├── start.sh              # Start production mode
│   ├── start-dev.sh          # Start development mode
│   ├── stop.sh               # Stop production mode
│   ├── stop-dev.sh           # Stop development mode
│   ├── restart.sh            # Restart services
│   ├── status.sh             # Check service status
│   └── full-reset.sh         # Complete data reset (⚠️ destructive)
├── docker-compose.yaml       # Production Docker Compose config (uses .env.prod)
├── docker-compose.dev.yaml   # Development Docker Compose config (uses .env)
├── echolens_data/            # Application data (created at runtime)
│   ├── uploads/              # Uploaded audio files
│   └── exports/              # Database export files
├── task_logs/                # Celery task-specific logs (created at runtime)
├── .env                      # Development environment variables (create from .env.example)
├── .env.example              # Development configuration example
├── .env.prod                 # Production environment variables (create from .env.prod.example)
├── .env.prod.example         # Production configuration with security hardening
└── README.md                 # This file
```

## 🐛 Troubleshooting

### Celery workers not starting

```bash
docker compose logs celery-worker
```

### Database connection issues

- Ensure PostgreSQL is running: `docker compose ps`
- Check `DATABASE_URL` in `.env`
- Verify pgvector extension: `docker exec echolens-postgres psql -U echolens -c "CREATE EXTENSION IF NOT EXISTS vector;"`

### Tasks stuck in PENDING

- Restart Celery workers: `docker compose restart celery-worker`
- Check Redis connection: `docker compose logs redis`

### Container issues

```bash
# Restart all services
./scripts/stop.sh && ./scripts/start.sh

# View status
./scripts/status.sh
```

For more troubleshooting tips, see [DOCKER.md](DOCKER.md).

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Built with FastAPI, Next.js, and modern AI tools
- Powered by OpenAI Compatible LLMs and Whisper
- Vector search enabled by pgvector
- UI inspired by modern podcast apps

---

# CorrieAI

EchoLensAI is developed and released by [CorrieAI](https://corrie.ai).

CorrieAI is an AI research and development company that is building useful consumer products for both B2B and B2C use cases.

If you would like to contact use, email us at <hello@corrie.ai>.
