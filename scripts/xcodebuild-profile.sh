#!/usr/bin/env bash
# Stand-in for xcodebuild that records where a build spends its time.
#
# Expo's `run:ios` formats xcodebuild's output and drops the build timing summary, so put this script
# first on PATH under the name `xcodebuild`. It adds -showBuildTimingSummary to builds, prints the
# output unchanged, and appends it to $XCODEBUILD_PROFILE_LOG. Queries such as -showBuildSettings pass
# through untouched. The exit status is the real xcodebuild's.
set -euo pipefail

real="${XCODEBUILD_REAL:-/usr/bin/xcodebuild}"

if [ -z "${XCODEBUILD_PROFILE_LOG:-}" ]; then
  exec "$real" "$@"
fi

for arg in "$@"; do
  case "$arg" in
    -showBuildSettings | -list | -version | -showsdks | -showdestinations | -usage)
      exec "$real" "$@"
      ;;
  esac
done

"$real" "$@" -showBuildTimingSummary | tee -a "$XCODEBUILD_PROFILE_LOG"
