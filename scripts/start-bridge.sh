#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd "$(dirname "$0")" && pwd)"
ROOT="$(CDPATH= cd "$SCRIPT_DIR/.." && pwd)"
BRIDGE="$ROOT/apps/bridge/dist/index.js"
if [ ! -f "$BRIDGE" ]; then
  BRIDGE="$SCRIPT_DIR/dist/index.js"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js was not found. Please install Node.js 20 or later." >&2
  echo "  Download: https://nodejs.org/" >&2
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Error: Node.js version is too old. Node.js 20 or later is required." >&2
  echo "  Current: $(node --version)" >&2
  echo "  Download: https://nodejs.org/" >&2
  exit 1
fi

if [ ! -f "$BRIDGE" ]; then
  echo "Error: Bridge build output was not found: $BRIDGE" >&2
  echo "  Run these commands in the project root first:" >&2
  echo "    npm install" >&2
  echo "    npm run build" >&2
  exit 1
fi

REPO_BRIDGE="$ROOT/apps/bridge/dist/index.js"
if [ -f "$REPO_BRIDGE" ] && [ ! -d "$ROOT/node_modules" ]; then
  echo "Warning: node_modules was not found. Dependencies may be missing." >&2
  echo "  Suggested command: npm install" >&2
fi

exec node "$BRIDGE" "$@"
