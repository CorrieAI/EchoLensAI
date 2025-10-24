#!/bin/bash

# EchoLens - Start Script (Production Mode)
# Bring Podcasts Into Focus
# Starts all services in PRODUCTION mode via Docker Compose

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🚀 Starting EchoLens in PRODUCTION mode..."
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

# Start services
echo "🐳 Starting Docker containers..."
docker compose -f docker-compose.yaml up -d --build

# Wait for services to be ready
echo "   ⏳ Waiting for services to be ready..."
sleep 5

# Show container status
echo ""
echo "📊 Container Status:"
docker compose -f docker-compose.yaml ps
echo ""

# Load port variables from .env (with defaults)
source .env 2>/dev/null || true
FRONTEND_PORT=${FRONTEND_PORT:-3000}

echo "✅ EchoLens is running in PRODUCTION mode!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 Access Points:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Frontend:  http://localhost:${FRONTEND_PORT}"
echo ""
echo "📝 View Logs:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   All:       docker compose logs -f"
echo "   Backend:   docker compose logs -f echolens-backend"
echo "   Frontend:  docker compose logs -f echolens-frontend"
echo "   Celery:    docker compose logs -f celery-worker"
echo ""
echo "ℹ️  Production Mode Features:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   • Optimized builds (no hot-reload)"
echo "   • No debug tools exposed"
echo "   • Production-ready configuration"
echo "   • Smaller container sizes"
echo ""
echo "🛑 Stop with: ./scripts/stop.sh"
echo "💻 For development with hot-reload: ./scripts/start-dev.sh"
echo ""
