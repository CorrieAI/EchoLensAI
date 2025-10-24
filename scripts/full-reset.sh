#!/bin/bash

# EchoLens - Full Reset Script
# ⚠️  WARNING: This will DELETE ALL DATA including databases, volumes, and containers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found."
    exit 1
fi

echo "⚠️  ⚠️  ⚠️  DANGER ZONE ⚠️  ⚠️  ⚠️"
echo ""
echo "This will permanently delete:"
echo "  • All Docker containers (frontend, backend, celery, postgres, redis)"
echo "  • All Docker volumes (postgres data, redis data)"
echo "  • All local data directories (echolens_data/, task_logs/, logs/)"
echo "  • All podcast data, episodes, transcriptions, summaries"
echo "  • All audio files, uploads, and exports"
echo "  • All chat sessions and history"
echo "  • All task history and logs"
echo ""
echo "This action CANNOT be undone!"
echo ""

# Require explicit confirmation
read -p "Type 'DELETE ALL DATA' to confirm (or anything else to cancel): " CONFIRM

if [ "$CONFIRM" != "DELETE ALL DATA" ]; then
    echo ""
    echo "❌ Reset cancelled. No changes made."
    exit 0
fi

echo ""
echo "⚠️  Last chance! Are you absolutely sure?"
read -p "Type 'YES' to proceed: " FINAL_CONFIRM

if [ "$FINAL_CONFIRM" != "YES" ]; then
    echo ""
    echo "❌ Reset cancelled. No changes made."
    exit 0
fi

echo ""
echo "🗑️  Proceeding with full reset..."
echo ""

# Stop and remove development containers and volumes
echo "🛑 Stopping development containers..."
docker compose -f docker-compose.dev.yaml down -v --remove-orphans 2>/dev/null || true
echo "   ✓ Development containers and volumes removed"

# Stop and remove production containers and volumes
echo "🛑 Stopping production containers..."
docker compose -f docker-compose.yaml down -v --remove-orphans 2>/dev/null || true
echo "   ✓ Production containers and volumes removed"

# Stop and remove legacy containers and volumes (from archive)
if [ -d "archive/local-services" ]; then
    echo "🛑 Stopping legacy containers (if any)..."
    (cd archive/local-services && docker compose down -v --remove-orphans 2>/dev/null) || true
    echo "   ✓ Legacy containers cleaned"
fi

# Remove any remaining volumes with echolens or podmaxai prefix
echo ""
echo "🧹 Cleaning up Docker volumes..."
VOLUMES=$(docker volume ls -q | grep -E "(echolens|podmaxai)" || true)
if [ -n "$VOLUMES" ]; then
    echo "$VOLUMES" | xargs docker volume rm 2>/dev/null || true
    echo "   ✓ All Docker volumes removed"
else
    echo "   ✓ No Docker volumes found"
fi

# Clean up local data directories using Docker for proper permissions
echo ""
echo "🗑️  Removing local data directories..."

# Check if any directories exist
DIRS_EXIST=false
for dir in echolens_data task_logs logs .pids; do
    if [ -d "$dir" ]; then
        DIRS_EXIST=true
        break
    fi
done

if [ "$DIRS_EXIST" = true ]; then
    echo "   Using Docker to remove container-created files..."
    # Use Docker to remove directories created by containers (handles permission issues)
    docker run --rm \
        -v "$(pwd):/workdir" \
        -w /workdir \
        alpine:latest \
        sh -c "rm -rf echolens_data task_logs logs .pids" 2>/dev/null || true
    echo "   ✓ All container-created files removed via Docker"
fi

# Clean up any remaining directories (if Docker removal missed anything)
for dir in echolens_data task_logs logs .pids; do
    if [ -d "$dir" ]; then
        rm -rf "$dir" 2>/dev/null || true
    fi
done

echo "   ✓ All local data directories removed"

echo ""
echo "✅ Full reset complete!"
echo ""
echo "🚀 To start fresh:"
echo "   ./scripts/start-dev.sh  # Development mode"
echo "   ./scripts/start.sh      # Production mode"
