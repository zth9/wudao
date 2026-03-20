#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_DIR="$ROOT_DIR/workspace"
LOCAL_UV_DIR="$WORKSPACE_DIR/tools/uv"
LOCAL_UV_BIN="$LOCAL_UV_DIR/uv"

mkdir -p "$WORKSPACE_DIR"

if [[ -x "$LOCAL_UV_BIN" ]]; then
  exit 0
fi

if command -v uv >/dev/null 2>&1; then
  exit 0
fi

if ! command -v curl >/dev/null 2>&1; then
  cat <<'EOF'
[Wudao] Missing required dependency: curl

`pnpm install` can bootstrap a project-local `uv`, but `curl` is required
to download the official installer first.
EOF
  exit 1
fi

mkdir -p "$LOCAL_UV_DIR"

echo "[Wudao] uv not found in PATH. Installing a project-local copy into workspace/tools/uv..."
curl -LsSf https://astral.sh/uv/install.sh | env UV_UNMANAGED_INSTALL="$LOCAL_UV_DIR" sh

if [[ ! -x "$LOCAL_UV_BIN" ]]; then
  echo "[Wudao] Failed to install project-local uv into $LOCAL_UV_DIR" >&2
  exit 1
fi

echo "[Wudao] Installed project-local uv at $LOCAL_UV_BIN"
