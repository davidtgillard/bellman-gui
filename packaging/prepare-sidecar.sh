#!/usr/bin/env bash
set -euo pipefail

# Tauri externalBin sidecars must exist before any cargo build/test in src-tauri.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${ROOT}/src-tauri/binaries"
TARGET_TRIPLE="$(rustc --print host-tuple)"
VERSION="${BELLMAN_VERSION:-0.1.0}"
# When REQUIRE_SIDECAR_DOWNLOAD=1 (CI/release), fail if the platform asset cannot be fetched.
REQUIRE_DOWNLOAD="${REQUIRE_SIDECAR_DOWNLOAD:-0}"

case "${TARGET_TRIPLE}" in
  x86_64-unknown-linux-gnu)
    ASSET="bellman-${VERSION}-linux-x86_64"
    DEST="${BIN_DIR}/bellman-${TARGET_TRIPLE}"
    ;;
  x86_64-pc-windows-msvc)
    ASSET="bellman-${VERSION}-windows-x86_64.exe"
    DEST="${BIN_DIR}/bellman-${TARGET_TRIPLE}.exe"
    ;;
  aarch64-apple-darwin)
    ASSET="bellman-${VERSION}-macos-arm64"
    DEST="${BIN_DIR}/bellman-${TARGET_TRIPLE}"
    ;;
  *)
    ASSET=""
    DEST="${BIN_DIR}/bellman-${TARGET_TRIPLE}"
    ;;
esac

mkdir -p "${BIN_DIR}"

install_stub() {
  # Shell stubs are not valid Windows executables.
  if [[ "${TARGET_TRIPLE}" == *-pc-windows-* ]]; then
    echo "No Windows sidecar stub available; place ${DEST} manually or download from the bellman dev release." >&2
    return 1
  fi
  if [[ ! -x "${DEST}" ]]; then
    cp "${ROOT}/packaging/bellman-sidecar-stub.sh" "${DEST}"
    chmod +x "${DEST}"
    echo "Installed stub sidecar at ${DEST}"
  fi
}

if [[ -z "${ASSET}" ]]; then
  if [[ "${REQUIRE_DOWNLOAD}" == "1" ]]; then
    echo "Sidecar download is not configured for host triple ${TARGET_TRIPLE}." >&2
    exit 1
  fi
  install_stub || true
  echo "Sidecar download is not configured for ${TARGET_TRIPLE}; keeping stub if present." >&2
  exit 0
fi

URL="https://github.com/davidtgillard/bellman/releases/download/dev/${ASSET}"

# Ensure a local binary exists before attempting download (except Windows, which needs a real .exe).
if [[ "${TARGET_TRIPLE}" != *-pc-windows-* ]]; then
  install_stub || true
fi

echo "Attempting to download bellman sidecar from ${URL}"
# 23MB+ asset; allow slow links. Partial downloads must not replace a good binary.
if curl -fsSL --connect-timeout 10 --max-time 120 -o "${DEST}.download" "${URL}"; then
  mv "${DEST}.download" "${DEST}"
  chmod +x "${DEST}" 2>/dev/null || true
  echo "Installed sidecar at ${DEST}"
  exit 0
fi

rm -f "${DEST}.download"

if [[ "${REQUIRE_DOWNLOAD}" == "1" ]]; then
  echo "Failed to download required sidecar from ${URL}" >&2
  exit 1
fi

if [[ -f "${DEST}" ]] && { [[ -x "${DEST}" ]] || [[ "${DEST}" == *.exe ]]; }; then
  echo "Download failed; keeping existing sidecar at ${DEST}" >&2
  exit 0
fi

if [[ "${TARGET_TRIPLE}" == *-pc-windows-* ]]; then
  echo "Download failed and no Windows sidecar is present at ${DEST}" >&2
  exit 1
fi

echo "Download failed; keeping stub sidecar at ${DEST}" >&2
