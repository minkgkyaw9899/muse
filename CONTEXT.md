# Muse reader

Muse organizes locally imported publications and preserves each reader's place without requiring an account or network connection.

## Language

**Publication**:
A user-imported readable file managed by Muse. PDF is the first supported format.
_Avoid_: Book, document, item

**Library**:
The user's collection of imported publications and their reading metadata.
_Avoid_: Bookshelf, catalog, database

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
