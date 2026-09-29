#ifndef MUSE_INSPECT_H
#define MUSE_INSPECT_H

#include <stdint.h>

typedef struct {
  int ok;
  int page_count;
  char fingerprint[65]; /* lowercase hex SHA-256 */
  char code[32];        /* set when ok == 0; one of the codes in the native module contract */
} MuseInspection;

/* Spike: no cancellation yet. Reads the file once for the fingerprint, then opens it with MuPDF. */
void muse_inspect(const char *path, int64_t max_bytes, MuseInspection *out);

#endif
