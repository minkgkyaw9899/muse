#include "MuseInspect.h"

#include <CommonCrypto/CommonDigest.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>

#ifdef MUSE_HAS_MUPDF
#include "mupdf/fitz.h"
#include "mupdf/pdf.h"
#endif

#define MUSE_MAX_CONCURRENT 2
#define MUSE_MAX_OPERATIONS 128 /* running or queued */
#define MUSE_MAX_PENDING_CANCELS 64
#define MUSE_ID_MAX 96

/* One entry per running or queued operation. Entries never move, so their flag can be read without the lock. */
typedef struct {
  int used;
  char id[MUSE_ID_MAX];
  atomic_int cancelled;
} Operation;

static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t changed = PTHREAD_COND_INITIALIZER;
static Operation operations[MUSE_MAX_OPERATIONS];
static char pending_cancels[MUSE_MAX_PENDING_CANCELS][MUSE_ID_MAX];
static int pending_next = 0;
static int running = 0;
static int peak_running = 0;

static void copy_id(char *dst, const char *src) {
  strncpy(dst, src, MUSE_ID_MAX - 1);
  dst[MUSE_ID_MAX - 1] = '\0';
}

/* Callers hold the lock. */
static Operation *find_operation(const char *id) {
  for (int i = 0; i < MUSE_MAX_OPERATIONS; i++) {
    if (operations[i].used && strcmp(operations[i].id, id) == 0) return &operations[i];
  }
  return NULL;
}

/* Callers hold the lock. Returns 1 and forgets the entry if a cancel was waiting for this id. */
static int take_pending_cancel(const char *id) {
  for (int i = 0; i < MUSE_MAX_PENDING_CANCELS; i++) {
    if (pending_cancels[i][0] && strcmp(pending_cancels[i], id) == 0) {
      pending_cancels[i][0] = '\0';
      return 1;
    }
  }
  return 0;
}

void muse_cancel(const char *operation_id) {
  pthread_mutex_lock(&lock);
  Operation *op = find_operation(operation_id);
  if (op) {
    atomic_store(&op->cancelled, 1);
    pthread_cond_broadcast(&changed);
  } else {
    /* Not started yet (or already finished). Remember it in a fixed ring so it cannot grow. */
    copy_id(pending_cancels[pending_next], operation_id);
    pending_next = (pending_next + 1) % MUSE_MAX_PENDING_CANCELS;
  }
  pthread_mutex_unlock(&lock);
}

int muse_debug_peak_concurrency(void) {
  pthread_mutex_lock(&lock);
  int peak = peak_running;
  pthread_mutex_unlock(&lock);
  return peak;
}

void muse_debug_reset_peak_concurrency(void) {
  pthread_mutex_lock(&lock);
  peak_running = 0;
  pthread_mutex_unlock(&lock);
}

static void fail(MuseInspection *out, const char *code) {
  out->ok = 0;
  out->page_count = 0;
  out->fingerprint[0] = '\0';
  strncpy(out->code, code, sizeof(out->code) - 1);
  out->code[sizeof(out->code) - 1] = '\0';
}

/* Registers the operation. Returns NULL if the table is full. Applies a cancel that arrived first. */
static Operation *register_operation(const char *id) {
  pthread_mutex_lock(&lock);
  Operation *slot = NULL;
  for (int i = 0; i < MUSE_MAX_OPERATIONS; i++) {
    if (!operations[i].used) { slot = &operations[i]; break; }
  }
  if (slot) {
    slot->used = 1;
    copy_id(slot->id, id);
    atomic_store(&slot->cancelled, take_pending_cancel(id));
  }
  pthread_mutex_unlock(&lock);
  return slot;
}

static void unregister_operation(Operation *op, int held_permit) {
  pthread_mutex_lock(&lock);
  if (held_permit) running--;
  op->used = 0;
  op->id[0] = '\0';
  pthread_cond_broadcast(&changed);
  pthread_mutex_unlock(&lock);
}

/* Waits for a concurrency slot. Returns 0 with the slot held, or 1 if cancelled while waiting. */
static int acquire_permit(Operation *op) {
  pthread_mutex_lock(&lock);
  while (running >= MUSE_MAX_CONCURRENT && !atomic_load(&op->cancelled)) {
    pthread_cond_wait(&changed, &lock);
  }
  if (atomic_load(&op->cancelled)) {
    pthread_mutex_unlock(&lock);
    return 1;
  }
  running++;
  if (running > peak_running) peak_running = running;
  pthread_mutex_unlock(&lock);
  return 0;
}

/* Streams the file once with fixed memory. Returns 0 on success, -1 on I/O error, 1 if cancelled. */
static int hash_file(const char *path, Operation *op, char *hex, int *has_pdf_header) {
  FILE *f = fopen(path, "rb");
  if (!f) return -1;
  CC_SHA256_CTX ctx;
  CC_SHA256_Init(&ctx);
  unsigned char buf[64 * 1024];
  size_t n;
  int first = 1;
  *has_pdf_header = 0;
  while ((n = fread(buf, 1, sizeof buf, f)) > 0) {
    if (atomic_load(&op->cancelled)) {
      fclose(f);
      return 1;
    }
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

#ifdef MUSE_HAS_MUPDF
/* Opens the document and counts pages. Returns NULL on success, otherwise the failure code. */
static const char *read_page_count(const char *path, Operation *op, int *pages) {
  /* Small store: inspection renders nothing, so it needs almost no cache. */
  fz_context *ctx = fz_new_context(NULL, NULL, 8 << 20);
  if (!ctx) return "io_error";

  pdf_document *doc = NULL;
  const char *code = NULL;
  *pages = 0;

  fz_try(ctx) {
    doc = pdf_open_document(ctx, path);
    if (atomic_load(&op->cancelled)) {
      code = "cancelled";
    } else if (pdf_needs_password(ctx, doc)) {
      code = "pdf_encrypted";
    } else {
      *pages = pdf_count_pages(ctx, doc);
    }
  }
  fz_catch(ctx) {
    code = "pdf_corrupt";
  }

  if (doc) pdf_drop_document(ctx, doc);
  fz_drop_context(ctx);

  if (!code && *pages <= 0) code = "pdf_corrupt";
  return code;
}
#endif

void muse_inspect(const char *operation_id, const char *path, int64_t max_bytes, MuseInspection *out) {
  memset(out, 0, sizeof *out);

  Operation *op = register_operation(operation_id);
  if (!op) return fail(out, "io_error");

  if (acquire_permit(op)) {
    unregister_operation(op, 0);
    return fail(out, "cancelled");
  }

  const char *code = NULL;
  char hex[65] = {0};
  int pages = 0;

  struct stat st;
  if (stat(path, &st) != 0) {
    code = "file_missing";
  } else if (max_bytes >= 0 && (int64_t)st.st_size > max_bytes) {
    code = "file_too_large";
  } else {
    int has_header = 0;
    int hashed = hash_file(path, op, hex, &has_header);
    if (hashed == 1) code = "cancelled";
    else if (hashed != 0) code = "io_error";
    else if (!has_header) code = "pdf_unsupported";
    else if (atomic_load(&op->cancelled)) code = "cancelled";
    else {
#ifdef MUSE_HAS_MUPDF
      code = read_page_count(path, op, &pages);
#else
      code = "renderer_unavailable"; /* Stub build: MuPDF is not linked (see scripts/build-mupdf.sh). */
#endif
    }
  }

  unregister_operation(op, 1);

  if (code) return fail(out, code);
  out->ok = 1;
  out->page_count = pages;
  memcpy(out->fingerprint, hex, sizeof hex);
}
