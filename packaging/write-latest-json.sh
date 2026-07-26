#!/usr/bin/env bash
# Build Tauri updater latest.json for the rolling dev release.
# Usage:
#   bash packaging/write-latest-json.sh \
#     --version 0.1.42 \
#     --repo davidtgillard/bellman-gui \
#     --out dist/release/latest.json \
#     --platform linux-x86_64 path/to.AppImage path/to.AppImage.sig \
#     --platform windows-x86_64 path/to-setup.exe path/to-setup.exe.sig \
#     --platform darwin-aarch64 path/to.app.tar.gz path/to.app.tar.gz.sig
set -euo pipefail

VERSION=""
REPO="davidtgillard/bellman-gui"
TAG="dev"
OUT=""
PLATFORM_ARGS=()
APPIMAGE=""
LEGACY_SIG=""

add_platform() {
  local key="$1"
  local artifact="$2"
  local sig="$3"
  if [[ ! -f "${artifact}" ]]; then
    echo "Artifact not found: ${artifact}" >&2
    exit 1
  fi
  if [[ ! -f "${sig}" ]]; then
    echo "Signature not found: ${sig}" >&2
    exit 1
  fi
  PLATFORM_ARGS+=("${key}" "${artifact}" "${sig}")
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="${2:?}"; shift 2 ;;
    --repo) REPO="${2:?}"; shift 2 ;;
    --tag) TAG="${2:?}"; shift 2 ;;
    --out) OUT="${2:?}"; shift 2 ;;
    --platform)
      add_platform "${2:?}" "${3:?}" "${4:?}"
      shift 4
      ;;
    --appimage)
      APPIMAGE="${2:?}"
      shift 2
      ;;
    --sig)
      LEGACY_SIG="${2:?}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -n "${APPIMAGE}" ]]; then
  if [[ -z "${LEGACY_SIG}" ]]; then
    echo "Legacy --appimage requires --sig" >&2
    exit 1
  fi
  add_platform "linux-x86_64" "${APPIMAGE}" "${LEGACY_SIG}"
fi

if [[ -z "${VERSION}" || -z "${OUT}" ]]; then
  echo "Required: --version --out and at least one --platform (or --appimage/--sig)" >&2
  exit 1
fi

if [[ "${#PLATFORM_ARGS[@]}" -eq 0 ]]; then
  echo "No platforms provided" >&2
  exit 1
fi

PUB_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
mkdir -p "$(dirname "${OUT}")"

python3 - "${OUT}" "${VERSION}" "${PUB_DATE}" "${REPO}" "${TAG}" "${PLATFORM_ARGS[@]}" <<'PY'
import json
import sys
from pathlib import Path

out, version, pub_date, repo, tag = sys.argv[1:6]
rest = sys.argv[6:]
if len(rest) % 3 != 0 or not rest:
    raise SystemExit("platforms must be triples of key artifact sig")

platforms = {}
for i in range(0, len(rest), 3):
    key, artifact, sig_path = rest[i : i + 3]
    artifact_path = Path(artifact)
    sig_file = Path(sig_path)
    if not artifact_path.is_file():
        raise SystemExit(f"Artifact not found: {artifact}")
    if not sig_file.is_file():
        raise SystemExit(f"Signature not found: {sig_path}")
    asset_name = artifact_path.name
    platforms[key] = {
        "signature": sig_file.read_text().replace("\n", "").replace("\r", ""),
        "url": f"https://github.com/{repo}/releases/download/{tag}/{asset_name}",
    }

payload = {
    "version": version,
    "notes": f"Rolling development build {version}",
    "pub_date": pub_date,
    "platforms": platforms,
}
Path(out).write_text(json.dumps(payload, indent=2) + "\n")
print(f"Wrote {out} with platforms: {', '.join(sorted(platforms))}")
PY
