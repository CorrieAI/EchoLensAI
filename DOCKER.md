# EchoLens Docker Setup

This document describes the Docker setup for EchoLens.

## Overview

EchoLens now supports running entirely in Docker containers with two configurations:

1. **Development (docker-compose.dev.yaml)** - All services with ports exposed for development
2. **Production (docker-compose.yaml)** - Secure configuration with private networks

## Quick Start

### Development Mode (Recommended)

```bash
# Start all services in development mode
./scripts/start-dev.sh

# View logs
docker compose -f docker-compose.dev.yaml logs -f

# Stop all services
./scripts/stop-dev.sh
```

### Production Mode

```bash
# Start all services in production mode
./scripts/start.sh

# Stop all services
./scripts/stop.sh
```

## Architecture

### Services

- **postgres** - PostgreSQL 16 with pgvector extension
- **redis** - Redis 7 for Celery message broker
- **echolens-backend** - FastAPI application
- **celery-worker** - Celery worker for async tasks
- **celery-beat** - Celery beat for scheduled tasks
- **echolens-frontend** - Next.js application
- **adminer** - Database admin interface (dev only)

### Networks

#### Development (docker-compose.dev.yaml)
- Single shared network (`echolens-network`)
- All ports exposed to host:
  - Frontend: `3000`
  - Backend: `8000`
  - Postgres: `5432`
  - Redis: `6379`
  - Adminer: `8080`

#### Production (docker-compose.yaml)
- Two isolated networks:
  - `backend-network` (internal) - postgres, redis, echolens-backend, celery services
  - `frontend-network` (external) - echolens-frontend and echolens-backend only
- Only frontend port exposed: `3000`
- Backend services are private and not accessible from host

### Volumes

- `echolens_postgres_data` - Postgres data persistence
- `echolens_redis_data` - Redis data persistence
- `echolens_data` - Application uploads/exports (production)
- `task_logs` - Task logs (production)

In development mode, local directories are mounted for hot-reload:
- `./app` → `/app/app`
- `./echolens_data` → `/app/echolens_data`
- `./task_logs` → `/app/task_logs`
- `./.env` → `/app/.env`

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key variables:
- `DATABASE_URL` - Set to `postgresql+asyncpg://echolens:echolens_dev@localhost:5432/echolens`
- `CELERY_BROKER_URL` - Set to `redis://:echolens_dev@redis:6379/0`
- `CELERY_RESULT_BACKEND` - Set to `redis://:echolens_dev@redis:6379/0`

For production, also set:
- `POSTGRES_PASSWORD` - Strong password for Postgres
- `REDIS_PASSWORD` - Strong password for Redis

### Frontend Configuration

The Next.js app is configured for Docker with `output: 'standalone'` in `next.config.ts`.

## Commands

### Start Services
```bash
# Development mode
./scripts/start-dev.sh

# Production mode
./scripts/start.sh
```

### Stop Services
```bash
# Development mode
./scripts/stop-dev.sh

# Production mode
./scripts/stop.sh
```

### View Logs
```bash
# All services
docker compose -f docker-compose.dev.yaml logs -f

# Specific service
docker compose -f docker-compose.dev.yaml logs -f echolens-backend
docker compose -f docker-compose.dev.yaml logs -f celery-worker
```

### Access Services

Development mode:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Adminer: http://localhost:8080

Production mode:
- Frontend: http://localhost:3000 (only exposed service)

### Database Access

Development mode:
```bash
# Via Adminer web interface
open http://localhost:8080

# Via psql
docker exec -it echolens-postgres psql -U echolens -d echolens

# Via host (if postgres client installed)
PGPASSWORD=echolens_dev psql -h localhost -U echolens -d echolens
```

Production mode:
```bash
# Via docker exec only
docker exec -it echolens-postgres psql -U echolens -d echolens
```

## Troubleshooting

### Port Conflicts
If you see "port already in use" errors:
```bash
# Check what's using the port
lsof -i :3000
lsof -i :8000

# Stop conflicting processes or change ports in docker-compose files
```

### Container Issues
```bash
# Restart all containers (development)
./scripts/stop-dev.sh && ./scripts/start-dev.sh

# Rebuild containers (after code changes)
docker compose -f docker-compose.dev.yaml down
docker compose -f docker-compose.dev.yaml build --no-cache
docker compose -f docker-compose.dev.yaml up -d
```

### Database Reset
```bash
# ⚠️ WARNING: This deletes all data
docker compose -f docker-compose.dev.yaml down -v
./scripts/start-dev.sh
```

## Development Workflow

1. Start services: `./scripts/start-dev.sh`
2. Make code changes (changes are hot-reloaded via volume mounts)
3. View logs: `docker compose -f docker-compose.dev.yaml logs -f echolens-backend`
4. Access services via localhost ports
5. Stop when done: `./scripts/stop-dev.sh`

## Production Deployment

1. Set strong passwords in `.env`:
   - `POSTGRES_PASSWORD`
   - `REDIS_PASSWORD`
2. Update `NEXT_PUBLIC_API_URL` to your backend domain
3. Build and start: `./scripts/start.sh`
4. Set up reverse proxy (nginx/caddy) for HTTPS
5. Configure firewall to only allow port 3000 (or your proxy port)
