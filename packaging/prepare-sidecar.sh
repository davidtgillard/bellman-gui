#!/usr/bin/env bash
set -euo pipefail

# Tauri externalBin sidecars must exist before any cargo build/test in src-tauri.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${ROOT}/src-tauri/binaries"
TARGET_TRIPLE="$(rustc --print host-tuple)"
DEST="${BIN_DIR}/bellman-${TARGET_TRIPLE}"

mkdir -p "${BIN_DIR}"

if [[ ! -x "${DEST}" ]]; then
  cp "${ROOT}/packaging/bellman-sidecar-stub.sh" "${DEST}"
  chmod +x "${DEST}"
  echo "Installed stub sidecar at ${DEST}"
fi

if [[ "${TARGET_TRIPLE}" != "x86_64-unknown-linux-gnu" ]]; then
  echo "Sidecar download is only configured for linux-x86_64; keeping stub." >&2
  exit 0
fi

VERSION="${BELLMAN_VERSION:-0.1.0}"
URL="https://github.com/davidtgillard/bellman/releases/download/dev/bellman-${VERSION}-linux-x86_64"

echo "Attempting to download bellman sidecar from ${URL}"
if curl -fsSL --max-time 5 -o "${DEST}.download" "${URL}"; then
  mv "${DEST}.download" "${DEST}"
  chmod +x "${DEST}"
  echo "Installed sidecar at ${DEST}"
else
  rm -f "${DEST}.download"
  echo "Download failed; keeping stub sidecar at ${DEST}" >&2
fi
