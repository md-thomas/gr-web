#!/usr/bin/env bash
# Start the gr-web backend. Usage: ./start.sh [port]   (default: 5050)
set -euo pipefail

PORT="${1:-5050}"
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
    echo "Usage: $0 [port]  (port must be 1-65535)" >&2
    exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Build the frontend if it hasn't been built yet
if [ ! -f "$ROOT/frontend/dist/index.html" ]; then
    echo "Building frontend..."
    (cd "$ROOT/frontend" && npm install && npm run build)
fi

# Run from backend/ so grc_block_info.json resolves
cd "$ROOT/backend"
exec python3 app.py --port "$PORT"
