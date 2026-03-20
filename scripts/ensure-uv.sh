#!/usr/bin/env bash
set -euo pipefail

if command -v uv >/dev/null 2>&1; then
  exit 0
fi

cat <<'EOF'
[Wudao] Missing required dependency: uv

`pnpm install` now prepares the Python environment for `packages/server`,
but it still expects the `uv` CLI to be installed on the host first.

Install `uv`, then rerun `pnpm install`.

macOS (Homebrew):
  brew install uv

Official installer:
  curl -LsSf https://astral.sh/uv/install.sh | sh
EOF

exit 1
