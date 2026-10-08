#include "MuseInspect.h"

#include <CommonCrypto/CommonDigest.h>
#include <errno.h>
#include <fcntl.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

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

static pthread_mutex_t registry_lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t registry_changed = PTHREAD_COND_INITIALIZER;
static Operation operations[MUSE_MAX_OPERATIONS];
static char pending_cancels[MUSE_MAX_PENDING_CANCELS][MUSE_ID_MAX];
static int pending_next = 0;
static int running_operations = 0;
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
  pthread_mutex_lock(&registry_lock);
  Operation *op = find_operation(operation_id);
  if (op) {
    atomic_store(&op->cancelled, 1);
    pthread_cond_broadcast(&registry_changed);
  } else {
    /* Not started yet (or already finished). Remember it in a fixed ring so it cannot grow. */
    copy_id(pending_cancels[pending_next], operation_id);
    pending_next = (pending_next + 1) % MUSE_MAX_PENDING_CANCELS;
  }
  pthread_mutex_unlock(&registry_lock);
}

#ifdef MUSE_TESTING
int muse_debug_peak_concurrency(void) {
  pthread_mutex_lock(&registry_lock);
  int peak = peak_running;
  pthread_mutex_unlock(&registry_lock);
  return peak;
}

void muse_debug_reset_peak_concurrency(void) {
  pthread_mutex_lock(&registry_lock);
  peak_running = 0;
  pthread_mutex_unlock(&registry_lock);
}
#endif

static void fail(MuseInspection *out, const char *code) {
  out->ok = 0;
  out->page_count = 0;
  out->fingerprint[0] = '\0';
  strncpy(out->code, code, sizeof(out->code) - 1);
  out->code[sizeof(out->code) - 1] = '\0';
}

#define FAIL(out, code) \
  do {                  \
    fail((out), (code)); \
    return;             \
  } while (0)

/*
 * Registers the operation. Returns NULL and sets *code if the id is invalid or in use, or the table
 * is full. Applies a cancel that arrived before the operation started.
 */
static Operation *register_operation(const char *id, const char **code) {
  if (!id || id[0] == '\0' || strlen(id) >= MUSE_ID_MAX) {
    *code = "invalid_request";
    return NULL;
  }
  pthread_mutex_lock(&registry_lock);
  Operation *slot = NULL;
  if (find_operation(id)) {
    *code = "invalid_request";
  } else {
    for (int i = 0; i < MUSE_MAX_OPERATIONS; i++) {
      if (!operations[i].used) { slot = &operations[i]; break; }
    }
    if (slot) {
      slot->used = 1;
      copy_id(slot->id, id);
      atomic_store(&slot->cancelled, take_pending_cancel(id));
    } else {
      *code = "too_many_operations";
    }
  }
  pthread_mutex_unlock(&registry_lock);
  return slot;
}

static void unregister_operation(Operation *op, int held_permit) {
  pthread_mutex_lock(&registry_lock);
  if (held_permit) running_operations--;
  op->used = 0;
  op->id[0] = '\0';
  pthread_cond_broadcast(&registry_changed);
  pthread_mutex_unlock(&registry_lock);
}

/* Waits for a concurrency slot. Returns 0 with the slot held, or 1 if cancelled while waiting. */
static int acquire_permit(Operation *op) {
  pthread_mutex_lock(&registry_lock);
  while (running_operations >= MUSE_MAX_CONCURRENT && !atomic_load(&op->cancelled)) {
    pthread_cond_wait(&registry_changed, &registry_lock);
  }
  if (atomic_load(&op->cancelled)) {
    pthread_mutex_unlock(&registry_lock);
    return 1;
  }
  running_operations++;
  if (running_operations > peak_running) peak_running = running_operations;
  pthread_mutex_unlock(&registry_lock);
  return 0;
}

/*
 * Streams the open file once with fixed memory, computing its SHA-256. Returns NULL on success or
 * the failure code. Rejects anything without a %PDF- marker in the first 1 KB from the first read,
 * and enforces max_bytes while streaming, so a file that grows after it was checked is still bounded.
 */
