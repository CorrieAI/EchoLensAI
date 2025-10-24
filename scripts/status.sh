#!/bin/bash

# EchoLens - Status Script
# Check Docker container status

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "📊 EchoLens Status"
echo ""

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found."
    exit 1
fi

# Check development containers
echo "🔵 Development Mode (docker-compose.dev.yaml):"
if docker compose -f docker-compose.dev.yaml ps 2>/dev/null | grep -q "Up"; then
    docker compose -f docker-compose.dev.yaml ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    echo "✅ Development services are running"
    echo ""
    echo "🌐 Access Points:"
    echo "   Frontend:  http://localhost:3000"
    echo "   Backend:   http://localhost:8000"
    echo "   API Docs:  http://localhost:8000/docs"
    echo "   Adminer:   http://localhost:8080"
    echo ""
    echo "📝 View logs: docker compose -f docker-compose.dev.yaml logs -f"
    echo "🛑 Stop:      ./scripts/stop-dev.sh"
    exit 0
else
    echo "   ❌ Not running"
    echo ""
fi

# Check production containers
echo "🟢 Production Mode (docker-compose.yaml):"
if docker compose -f docker-compose.yaml ps 2>/dev/null | grep -q "Up"; then
    docker compose -f docker-compose.yaml ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    echo "✅ Production services are running"
    echo ""
    echo "🌐 Access Point:"
    echo "   Frontend:  http://localhost:3000"
    echo ""
    echo "📝 View logs: docker compose -f docker-compose.yaml logs -f"
    echo "🛑 Stop:      ./scripts/stop.sh"
    exit 0
else
    echo "   ❌ Not running"
    echo ""
fi

echo "❌ No services running"
echo ""
echo "🚀 Start services:"
echo "   Development: ./scripts/start-dev.sh"
echo "   Production:  ./scripts/start.sh"
exit 1
