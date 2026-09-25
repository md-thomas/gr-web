#!/usr/bin/env bash
# Start the gr-web backend.
# Usage: ./start.sh [port] [--dir FOLDER] [--host ADDRESS] [--debug]
#   port    default 5050
#   --dir   folder flowgraphs are opened from and saved to (default ~/gr-web)
#   --host  address to listen on (default 0.0.0.0: reachable from the network;
#           127.0.0.1: this machine only)
#   --debug Flask debug mode (auto-reload); requires --host 127.0.0.1
set -euo pipefail

usage() {
    echo "Usage: $0 [port] [--dir FOLDER] [--host ADDRESS] [--debug]  (port must be 1-65535)" >&2
    exit 1
}

PORT=5050
FLOW_DIR=""
EXTRA=()
while (( $# )); do
    case "$1" in
        --dir) (( $# >= 2 )) || usage; FLOW_DIR="$2"; shift 2 ;;
        --dir=*) FLOW_DIR="${1#--dir=}"; shift ;;
        --host) (( $# >= 2 )) || usage; EXTRA+=(--host "$2"); shift 2 ;;
        --host=*) EXTRA+=(--host "${1#--host=}"); shift ;;
        --debug) EXTRA+=(--debug); shift ;;
        -h|--help) usage ;;
        *) PORT="$1"; shift ;;
    esac
done

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
    usage
fi

ARGS=(--port "$PORT" "${EXTRA[@]}")
if [ -n "$FLOW_DIR" ]; then
    # Resolve relative folders against where start.sh was run from
    [[ "$FLOW_DIR" = /* || "$FLOW_DIR" = "~"* ]] || FLOW_DIR="$PWD/$FLOW_DIR"
    ARGS+=(--dir "$FLOW_DIR")
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Build the frontend if it hasn't been built yet
if [ ! -f "$ROOT/frontend/dist/index.html" ]; then
    echo "Building frontend..."
    (cd "$ROOT/frontend" && npm install && npm run build)
fi

cd "$ROOT/backend"
exec python3 app.py "${ARGS[@]}"
