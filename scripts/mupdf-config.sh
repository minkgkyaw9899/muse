# Shared pins for the MuPDF scripts. Sourced by build-mupdf.sh, test-native.sh, and bench-native.sh.
MUPDF_VERSION="1.28.5"
MUPDF_SHA256="98a5c10cda20c3992cdf76ff6b2a1149c32bd79cc796d3f703230b1185b7e934"
MUPDF_URL="https://casper.mupdf.com/downloads/archive/mupdf-${MUPDF_VERSION}-source.tar.gz"

# Compile flags. The defaults leave out MuPDF's bundled Noto fonts (CJK, emoji, historic, symbol,
# SIL) and keep the base-14 fonts: inspection needs no fonts, and this cut the linked size of an
# inspection-only binary from 38.1 MB to 6.1 MB (docs/performance/0001-pdf-inspection.md).
# Revisit when the Reader renders text and needs fallback fonts. Override with MUPDF_XCFLAGS.
MUPDF_XCFLAGS="${MUPDF_XCFLAGS:--DTOFU -DTOFU_CJK -DTOFU_EMOJI -DTOFU_HISTORIC -DTOFU_SYMBOL -DTOFU_SIL}"

# Records which flags a cached library was built with, so a flag change forces a rebuild.
mupdf_stamp_matches() { [ -f "$1/.flags" ] && [ "$(cat "$1/.flags")" = "$MUPDF_VERSION $MUPDF_XCFLAGS" ]; }
mupdf_write_stamp() { mkdir -p "$1" && printf '%s' "$MUPDF_VERSION $MUPDF_XCFLAGS" > "$1/.flags"; }
