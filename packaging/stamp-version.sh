#!/usr/bin/env bash
# Stamp a release version into package.json, tauri.conf.json, and Cargo.toml.
# Usage: bash packaging/stamp-version.sh 0.1.42
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:?usage: stamp-version.sh <semver>}"

if ! [[ "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-].*)?$ ]]; then
  echo "Invalid version: ${VERSION}" >&2
  exit 1
fi

node -e "
const fs = require('fs');
const path = process.argv[1];
const version = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
pkg.version = version;
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
" "${ROOT}/package.json" "${VERSION}"

node -e "
const fs = require('fs');
const path = process.argv[1];
const version = process.argv[2];
const conf = JSON.parse(fs.readFileSync(path, 'utf8'));
conf.version = version;
fs.writeFileSync(path, JSON.stringify(conf, null, 2) + '\n');
" "${ROOT}/src-tauri/tauri.conf.json" "${VERSION}"

python3 - "${ROOT}/src-tauri/Cargo.toml" "${VERSION}" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
version = sys.argv[2]
text = path.read_text()
updated, count = re.subn(
    r'(?m)^(version\s*=\s*")[^"]*(")',
    rf'\g<1>{version}\2',
    text,
    count=1,
)
if count != 1:
    raise SystemExit(f"failed to update version in {path}")
path.write_text(updated)
PY

echo "Stamped version ${VERSION}"
