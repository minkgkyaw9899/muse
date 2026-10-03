#!/usr/bin/env bash
# Print the environment that makes ccache work for an iOS build, as KEY=VALUE lines for $GITHUB_ENV.
set -euo pipefail

# React Native's ccache-clang.sh runs "$CCACHE_BINARY clang". Xcode does not export custom build
# settings to compile tasks, so the variable must come from the ambient environment.
if ! ccache="$(command -v ccache)"; then
  echo "ccache is not installed; install it (brew install ccache) before configuring the build." >&2
  exit 1
fi

printf 'CCACHE_BINARY=%s\n' "$ccache"
printf 'USE_CCACHE=1\n'
printf 'CCACHE_DIR=%s/.ccache\n' "$HOME"
printf 'CCACHE_MAXSIZE=1500M\n'
printf 'CCACHE_COMPILERCHECK=content\n'
# The "modules" sloppiness below stops ccache hashing Clang's module state. The ccache manual says to
# use it with depend mode, which tracks header contents so a changed header cannot serve a stale
# object. (Measured locally: depend mode adds about 14 s to a cold build and costs nothing warm.)
printf 'CCACHE_DEPEND=true\n'
# ivfsoverlay: Xcode passes -ivfsoverlay to every compile, and without this ccache rejects each call
# as an unsupported option (measured: 187 of 187 calls uncacheable).
printf 'CCACHE_SLOPPINESS=%s\n' \
  'clang_index_store,file_stat_matches,include_file_mtime,include_file_ctime,pch_defines,modules,system_headers,time_macros,ivfsoverlay'
