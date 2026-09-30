# Muse reader

Muse organizes locally imported publications and preserves each reader's place without requiring an account or network connection.

## Language

**Publication**:
A user-imported readable file managed by Muse. PDF is the first supported format.
_Avoid_: Book, document, item

**Library**:
The user's collection of imported publications and their reading metadata.
_Avoid_: Bookshelf, catalog, database

**Favorite**:
A publication the reader has marked for quick access in the Favorites collection. It is distinct from a bookmark, which marks a page within a publication.
_Avoid_: Favorite bookmark, starred page

**Reading position**:
The last stable location a reader reached in a publication, represented by page index and viewport state where applicable.
_Avoid_: Progress, current page

**Bookmark**:
A reader-created marker for a page in one publication, optionally carrying a short label.
_Avoid_: Favorite, saved page

**Reading mode**:
The spatial navigation model used by the reader: horizontal paginated or vertical continuous.
_Avoid_: Scroll type, layout mode

**Import**:
The act of selecting a publication through the operating system and copying it into Muse-managed storage.
_Avoid_: Open by path, upload

**Page rendition**:
A raster result for a page, scale, color mode, and render-engine version.
_Avoid_: Screenshot, image

**Inspection**:
A bounded read of a local PDF's metadata (page count and fingerprint) before it becomes a publication. It renders no pages.
_Avoid_: Scan, parse, validate

**Fingerprint**:
The SHA-256 of a publication file's bytes, used as its stable content identity and for duplicate detection.
_Avoid_: Hash, checksum, ID
