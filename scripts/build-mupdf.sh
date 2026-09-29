#!/usr/bin/env bash
# Builds MuPDF.xcframework (iOS device arm64 + simulator arm64) from a pinned, checksummed source
# archive into modules/mupdf-renderer/ios/Frameworks. Development and CI test builds only:
# MuPDF is AGPL-3.0 and must not ship until docs/adr/0001-mupdf-native-renderer.md accepts a path.
# Without this framework the module compiles as a stub, so preview and production builds carry no MuPDF.
#
# Usage: scripts/build-mupdf.sh            download the pinned archive, verify, build the xcframework
#        scripts/build-mupdf.sh --host     build only the macOS library used by scripts/test-native.sh
#        MUPDF_TARBALL=/path/to.tar.gz scripts/build-mupdf.sh   use a local copy (still verified)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/mupdf-config.sh
. "$ROOT/scripts/mupdf-config.sh"
VERSION="$MUPDF_VERSION"
SHA256="$MUPDF_SHA256"
URL="$MUPDF_URL"
MIN_IOS="16.4"

OUT="$ROOT/modules/mupdf-renderer/ios/Frameworks/MuPDF.xcframework"
WORK="${MUPDF_WORKDIR:-$ROOT/.cache/mupdf-$VERSION}"
TARBALL="${MUPDF_TARBALL:-$WORK/mupdf-$VERSION-source.tar.gz}"

mkdir -p "$WORK"

if [ ! -f "$TARBALL" ]; then
  curl --fail --location --retry 3 --connect-timeout 20 --output "$TARBALL" "$URL"
fi
echo "$SHA256  $TARBALL" | shasum -a 256 --check --status || {
  echo "MuPDF archive checksum mismatch; refusing to build." >&2
  exit 1
}

# Reuse an extracted tree only if it came from an archive with the pinned checksum.
SRC="$WORK/src"
if [ ! -d "$SRC" ] || [ "$(cat "$SRC/.archive-sha256" 2>/dev/null)" != "$SHA256" ]; then
  rm -rf "$SRC"
  mkdir -p "$SRC"
  tar xzf "$TARBALL" -C "$SRC" --strip-components=1
  printf '%s' "$SHA256" > "$SRC/.archive-sha256"
fi

# The iOS SDK does not declare getentropy(); back it with the system CSPRNG. Upstream source stays untouched.
SHIM="$WORK/shim"
mkdir -p "$SHIM/sys"
cat > "$SHIM/sys/random.h" <<'HDR'
#include <stdlib.h>
static inline int getentropy(void *buf, size_t len)
{
	if (len > 256) return -1;
	arc4random_buf(buf, len);
	return 0;
}
HDR

build_slice() { # name sdk min-flag
  local name="$1" sdk="$2" minflag="$3" sysroot cc
  sysroot="$(xcrun --sdk "$sdk" --show-sdk-path)"
  cc="xcrun --sdk $sdk clang -arch arm64 -isysroot $sysroot $minflag=$MIN_IOS -I$SHIM"
  rm -rf "$SRC/build"
  make -C "$SRC" -j"$(sysctl -n hw.ncpu)" OS="ios-$name" build=release \
    HAVE_GLUT=no HAVE_X11=no HAVE_OBJCOPY=no HAVE_LIBCRYPTO=no HAVE_CURL=no USE_SYSTEM_LIBS=no \
    XCFLAGS="$MUPDF_XCFLAGS" CC="$cc" CXX="$cc" AR="xcrun ar" RANLIB="xcrun ranlib" libs
  mkdir -p "$WORK/$name"
  libtool -static -o "$WORK/$name/libmupdf-all.a" \
    "$SRC/build/release/libmupdf.a" "$SRC/build/release/libmupdf-third.a" 2> >(grep -v "has no symbols" >&2 || true)
}

if [ "${1:-}" = "--host" ]; then
  rm -rf "$SRC/build"
  make -C "$SRC" -j"$(sysctl -n hw.ncpu)" build=release \
    HAVE_GLUT=no HAVE_X11=no HAVE_LIBCRYPTO=no HAVE_CURL=no USE_SYSTEM_LIBS=no \
    XCFLAGS="$MUPDF_XCFLAGS" libs
  mkdir -p "$WORK/host"
  libtool -static -o "$WORK/host/libmupdf-all.a" \
    "$SRC/build/release/libmupdf.a" "$SRC/build/release/libmupdf-third.a" 2> >(grep -v "has no symbols" >&2 || true)
  mupdf_write_stamp "$WORK/host"
  echo "Built $WORK/host/libmupdf-all.a (MuPDF $VERSION, macOS)"
  exit 0
fi

build_slice device iphoneos -miphoneos-version-min
build_slice sim iphonesimulator -mios-simulator-version-min

rm -rf "$OUT"
xcodebuild -create-xcframework \
  -library "$WORK/device/libmupdf-all.a" -headers "$SRC/include" \
  -library "$WORK/sim/libmupdf-all.a" -headers "$SRC/include" \
  -output "$OUT"
echo "Built $OUT (MuPDF $VERSION)"
