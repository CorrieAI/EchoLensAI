#!/bin/bash

# EchoLens - Start Script (Development Mode)
# Bring Podcasts Into Focus
# Starts all services in DEVELOPMENT mode with hot-reload and debug tools

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🚀 Starting EchoLens in DEVELOPMENT mode..."
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found. Creating from .env.example..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "   Please edit .env with your configuration"
        echo ""
    else
        echo "   ❌ .env.example not found. Please create .env manually"
        exit 1
    fi
fi

# Create necessary directories
mkdir -p echolens_data/uploads
mkdir -p echolens_data/exports
mkdir -p task_logs

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker first."
    exit 1
fi

# Check if docker compose is available
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose not found. Please install Docker Compose first."
    exit 1
fi

# Rebuild services
echo "🔨 Rebuilding Docker images..."
docker compose -f docker-compose.dev.yaml build

# Start services
echo "🐳 Starting Docker containers..."
docker compose -f docker-compose.dev.yaml up -d

# Wait for services to be ready
echo "   ⏳ Waiting for services to be ready..."
sleep 5

# Show container status
echo ""
echo "📊 Container Status:"
docker compose -f docker-compose.dev.yaml ps
echo ""

# Load port variables from .env (with defaults)
source .env 2>/dev/null || true
FRONTEND_PORT=${FRONTEND_PORT:-3000}
BACKEND_PORT=${BACKEND_PORT:-8000}
ADMINER_PORT=${ADMINER_PORT:-8080}

echo "✅ EchoLens is running in DEVELOPMENT mode!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 Access Points:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Frontend:  http://localhost:${FRONTEND_PORT}"
echo "   Backend:   http://localhost:${BACKEND_PORT}"
echo "   API Docs:  http://localhost:${BACKEND_PORT}/docs (Interactive Swagger UI)"
echo "   ReDoc:     http://localhost:${BACKEND_PORT}/redoc (Alternative API docs)"
echo "   Adminer:   http://localhost:${ADMINER_PORT} (Database admin tool)"
echo ""
echo "📝 View Logs:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   All:       docker compose -f docker-compose.dev.yaml logs -f"
echo "   Backend:   docker compose -f docker-compose.dev.yaml logs -f echolens-backend"
echo "   Frontend:  docker compose -f docker-compose.dev.yaml logs -f echolens-frontend"
echo "   Celery:    docker compose -f docker-compose.dev.yaml logs -f celery-worker"
echo "   Postgres:  docker compose -f docker-compose.dev.yaml logs -f postgres"
echo "   Redis:     docker compose -f docker-compose.dev.yaml logs -f redis"
echo ""
echo "ℹ️  Development Mode Features:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   • Hot-reload enabled (code changes auto-refresh)"
echo "   • Volume mounts for live code editing"
echo "   • Debug tools: API docs, Adminer, detailed logs"
echo "   • Backend/DB directly accessible for debugging"
echo "   • Faster startup (no build required)"
echo ""
echo "🛑 Stop with: ./scripts/stop-dev.sh"
echo "🏭 For production build: ./scripts/start.sh"
echo ""
