# EchoLens Development Guide

## Docker-Based Development (Recommended)

All development can now be done entirely in Docker with **live reload** enabled!

### Quick Start

```bash
./scripts/start-dev.sh   # Start all services in dev mode
./scripts/status.sh      # Check what's running
./scripts/restart.sh     # Restart all services
./scripts/stop-dev.sh    # Stop all services
```

### Live Reload Features

**✅ Backend (FastAPI):**
- Edit files in `./app/`
- Changes automatically reload (uvicorn --reload)
- No rebuild needed

**✅ Frontend (Next.js):**
- Edit files in `./frontend/`
- Hot Module Replacement (HMR) works
- Changes appear instantly
- No rebuild needed

**✅ Celery Workers:**
- Edit task code in `./app/`
- Restart workers to apply: `docker compose -f docker-compose.dev.yaml restart celery-worker celery-beat`

### Access Points

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Database Admin (Adminer)**: http://localhost:8080
- **Postgres**: localhost:5432 (user: echolens, password: echolens_dev, db: echolens)
- **Redis**: localhost:6379 (password: echolens_dev)

### Development Workflow

1. **Make code changes** in your editor (VSCode, etc.)
2. **Save the file**
3. **See changes immediately** in browser (frontend) or on next request (backend)

No need to stop/start containers or rebuild!

### Viewing Logs

```bash
# All services
docker compose -f docker-compose.dev.yaml logs -f

# Specific service
docker compose -f docker-compose.dev.yaml logs -f echolens-backend
docker compose -f docker-compose.dev.yaml logs -f echolens-frontend
docker compose -f docker-compose.dev.yaml logs -f celery-worker
```

### When to Rebuild

You only need to rebuild if you:
- Change `package.json` (frontend dependencies)
- Change `pyproject.toml` (backend dependencies)
- Change Dockerfile

```bash
# Rebuild specific service
docker compose -f docker-compose.dev.yaml build echolens-backend
docker compose -f docker-compose.dev.yaml build echolens-frontend

# Rebuild and restart
docker compose -f docker-compose.dev.yaml up -d --build echolens-backend
```

### Installing New Dependencies

**Frontend (npm packages):**
```bash
cd frontend
npm install <package-name>
cd ..
docker compose -f docker-compose.dev.yaml build echolens-frontend
docker compose -f docker-compose.dev.yaml up -d echolens-frontend
```

**Backend (Python packages):**
```bash
# Add to pyproject.toml, then:
docker compose -f docker-compose.dev.yaml build echolens-backend celery-worker celery-beat
docker compose -f docker-compose.dev.yaml up -d echolens-backend celery-worker celery-beat
```

### Database Operations

**Run migrations or database commands:**
```bash
docker exec -it echolens-backend sh -c ". .venv/bin/activate && python -m alembic upgrade head"
```

**Access Postgres directly:**
```bash
docker exec -it echolens-postgres psql -U echolens -d echolens
```

**Reset database (⚠️ deletes all data):**
```bash
./full-reset.sh
```

### Troubleshooting

**Port already in use:**
```bash
./scripts/stop-dev.sh
# Kill any orphaned processes
lsof -ti:3000 | xargs kill -9
lsof -ti:8000 | xargs kill -9
./scripts/start-dev.sh
```

**Backend not reloading:**
- Check if uvicorn --reload is enabled in docker/backend/Dockerfile.dev
- Restart backend: `docker compose -f docker-compose.dev.yaml restart echolens-backend`

**Frontend not updating:**
- Check browser cache (hard refresh: Cmd+Shift+R)
- Check logs: `docker compose -f docker-compose.dev.yaml logs -f echolens-frontend`

**Container stuck in restart loop:**
```bash
docker compose -f docker-compose.dev.yaml logs echolens-backend
# Fix the error, then:
docker compose -f docker-compose.dev.yaml restart echolens-backend
```

## Native Development (Legacy)

You can still run services natively if needed, but Docker is recommended.

