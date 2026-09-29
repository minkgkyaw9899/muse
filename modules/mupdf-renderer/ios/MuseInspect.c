#include "MuseInspect.h"

#include <CommonCrypto/CommonDigest.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

#ifdef MUSE_HAS_MUPDF
#include "mupdf/fitz.h"
#include "mupdf/pdf.h"
#endif

static void fail(MuseInspection *out, const char *code) {
  out->ok = 0;
  out->page_count = 0;
  out->fingerprint[0] = '\0';
  strncpy(out->code, code, sizeof(out->code) - 1);
  out->code[sizeof(out->code) - 1] = '\0';
}

/* Streams the file once with fixed memory. Returns 0 on success. */
static int hash_file(const char *path, char *hex, int *has_pdf_header) {
  FILE *f = fopen(path, "rb");
  if (!f) return -1;
  CC_SHA256_CTX ctx;
  CC_SHA256_Init(&ctx);
  unsigned char buf[64 * 1024];
  size_t n;
  int first = 1;
  *has_pdf_header = 0;
  while ((n = fread(buf, 1, sizeof buf, f)) > 0) {
    if (first) {
      first = 0;
      size_t window = n < 1024 ? n : 1024;
      for (size_t i = 0; i + 5 <= window; i++) {
        if (memcmp(buf + i, "%PDF-", 5) == 0) { *has_pdf_header = 1; break; }
      }
    }
    CC_SHA256_Update(&ctx, buf, (CC_LONG)n);
  }
  int failed = ferror(f);
  fclose(f);
  if (failed) return -1;
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256_Final(digest, &ctx);
  for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) sprintf(hex + i * 2, "%02x", digest[i]);
  hex[64] = '\0';
  return 0;
}

void muse_inspect(const char *path, int64_t max_bytes, MuseInspection *out) {
  memset(out, 0, sizeof *out);

  struct stat st;
  if (stat(path, &st) != 0) return fail(out, "file_missing");
  if (max_bytes >= 0 && (int64_t)st.st_size > max_bytes) return fail(out, "file_too_large");

  char hex[65];
  int has_header = 0;
  if (hash_file(path, hex, &has_header) != 0) return fail(out, "io_error");
  if (!has_header) return fail(out, "pdf_unsupported");

#ifdef MUSE_HAS_MUPDF
  /* Small store: inspection renders nothing, so it needs almost no cache. */
  fz_context *ctx = fz_new_context(NULL, NULL, 8 << 20);
  if (!ctx) return fail(out, "io_error");

  pdf_document *doc = NULL;
  const char *code = NULL;
  int pages = 0;

  fz_try(ctx) {
    doc = pdf_open_document(ctx, path);
    if (pdf_needs_password(ctx, doc)) {
      code = "pdf_encrypted";
    } else {
      pages = pdf_count_pages(ctx, doc);
    }
  }
  fz_catch(ctx) {
    code = "pdf_corrupt";
  }

  if (doc) pdf_drop_document(ctx, doc);
  fz_drop_context(ctx);

  if (code) return fail(out, code);
  if (pages <= 0) return fail(out, "pdf_corrupt");

  out->ok = 1;
  out->page_count = pages;
  memcpy(out->fingerprint, hex, sizeof hex);
#else
  /* Stub build: MuPDF is not linked (see scripts/build-mupdf.sh). */
  (void)hex;
  fail(out, "renderer_unavailable");
#endif
}
