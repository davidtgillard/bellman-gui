#!/usr/bin/env sh

fail_fast=1
failed_checks=""

usage() {
  cat <<'EOF'
Usage: local-checks.sh [OPTIONS]

Run local quality checks for this project.

Options:
  --no-fail-fast  Continue running all checks even if one fails
  -h, --help      Show this help message
EOF
}

for arg in "$@"; do
  case "$arg" in
    --no-fail-fast)
      fail_fast=0
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

run_check() {
  name="$1"
  shift

  printf '==> %s\n' "$name"
  if "$@"; then
    return 0
  fi

  failed_checks="${failed_checks}  - ${name}
"
  if [ "$fail_fast" -eq 1 ]; then
    printf '\nCheck failed: %s\n' "$name" >&2
    exit 1
  fi
  return 1
}

# ---------------------------------------------------------------------------
# Checks — add, remove, or reorder entries below.
# Each line is: run_check "display name" command [args...]
# ---------------------------------------------------------------------------
run_check "run lint" npm run lint
run_check "run type-check" npm run type-check
run_check "run lint:throws-diff" npm run lint:throws-diff
run_check "run test" npm run test
run_check "cargo test" cargo test --manifest-path src-tauri/Cargo.toml
run_check "cargo clippy" cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
run_check "run test e2e" npm run test:e2e
run_check "audit" npm audit

if [ -n "$failed_checks" ]; then
  printf '\nThe following checks failed:\n%s' "$failed_checks" >&2
  exit 1
fi

printf '\nAll checks passed.\n'
