#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WEB_DEV_CMD="${WUDAO_WEB_DEV_CMD:-pnpm --filter web dev}"
SERVER_DEV_CMD="${WUDAO_SERVER_DEV_CMD:-pnpm --filter server dev}"

child_pids=()
stop_requested=0
script_exit_code=0

normalize_status() {
  local status="$1"
  case "$status" in
    0|129|130|143)
      echo "0"
      ;;
    *)
      echo "$status"
      ;;
  esac
}

start_dev_process() {
  local command="$1"
  (
    trap '' INT HUP
    exec bash -lc "$command"
  ) &
  child_pids+=("$!")
}

stop_children() {
  local signal="${1:-TERM}"
  if [[ "$stop_requested" -eq 1 ]]; then
    return
  fi
  stop_requested=1
  for pid in "${child_pids[@]}"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill -s "$signal" "$pid" 2>/dev/null || true
    fi
  done
}

handle_interrupt() {
  script_exit_code=0
  stop_children TERM
}

trap 'handle_interrupt' INT TERM HUP
trap 'stop_children TERM' EXIT

start_dev_process "$WEB_DEV_CMD"
start_dev_process "$SERVER_DEV_CMD"

while true; do
  all_done=1
  for index in "${!child_pids[@]}"; do
    pid="${child_pids[$index]}"
    if [[ -z "$pid" ]]; then
      continue
    fi
    if kill -0 "$pid" 2>/dev/null; then
      all_done=0
      continue
    fi

    set +e
    wait "$pid"
    status=$?
    set -e

    child_pids[$index]=""

    if [[ "$stop_requested" -eq 0 ]]; then
      normalized_status="$(normalize_status "$status")"
      if [[ "$normalized_status" -ne 0 && "$script_exit_code" -eq 0 ]]; then
        script_exit_code="$normalized_status"
      fi
      stop_children TERM
    fi
  done

  if [[ "$all_done" -eq 1 || "$stop_requested" -eq 1 ]]; then
    break
  fi
  sleep 0.2 || true
done

for index in "${!child_pids[@]}"; do
  pid="${child_pids[$index]}"
  if [[ -z "$pid" ]]; then
    continue
  fi

  set +e
  wait "$pid"
  status=$?
  set -e

  child_pids[$index]=""

  if [[ "$status" -eq 127 ]]; then
    continue
  fi

  if [[ "$stop_requested" -eq 0 ]]; then
    normalized_status="$(normalize_status "$status")"
    if [[ "$normalized_status" -ne 0 && "$script_exit_code" -eq 0 ]]; then
      script_exit_code="$normalized_status"
    fi
  fi
done

exit "$script_exit_code"
