#!/usr/bin/env bash
set -euo pipefail

# @dgillard/cytoscape-compound-graph is linked via file:../cytoscope-compound-graph.git/...
# Local dev usually has that sibling checkout; CI and fresh clones need this script first.
# The pinned commit lives in packaging/cytoscape-compound-graph.ref — bump it when
# bellman-gui needs newer package APIs (CI clones that SHA, not whatever is on main).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONOREPO_DIR="$(cd "${ROOT}/.." && pwd)/cytoscope-compound-graph.git"
PACKAGE_DIR="${MONOREPO_DIR}/packages/cytoscape-compound-graph"
REF_FILE="${ROOT}/packaging/cytoscape-compound-graph.ref"
DEFAULT_REF="01125b0de00b6d9fc05868cb387dd1b684e9a6aa"
REF="$(tr -d '[:space:]' <"${REF_FILE}" 2>/dev/null || true)"
REF="${REF:-${DEFAULT_REF}}"

need_build=1
if [[ -d "${MONOREPO_DIR}/.git" && -f "${PACKAGE_DIR}/dist/index.d.ts" && -f "${PACKAGE_DIR}/dist/index.js" ]]; then
  current="$(git -C "${MONOREPO_DIR}" rev-parse HEAD 2>/dev/null || true)"
  if [[ "${current}" == "${REF}" ]]; then
    echo "cytoscape-compound-graph already built at ${PACKAGE_DIR} (@ ${REF})"
    need_build=0
  fi
fi

if [[ "${need_build}" -eq 0 ]]; then
  exit 0
fi

if [[ ! -d "${MONOREPO_DIR}/.git" ]]; then
  echo "Cloning cytoscope-compound-graph @ ${REF}"
  git clone --filter=blob:none https://github.com/davidtgillard/cytoscope-compound-graph.git "${MONOREPO_DIR}"
else
  echo "Updating existing cytoscope-compound-graph checkout at ${MONOREPO_DIR}"
  git -C "${MONOREPO_DIR}" fetch --filter=blob:none origin "${REF}"
fi

git -C "${MONOREPO_DIR}" checkout --force "${REF}"

echo "Building @dgillard/cytoscape-compound-graph @ ${REF}"
(
  cd "${MONOREPO_DIR}"
  npm ci
  npm run build -w @dgillard/cytoscape-compound-graph
)
