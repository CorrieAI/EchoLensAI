#!/bin/bash

# EchoLens - Stop Script (Production Mode)
# Bring Podcasts Into Focus
# Stops and removes production containers (preserves data volumes)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🛑 Stopping EchoLens (Production Mode)..."
echo ""

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found."
    exit 1
fi

# Stop and remove production compose
if docker compose -f docker-compose.yaml ps 2>/dev/null | grep -q "Up"; then
    echo "🐳 Stopping and removing production containers..."
    docker compose -f docker-compose.yaml down
    echo ""
    echo "✅ EchoLens production containers stopped and removed"
    echo "   (Data volumes preserved - use ./scripts/full-reset.sh to delete data)"
else
    echo "ℹ️  No production containers were running"
    echo "   (Try ./scripts/stop-dev.sh if you're running development mode)"
fi
echo ""
