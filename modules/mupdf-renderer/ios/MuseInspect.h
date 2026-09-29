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
 * Inspects one file. Blocks until done. At most MUSE_MAX_CONCURRENT inspections run at once; the
 * rest wait for a slot and can still be cancelled while waiting.
 *
 * operation_id must be unique per operation. max_bytes < 0 means no limit.
 * Cancellation is cooperative: it is checked between 64 KB reads, before opening the document and
 * after it opens. MuPDF's own parse of one document cannot be interrupted.
 */
void muse_inspect(const char *operation_id, const char *path, int64_t max_bytes, MuseInspection *out);

/*
 * Cancels the named operation, whether it is running or queued. If the operation has not started
 * yet, the cancel is remembered (bounded, oldest dropped) and applies when it does. Unknown or
 * finished operations are ignored.
 */
void muse_cancel(const char *operation_id);

/* Test hooks. */
int muse_debug_peak_concurrency(void);
void muse_debug_reset_peak_concurrency(void);

#endif
