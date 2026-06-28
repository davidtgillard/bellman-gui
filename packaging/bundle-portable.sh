#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('${ROOT}/package.json').version")"
TARGET_TRIPLE="$(rustc --print host-tuple)"
RELEASE_NAME="bellman-gui-${VERSION}-linux-x86_64"
STAGING="${ROOT}/dist/portable/${RELEASE_NAME}"
RELEASE_DIR="${ROOT}/dist/release"
SIDECAR_BIN="${ROOT}/src-tauri/binaries/bellman-${TARGET_TRIPLE}"

mkdir -p "${STAGING}" "${RELEASE_DIR}"

GUI_BIN="${TAURI_BIN:-}"
if [[ -z "${GUI_BIN}" && -x "${ROOT}/src-tauri/target/release/bellman-gui" ]]; then
  GUI_BIN="${ROOT}/src-tauri/target/release/bellman-gui"
fi
if [[ -z "${GUI_BIN}" && -n "${CARGO_TARGET_DIR:-}" && -x "${CARGO_TARGET_DIR}/release/bellman-gui" ]]; then
  GUI_BIN="${CARGO_TARGET_DIR}/release/bellman-gui"
fi

if [[ -z "${GUI_BIN}" ]]; then
  echo "Missing release binary; run npm run tauri build -- --no-bundle first." >&2
  exit 1
fi

cp "${GUI_BIN}" "${STAGING}/bellman-gui"
chmod +x "${STAGING}/bellman-gui"

if [[ -x "${SIDECAR_BIN}" ]]; then
  cp "${SIDECAR_BIN}" "${STAGING}/bellman"
  chmod +x "${STAGING}/bellman"
else
  echo "Warning: sidecar not found at ${SIDECAR_BIN}; bundle will omit bellman." >&2
fi

cat > "${STAGING}/README.txt" <<EOF
Bellman GUI ${VERSION} (linux-x86_64)

Run ./bellman-gui to start the desktop graph viewer.

Requires WebKitGTK on Linux. The bundled bellman CLI sidecar is optional
for graph loading but enables future sync/export features.
EOF

ARCHIVE="${RELEASE_DIR}/${RELEASE_NAME}.tar.gz"
tar -C "${STAGING%/*}" -czf "${ARCHIVE}" "${RELEASE_NAME}"
(
  cd "${RELEASE_DIR}"
  sha256sum "$(basename "${ARCHIVE}")" > "$(basename "${ARCHIVE}").sha256"
)

echo "Created ${ARCHIVE}"
