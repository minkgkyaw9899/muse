#!/usr/bin/env bash
# Decide how much work an iOS CI run needs.
#
# Input:  EVENT in the environment; changed file paths on standard input, one per line.
# Output: `run_build=<bool>` and `fresh=<bool>` lines, ready to append to $GITHUB_OUTPUT.
set -euo pipefail

changed="$(cat)"
run_build=true
fresh=false

# A change set made only of documentation never needs the macOS build.
if [ "${EVENT:-}" != "workflow_dispatch" ] && [ -n "$changed" ] && [ -z "$(printf '%s\n' "$changed" | grep -vE '^(docs/|.*\.md$)' || true)" ]; then
  run_build=false
fi

# Native inputs or a very large diff make a restored fallback cache more likely stale than useful.
total="$(printf '%s\n' "$changed" | grep -c . || true)"
if printf '%s\n' "$changed" | grep -Eq '^(bun\.lock|app\.json|eas\.json|modules/|plugins/)' || [ "$total" -gt 150 ]; then
  fresh=true
fi
if [ "${CLEAN_INPUT:-}" = "true" ]; then
  fresh=true
fi

echo "run_build=$run_build"
echo "fresh=$fresh"