static const char *hash_stream(FILE *f, Operation *op, int64_t max_bytes, char *hex) {
  CC_SHA256_CTX ctx;
  CC_SHA256_Init(&ctx);
  unsigned char buf[64 * 1024];
  size_t n;
  int64_t total = 0;
  int first = 1;
  while ((n = fread(buf, 1, sizeof buf, f)) > 0) {
    if (atomic_load(&op->cancelled)) return "cancelled";
    if (first) {
      first = 0;
      size_t window = n < 1024 ? n : 1024;
      int found = 0;
      for (size_t i = 0; i + 5 <= window; i++) {
        if (memcmp(buf + i, "%PDF-", 5) == 0) { found = 1; break; }
      }
      if (!found) return "pdf_unsupported";
    }
    total += (int64_t)n;
    if (max_bytes >= 0 && total > max_bytes) return "file_too_large";
    CC_SHA256_Update(&ctx, buf, (CC_LONG)n);
  }
  if (ferror(f)) return "io_error";
  if (first) return "pdf_unsupported"; /* empty file */
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256_Final(digest, &ctx);
  for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) snprintf(hex + i * 2, 3, "%02x", digest[i]);
  hex[64] = '\0';
  return NULL;
}

#ifdef MUSE_HAS_MUPDF
/* Maps a MuPDF exception class to the module's failure codes. */
static const char *classify_error(int error) {
  switch (error) {
    case FZ_ERROR_SYSTEM: return "io_error"; /* out of memory or a failed system call */
    case FZ_ERROR_LIMIT: return "file_too_large";
    case FZ_ERROR_UNSUPPORTED: return "pdf_unsupported";
    case FZ_ERROR_ABORT: return "cancelled";
    default: return "pdf_corrupt"; /* format, syntax, library, argument */
  }
}

/* Parses the already-open file. Returns NULL on success, otherwise the failure code. */
static const char *read_page_count(FILE *f, Operation *op, int *pages) {
  /* Small store: inspection renders nothing, so it needs almost no cache. */
  fz_context *ctx = fz_new_context(NULL, NULL, 8 << 20);
  if (!ctx) return "io_error";

  fz_stream *stm = NULL;
  pdf_document *doc = NULL;
  const char *code = NULL;
  /* MuPDF's try/catch is setjmp-based: locals assigned inside must survive a throw. */
  fz_var(stm);
  fz_var(doc);
  fz_var(code);
  *pages = 0;

  fz_try(ctx) {
    stm = fz_open_file_ptr_no_close(ctx, f);
    doc = pdf_open_document_with_stream(ctx, stm);
    if (atomic_load(&op->cancelled)) {
      code = "cancelled";
    } else if (pdf_needs_password(ctx, doc)) {
      code = "pdf_encrypted";
    } else {
      *pages = pdf_count_pages(ctx, doc);
    }
  }
  fz_catch(ctx) {
    code = classify_error(fz_caught(ctx));
  }

  fz_drop_stream(ctx, stm);
  if (doc) pdf_drop_document(ctx, doc);
  fz_drop_context(ctx);

  if (!code && *pages <= 0) code = "pdf_corrupt";
  return code;
}
#endif

void muse_inspect(const char *operation_id, const char *path, int64_t max_bytes, MuseInspection *out) {
  memset(out, 0, sizeof *out);

  const char *code = NULL;
  Operation *op = register_operation(operation_id, &code);
  if (!op) FAIL(out, code);

  if (acquire_permit(op)) {
    unregister_operation(op, 0);
    FAIL(out, "cancelled");
  }

  char hex[65] = {0};
  int pages = 0;
  FILE *f = NULL;

  /* O_NONBLOCK so that opening a pipe or device cannot block; only regular files are read. */
  int fd = open(path, O_RDONLY | O_NONBLOCK | O_CLOEXEC);
  struct stat st;
  if (fd < 0) {
    code = (errno == ENOENT || errno == ENOTDIR) ? "file_missing" : "io_error";
  } else if (fstat(fd, &st) != 0) {
    code = "io_error";
  } else if (!S_ISREG(st.st_mode)) {
    code = "pdf_unsupported";
  } else if (max_bytes >= 0 && (int64_t)st.st_size > max_bytes) {
    code = "file_too_large";
  } else if ((f = fdopen(fd, "rb")) == NULL) {
    code = "io_error";
  } else {
    fd = -1; /* owned by f from here */
    code = hash_stream(f, op, max_bytes, hex);
    if (!code && atomic_load(&op->cancelled)) code = "cancelled";
    if (!code) {
#ifdef MUSE_HAS_MUPDF
      /* Same handle, rewound: the fingerprint describes exactly the bytes MuPDF parses. */
      rewind(f);
      code = read_page_count(f, op, &pages);
#else
      code = "renderer_unavailable"; /* Stub build: MuPDF is not linked (see scripts/build-mupdf.sh). */
#endif
    }
  }

  if (f) fclose(f);
  else if (fd >= 0) close(fd);
  unregister_operation(op, 1);

  if (code) FAIL(out, code);
  out->ok = 1;
  out->page_count = pages;
  memcpy(out->fingerprint, hex, sizeof hex);
}
