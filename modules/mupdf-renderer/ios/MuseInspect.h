#ifndef MUSE_INSPECT_H
#define MUSE_INSPECT_H

#include <stdint.h>

typedef struct {
  int ok;
  int page_count;
  char fingerprint[65]; /* lowercase hex SHA-256 */
  char code[32];        /* set when ok == 0; one of the codes in the native module contract */
} MuseInspection;

/*
 * Inspects one file. Blocks until done. At most 2 inspections run at once; the rest wait for a
 * slot and can still be cancelled while waiting.
 *
 * operation_id must be non-empty, shorter than 96 bytes, and not used by another running or
 * queued operation; otherwise the result is "invalid_request". More than 128 running or queued
 * operations yields "too_many_operations". max_bytes < 0 means no limit; the limit is checked up
 * front and again while streaming. Only regular files are read.
 *
 * The file is opened once: the same handle is hashed and then parsed, so the fingerprint always
 * describes the bytes MuPDF read. Cancellation is cooperative: it is checked between 64 KB reads,
 * before opening the document and after it opens. MuPDF's own parse cannot be interrupted, so a
 * cancel during the parse (including a repair scan of a damaged file) takes effect when it returns.
 */
void muse_inspect(const char *operation_id, const char *path, int64_t max_bytes, MuseInspection *out);

/*
 * Cancels the named operation, whether it is running or queued. If the operation has not started
 * yet, the cancel is remembered (bounded, oldest dropped) and applies when it does. Unknown or
 * finished operations are ignored.
 */
void muse_cancel(const char *operation_id);

#ifdef MUSE_TESTING
/* Test hooks, compiled only into the host tests. */
int muse_debug_peak_concurrency(void);
void muse_debug_reset_peak_concurrency(void);
#endif

#endif
