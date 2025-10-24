#!/bin/bash

# EchoLens - Restart Script
# Bring Podcasts Into Focus
# Restarts all Docker services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Determine which compose file to use
COMPOSE_FILE="docker-compose.dev.yaml"
if [ "$1" == "--prod" ] || [ "$1" == "-p" ]; then
    COMPOSE_FILE="docker-compose.yaml"
    echo "🔄 Restarting EchoLens in PRODUCTION mode..."
else
    echo "🔄 Restarting EchoLens in DEVELOPMENT mode..."
fi
echo ""

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found."
    exit 1
fi

# Check if any containers are running
if docker compose -f "$COMPOSE_FILE" ps 2>/dev/null | grep -q "Up"; then
    echo "🐳 Restarting Docker containers..."
    docker compose -f "$COMPOSE_FILE" restart

    echo ""
    echo "⏳ Waiting for services to be ready..."
    sleep 3

    echo ""
    echo "📊 Container Status:"
    docker compose -f "$COMPOSE_FILE" ps
    echo ""

    echo "✅ EchoLens restarted successfully!"
    echo ""
    echo "🌐 Access the application:"
    echo "   Frontend:  http://localhost:3000"
    if [ "$COMPOSE_FILE" == "docker-compose.dev.yaml" ]; then
        echo "   Backend:   http://localhost:8000"
        echo "   API Docs:  http://localhost:8000/docs"
        echo "   Adminer:   http://localhost:8080"
    fi
else
    echo "ℹ️  No containers running. Use ./scripts/start.sh to start services."
    exit 1
fi
