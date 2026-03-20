#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_UV_BIN="$ROOT_DIR/workspace/tools/uv/uv"

if [[ -x "$LOCAL_UV_BIN" ]]; then
  exec "$LOCAL_UV_BIN" "$@"
fi

if command -v uv >/dev/null 2>&1; then
  exec "$(command -v uv)" "$@"
fi

"$ROOT_DIR/scripts/ensure-uv.sh"

if [[ -x "$LOCAL_UV_BIN" ]]; then
  exec "$LOCAL_UV_BIN" "$@"
fi

if command -v uv >/dev/null 2>&1; then
  exec "$(command -v uv)" "$@"
fi

echo "[Wudao] Unable to locate uv after bootstrap" >&2
exit 1
