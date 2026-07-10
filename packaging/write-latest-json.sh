#!/usr/bin/env bash
# Build Tauri updater latest.json for the linux-x86_64 AppImage on the dev release.
# Usage:
#   bash packaging/write-latest-json.sh \
#     --version 0.1.42 \
#     --appimage path/to/bellman-gui_0.1.42_amd64.AppImage \
#     --sig path/to/bellman-gui_0.1.42_amd64.AppImage.sig \
#     --repo davidtgillard/bellman-gui \
#     --out dist/release/latest.json
set -euo pipefail

VERSION=""
APPIMAGE=""
SIG=""
REPO="davidtgillard/bellman-gui"
TAG="dev"
OUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="${2:?}"; shift 2 ;;
    --appimage) APPIMAGE="${2:?}"; shift 2 ;;
    --sig) SIG="${2:?}"; shift 2 ;;
    --repo) REPO="${2:?}"; shift 2 ;;
    --tag) TAG="${2:?}"; shift 2 ;;
    --out) OUT="${2:?}"; shift 2 ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${VERSION}" || -z "${APPIMAGE}" || -z "${SIG}" || -z "${OUT}" ]]; then
  echo "Required: --version --appimage --sig --out" >&2
  exit 1
fi

if [[ ! -f "${APPIMAGE}" ]]; then
  echo "AppImage not found: ${APPIMAGE}" >&2
  exit 1
fi
if [[ ! -f "${SIG}" ]]; then
  echo "Signature not found: ${SIG}" >&2
  exit 1
fi

ASSET_NAME="$(basename "${APPIMAGE}")"
URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET_NAME}"
SIGNATURE="$(tr -d '\n\r' < "${SIG}")"
PUB_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

mkdir -p "$(dirname "${OUT}")"

python3 - "${OUT}" "${VERSION}" "${URL}" "${SIGNATURE}" "${PUB_DATE}" <<'PY'
import json
import sys
from pathlib import Path

out, version, url, signature, pub_date = sys.argv[1:6]
payload = {
    "version": version,
    "notes": f"Rolling development AppImage {version}",
    "pub_date": pub_date,
    "platforms": {
        "linux-x86_64": {
            "signature": signature,
            "url": url,
        }
    },
}
Path(out).write_text(json.dumps(payload, indent=2) + "\n")
print(f"Wrote {out}")
PY
