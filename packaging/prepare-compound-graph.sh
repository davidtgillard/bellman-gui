#!/usr/bin/env bash
set -euo pipefail

# @dgillard/cytoscape-compound-graph is linked via file:../cytoscope-compound-graph.git/...
# Local dev usually has that sibling checkout; CI and fresh clones need this script first.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONOREPO_DIR="$(cd "${ROOT}/.." && pwd)/cytoscope-compound-graph.git"
PACKAGE_DIR="${MONOREPO_DIR}/packages/cytoscape-compound-graph"
REF_FILE="${ROOT}/packaging/cytoscape-compound-graph.ref"
DEFAULT_REF="e6e681c134fb1fea8db194cd26aff59322c964af"
REF="$(tr -d '[:space:]' <"${REF_FILE}" 2>/dev/null || true)"
REF="${REF:-${DEFAULT_REF}}"

if [[ -f "${PACKAGE_DIR}/dist/index.d.ts" && -f "${PACKAGE_DIR}/dist/index.js" ]]; then
  echo "cytoscape-compound-graph already built at ${PACKAGE_DIR}"
  exit 0
fi

if [[ ! -d "${MONOREPO_DIR}/.git" ]]; then
  echo "Cloning cytoscope-compound-graph @ ${REF}"
  git clone --filter=blob:none https://github.com/davidtgillard/cytoscope-compound-graph.git "${MONOREPO_DIR}"
  git -C "${MONOREPO_DIR}" checkout "${REF}"
elif [[ -d "${MONOREPO_DIR}/.git" ]]; then
  echo "Using existing cytoscope-compound-graph checkout at ${MONOREPO_DIR}"
fi

echo "Building @dgillard/cytoscape-compound-graph"
(
  cd "${MONOREPO_DIR}"
  npm ci
  npm run build -w @dgillard/cytoscape-compound-graph
)
