#!/usr/bin/env bash
set -euo pipefail

# Kill any process listening on the given TCP ports (defaults: upload-service ports).
# Usage:
#   bash scripts/kill-ports.sh
#   bash scripts/kill-ports.sh 3007 3008 3009

ports=(3007 3008)
if [[ $# -gt 0 ]]; then
  ports=("$@")
fi

for port in "${ports[@]}"; do
  pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
  if [[ -z "$pids" ]]; then
    echo "Port ${port}: nothing listening"
    continue
  fi
  for pid in $pids; do
    if kill -9 "$pid" 2>/dev/null; then
      echo "Port ${port}: killed PID ${pid}"
    else
      echo "Port ${port}: could not kill PID ${pid} (may need sudo or it exited)" >&2
    fi
  done
done
