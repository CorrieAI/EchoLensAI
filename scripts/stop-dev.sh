#!/bin/bash

# EchoLens - Stop Script (Development Mode)
# Bring Podcasts Into Focus
# Stops and removes development containers (preserves data volumes)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🛑 Stopping EchoLens (Development Mode)..."
echo ""

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found."
    exit 1
fi

# Stop and remove development compose
if docker compose -f docker-compose.dev.yaml ps 2>/dev/null | grep -q "Up"; then
    echo "🐳 Stopping and removing development containers..."
    docker compose -f docker-compose.dev.yaml down
    echo ""
    echo "✅ EchoLens development containers stopped and removed"
    echo "   (Data volumes preserved - use ./scripts/full-reset.sh to delete data)"
else
    echo "ℹ️  No development containers were running"
    echo "   (Try ./scripts/stop.sh if you're running production mode)"
fi
echo ""
