# Use a local Expo module for the MuPDF renderer

Muse will integrate MuPDF's C library behind an iOS-first local Expo module rather than rendering PDFs in JavaScript or editing generated native projects. The module owns document lifetimes, scheduling, cancellation, and caching behind a small typed interface; CNG keeps the app's root native projects reproducible. Distribution remains blocked until the project explicitly accepts AGPL obligations or obtains a commercial MuPDF license, and the selected MuPDF release is pinned and checksummed.

## Build and gating (2026-09-29 spike)

The pinned release is MuPDF 1.28.5, SHA-256 `98a5c10cda20c3992cdf76ff6b2a1149c32bd79cc796d3f703230b1185b7e934`. `scripts/build-mupdf.sh` verifies the checksum, cross-compiles device and simulator slices, and writes `MuPDF.xcframework` into the local module. The framework is gitignored and never committed. When it is absent the module compiles as a stub with no MuPDF code, so builds only contain MuPDF when someone runs the script. Distribution remains blocked until this ADR is amended with an accepted AGPL or commercial-license decision.

The build defaults to MuPDF's font-trimming flags (no bundled Noto fonts, base-14 kept), which reduced an inspection-only binary from 38.1 MB to 6.1 MB. Flags and pins live in `scripts/mupdf-config.sh`. `tests/unit/mupdf-gate.test.ts` enforces that MuPDF binaries are never committed and that only allowlisted test workflows can build it.