### Prerequisites
- Python 3.12+
- Node.js 20+
- PostgreSQL 16 with pgvector
- Redis 7

### Backend (Native)
```bash
uv sync
source .venv/bin/activate
uvicorn app.main:app --reload
```

### Frontend (Native)
```bash
cd frontend
npm install
npm run dev
```

### Services
You'll need to run Postgres, Redis, and Celery separately.

## Production Deployment

```bash
./scripts/start.sh
```

Production mode:
- No live reload
- Optimized builds
- Private backend network
- Only frontend exposed on port 3000

See [DOCKER.md](./DOCKER.md) for full production deployment guide.

## Code Quality & Linting

EchoLens uses **Ruff** for Python linting and formatting - an extremely fast linter written in Rust that's 10-100x faster than traditional tools.

### What Ruff Does

Ruff replaces multiple tools in one:
- **Black** (code formatting)
- **isort** (import sorting)
- **Flake8** (linting)
- **pyupgrade** (syntax modernization)
- **autoflake** (unused code removal)

### Quick Commands

```bash
# Check for issues
uv run ruff check app/

# Auto-fix issues
uv run ruff check app/ --fix

# Format code
uv run ruff format app/

# Run both (recommended before committing)
uv run ruff check app/ --fix && uv run ruff format app/
```

### VS Code Integration

The `.vscode/settings.json` is configured to:
- ✅ Use Ruff as the default formatter
- ✅ Format code on save
- ✅ Auto-fix issues on save
- ✅ Organize imports automatically

**Install the Ruff extension:**
1. Open VS Code Extensions (Cmd+Shift+X)
2. Search for "Ruff" by Astral Software
3. Install and reload VS Code

### Pre-commit Hooks (Optional)

Automatically run Ruff before each commit:

```bash
# Install pre-commit (one time)
pip install pre-commit
pre-commit install

# Now Ruff runs automatically on git commit
# Or run manually on all files:
pre-commit run --all-files
```

### Configuration

All Ruff settings are in `pyproject.toml` under `[tool.ruff]`:
- **Line length**: 100 characters
- **Target Python**: 3.11+
- **Rules**: 800+ checks enabled
- **Auto-fix**: 90% of issues can be auto-fixed

### Common Issues

**Ruff not found in Docker:**
```bash
# Rebuild to install Ruff in container
docker compose -f docker-compose.dev.yaml build echolens-backend
docker compose -f docker-compose.dev.yaml up -d echolens-backend
```

**Format-on-save not working:**
- Ensure Ruff extension is installed in VS Code
- Check `.vscode/settings.json` is present
- Reload VS Code window

**Pre-commit hook too slow:**
- Ruff is very fast, but you can skip with: `git commit --no-verify`
- Not recommended - fix the issues instead!

## File Structure

```
echolensai/
├── app/                    # Backend Python code (FastAPI)
├── frontend/               # Frontend Next.js code
├── docker/                 # Docker configuration
│   ├── backend/
│   │   ├── Dockerfile      # Backend prod image (no --reload)
│   │   └── Dockerfile.dev  # Backend dev image (with --reload)
│   └── frontend/
│       ├── Dockerfile      # Frontend prod image
│       └── Dockerfile.dev  # Frontend dev image (with hot-reload)
├── scripts/                # Operational scripts
│   ├── start.sh            # Start production
│   ├── start-dev.sh        # Start development
│   ├── stop.sh             # Stop production
│   ├── stop-dev.sh         # Stop development
│   ├── restart.sh          # Restart services
│   ├── status.sh           # Check status
│   └── full-reset.sh       # Nuclear reset (deletes all data)
├── .vscode/                # VS Code settings
│   └── settings.json       # Ruff integration, format-on-save
├── .pre-commit-config.yaml # Pre-commit hooks configuration
├── pyproject.toml          # Python dependencies & Ruff config
├── docker-compose.yaml     # Production setup
└── docker-compose.dev.yaml # Development setup (hot-reload)
```
