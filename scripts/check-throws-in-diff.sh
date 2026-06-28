#!/usr/bin/env bash
set -euo pipefail

BASE_REF="${1:-origin/main}"

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  echo "Base ref '$BASE_REF' not found; skipping throw documentation diff check."
  exit 0
fi

status=0

while IFS= read -r file; do
  [ -z "$file" ] && continue

  added_throws=$(
    git diff "$BASE_REF"...HEAD -- "$file" | grep '^+.*throw new' || true
  )
  [ -z "$added_throws" ] && continue

  added_throws_docs=$(
    git diff "$BASE_REF"...HEAD -- "$file" | grep '^+.*@throws' || true
  )
  if [ -z "$added_throws_docs" ]; then
    echo "ERROR: $file adds throw statement(s) without @throws in the same change:"
    echo "$added_throws"
    status=1
  fi
done < <(git diff --name-only "$BASE_REF"...HEAD -- '*.ts' '*.tsx')

if [ "$status" -ne 0 ]; then
  echo
  echo "Document new exceptions with @throws JSDoc tags."
  exit 1
fi

new_throws=$(
  git diff "$BASE_REF"...HEAD | grep '^+.*throw new' || true
)
if [ -n "$new_throws" ]; then
  echo "Verified @throws documentation for new throw statements in diff."
fi
