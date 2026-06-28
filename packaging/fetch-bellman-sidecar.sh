#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${ROOT}/src-tauri/binaries"
VERSION="${BELLMAN_VERSION:-0.1.0}"
TARGET_TRIPLE="$(rustc --print host-tuple)"
SIDECAR_NAME="bellman-${TARGET_TRIPLE}"
DEST="${BIN_DIR}/${SIDECAR_NAME}"
URL="https://github.com/davidtgillard/bellman/releases/download/dev/bellman-${VERSION}-linux-x86_64"

mkdir -p "${BIN_DIR}"

if [[ "${TARGET_TRIPLE}" != "x86_64-unknown-linux-gnu" ]]; then
  echo "Only linux-x86_64 sidecar downloads are configured; create ${DEST} manually." >&2
  exit 1
fi

echo "Downloading bellman sidecar from ${URL}"
if curl -fsSL -o "${DEST}" "${URL}"; then
  chmod +x "${DEST}"
  echo "Installed sidecar at ${DEST}"
else
  echo "Download failed; installing local stub sidecar instead." >&2
  cp "${ROOT}/packaging/bellman-sidecar-stub.sh" "${DEST}"
  chmod +x "${DEST}"
fi
