#!/bin/bash

# SuperNote startup script (Linux/macOS)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

BACKEND_PORT=3001
FRONTEND_PORT=3000

echo "Starting backend service (port $BACKEND_PORT)..."
(
  cd "$ROOT_DIR"
  PORT=$BACKEND_PORT npm run dev
) &
BACKEND_PID=$!

echo "Waiting for backend health check..."
sleep 5

echo "Starting frontend service (port $FRONTEND_PORT)..."
(
  cd "$ROOT_DIR/apps/web"
  npm run dev -- --port $FRONTEND_PORT --strictPort
) &
FRONTEND_PID=$!

echo "=========================================="
echo "SuperNote started"
echo "Frontend: http://localhost:$FRONTEND_PORT"
echo "Backend:  http://localhost:$BACKEND_PORT"
echo "Press Ctrl+C to stop all services"
echo "=========================================="

trap "kill $BACKEND_PID $FRONTEND_PID; exit" SIGINT SIGTERM

wait
