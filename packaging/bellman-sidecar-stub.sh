#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "version" ]]; then
  echo "0.1.0 (sidecar stub)"
  exit 0
fi

echo "bellman sidecar stub: only 'version' is implemented" >&2
exit 1
