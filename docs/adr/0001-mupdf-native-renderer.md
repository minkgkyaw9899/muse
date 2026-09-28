# Use a local Expo module for the MuPDF renderer

Muse will integrate MuPDF's C library behind an iOS-first local Expo module rather than rendering PDFs in JavaScript or editing generated native projects. The module owns document lifetimes, scheduling, cancellation, and caching behind a small typed interface; CNG keeps the app's root native projects reproducible. Distribution remains blocked until the project explicitly accepts AGPL obligations or obtains a commercial MuPDF license, and the selected MuPDF release is pinned and checksummed.
