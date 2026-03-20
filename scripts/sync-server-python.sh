#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$ROOT_DIR/packages/server"
WORKSPACE_DIR="$ROOT_DIR/workspace"
UV_CACHE_DIR="$WORKSPACE_DIR/uv-cache"

mkdir -p "$UV_CACHE_DIR"

export UV_CACHE_DIR

echo "[Wudao] Syncing Python environment for packages/server with uv..."
"$ROOT_DIR/scripts/uv.sh" sync --project "$SERVER_DIR" --locked --all-groups
