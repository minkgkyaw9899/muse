/* Host-side tests for the native inspection wrapper. Run with `bun run test:native`. */
#include <dirent.h>
#include <fcntl.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/time.h>
#include <unistd.h>

#include "MuseInspect.h"

static int failures = 0;
static const char *fixtures_dir;

#define CHECK(cond, msg)                                              \
  do {                                                                \
    if (!(cond)) {                                                    \
      printf("  FAIL: %s (%s:%d)\n", msg, __FILE__, __LINE__);        \
      failures++;                                                     \
    }                                                                 \
  } while (0)

static int op_counter = 0;

static MuseInspection inspect_fixture(const char *name, int64_t max_bytes) {
  char path[1024], op[64];
  MuseInspection result;
  snprintf(path, sizeof path, "%s/%s", fixtures_dir, name);
  snprintf(op, sizeof op, "fixture-%d", op_counter++);
  muse_inspect(op, path, max_bytes, &result);
  return result;
}

static double now_ms(void) {
  struct timeval tv;
  gettimeofday(&tv, NULL);
  return tv.tv_sec * 1000.0 + tv.tv_usec / 1000.0;
}

/* A sparse file that starts like a PDF. Hashing it takes long enough to cancel or overlap. */
static void make_big_file(char *path, size_t size, long long bytes) {
  snprintf(path, size, "%s/muse-big-XXXXXX", getenv("TMPDIR") ? getenv("TMPDIR") : "/tmp");
  int fd = mkstemp(path);
  if (fd < 0) { perror("mkstemp"); exit(2); }
  const char *header = "%PDF-1.4\n";
  if (write(fd, header, strlen(header)) < 0 || ftruncate(fd, bytes) != 0) {
    perror("prepare big file");
    exit(2);
  }
  close(fd);
}

typedef struct {
  char op[64];
  char path[1024];
  MuseInspection result;
  double started_ms, finished_ms;
  pthread_t thread;
} Job;

static void *run_job(void *arg) {
  Job *job = arg;
  job->started_ms = now_ms();
  muse_inspect(job->op, job->path, -1, &job->result);
  job->finished_ms = now_ms();
  return NULL;
}

static void start_job(Job *job, const char *op, const char *path) {
  memset(job, 0, sizeof *job);
  snprintf(job->op, sizeof job->op, "%s", op);
  snprintf(job->path, sizeof job->path, "%s", path);
  pthread_create(&job->thread, NULL, run_job, job);
}

static void finish_job(Job *job) { pthread_join(job->thread, NULL); }

static int open_fd_count(void) {
  int n = 0;
  DIR *d = opendir("/dev/fd");
  if (!d) return -1;
  while (readdir(d)) n++;
  closedir(d);
  return n;
}

static void test_valid_pdf_reports_page_count_and_fingerprint(void) {
  printf("valid PDF reports page count and fingerprint\n");
  MuseInspection r = inspect_fixture("valid-2-pages.pdf", -1);
  CHECK(r.ok == 1, "inspection succeeds");
  CHECK(r.page_count == 2, "page count is 2");
  /* Expected value computed independently with `shasum -a 256`. */
  CHECK(strcmp(r.fingerprint,
               "fe29a275f5a0f608267c1e1b7072b840d912b6f155ab01bf9a16cd49894cb8fa") == 0,
        "fingerprint is the SHA-256 of the file bytes");
}

static void expect_error(const char *fixture, int64_t max_bytes, const char *code) {
  MuseInspection r = inspect_fixture(fixture, max_bytes);
  CHECK(r.ok == 0, "inspection fails");
  CHECK(strcmp(r.code, code) == 0, code);
  CHECK(r.page_count == 0 && r.fingerprint[0] == '\0', "no partial metadata on failure");
}

static void test_encrypted_pdf_requires_a_password(void) {
  printf("encrypted PDF is reported as password protected\n");
  expect_error("encrypted.pdf", -1, "pdf_encrypted");
}

static void test_damaged_and_foreign_files_are_classified(void) {
  printf("damaged and non-PDF files are classified\n");
  expect_error("corrupt-header-only.pdf", -1, "pdf_corrupt");
  expect_error("not-a-pdf.txt", -1, "pdf_unsupported");
  expect_error("does-not-exist.pdf", -1, "file_missing");
}

static void test_byte_limit_is_inclusive(void) {
  printf("byte limit is checked before any work and is inclusive\n");
  expect_error("valid-2-pages.pdf", 268, "file_too_large"); /* file is 269 bytes */
  MuseInspection r = inspect_fixture("valid-2-pages.pdf", 269);
  CHECK(r.ok == 1, "a file exactly at the limit is accepted");
}

#define BIG_BYTES (1024LL * 1024 * 1024)
#define MEDIUM_BYTES (256LL * 1024 * 1024)

static void test_cancel_stops_a_running_inspection_promptly(void) {
  printf("cancel stops a running inspection promptly\n");
  char big[1024];
  make_big_file(big, sizeof big, BIG_BYTES);
  Job job;
  start_job(&job, "cancel-running", big);
  usleep(30 * 1000);
  double cancelled_at = now_ms();
  muse_cancel("cancel-running");
  finish_job(&job);
  CHECK(job.result.ok == 0 && strcmp(job.result.code, "cancelled") == 0, "result is cancelled");
  CHECK(job.finished_ms - cancelled_at < 250, "returns within 250 ms of the cancel");
  unlink(big);
}

static void test_cancel_before_start_is_honoured(void) {
  printf("a cancel that arrives before the inspection starts is honoured\n");
  char path[1024];
  snprintf(path, sizeof path, "%s/valid-2-pages.pdf", fixtures_dir);
  MuseInspection r;
  muse_cancel("early-cancel");
  muse_inspect("early-cancel", path, -1, &r);
  CHECK(r.ok == 0 && strcmp(r.code, "cancelled") == 0, "result is cancelled without any work");
}

static void test_cancelling_an_unknown_operation_changes_nothing(void) {
  printf("cancelling an unknown operation does not affect others\n");
  muse_cancel("nobody-is-running-this");
  MuseInspection r = inspect_fixture("valid-2-pages.pdf", -1);
  CHECK(r.ok == 1, "a different operation still succeeds");
}

static void test_cancel_affects_only_the_named_operation(void) {
  printf("cancel affects only the named operation\n");
  char big[1024];
  make_big_file(big, sizeof big, MEDIUM_BYTES);
  Job a, b;
  start_job(&a, "named-a", big);
  start_job(&b, "named-b", big);
  usleep(20 * 1000);
  muse_cancel("named-a");
  finish_job(&a);
  finish_job(&b);
  CHECK(strcmp(a.result.code, "cancelled") == 0, "named operation is cancelled");
  CHECK(strcmp(b.result.code, "cancelled") != 0, "the other operation is not cancelled");
  unlink(big);
}

static void test_concurrency_is_bounded(void) {
  printf("no more than 2 inspections run at once\n");
  char big[1024];
  make_big_file(big, sizeof big, MEDIUM_BYTES);
  muse_debug_reset_peak_concurrency();
  Job jobs[6];
  for (int i = 0; i < 6; i++) {
    char op[32];
    snprintf(op, sizeof op, "bounded-%d", i);
    start_job(&jobs[i], op, big);
  }
  for (int i = 0; i < 6; i++) finish_job(&jobs[i]);
  CHECK(muse_debug_peak_concurrency() == 2, "peak concurrency is exactly the limit of 2");
  int completed = 0;
  for (int i = 0; i < 6; i++) completed += strcmp(jobs[i].result.code, "cancelled") != 0;
  CHECK(completed == 6, "queued inspections still complete");
  unlink(big);
}

static void test_a_queued_inspection_can_be_cancelled(void) {
  printf("a queued inspection can be cancelled before it starts\n");
  char big[1024];
  make_big_file(big, sizeof big, BIG_BYTES);
  muse_debug_reset_peak_concurrency();
  Job running1, running2, queued;
  start_job(&running1, "queue-1", big);
  start_job(&running2, "queue-2", big);
  usleep(30 * 1000);
  start_job(&queued, "queue-3", big);
  usleep(30 * 1000);
  double cancelled_at = now_ms();
  muse_cancel("queue-3");
  finish_job(&queued);
  CHECK(strcmp(queued.result.code, "cancelled") == 0, "queued operation is cancelled");
  CHECK(queued.finished_ms - cancelled_at < 100, "it returns without waiting for a free slot");
  muse_cancel("queue-1");
  muse_cancel("queue-2");
  finish_job(&running1);
  finish_job(&running2);
  CHECK(muse_debug_peak_concurrency() == 2, "the queued operation never ran");
  unlink(big);
}

static void test_cleanup_is_deterministic(void) {
  printf("files and memory are released after success, failure, and cancellation\n");
  char big[1024];
  make_big_file(big, sizeof big, MEDIUM_BYTES);
  int fds_before = open_fd_count();
  struct rusage warm;
  for (int i = 0; i < 20; i++) inspect_fixture("valid-2-pages.pdf", -1); /* warm up */
  getrusage(RUSAGE_SELF, &warm);
  for (int i = 0; i < 300; i++) {
    inspect_fixture("valid-2-pages.pdf", -1);
    inspect_fixture("encrypted.pdf", -1);
    inspect_fixture("corrupt-header-only.pdf", -1);
    inspect_fixture("does-not-exist.pdf", -1);
  }
  for (int i = 0; i < 20; i++) {
    Job job;
    char op[32];
    snprintf(op, sizeof op, "cleanup-%d", i);
    start_job(&job, op, big);
    usleep(2000);
    muse_cancel(op);
    finish_job(&job);
  }
  struct rusage after;
  getrusage(RUSAGE_SELF, &after);
  CHECK(open_fd_count() == fds_before, "no file descriptors leaked");
#ifndef MUSE_SANITIZED
  /* ru_maxrss is bytes on macOS. 1,200 repeated inspections must not grow memory noticeably.
   * Skipped under sanitizers, whose quarantine and shadow memory dominate RSS; the plain pass and
   * `leaks` cover it. */
  CHECK(after.ru_maxrss - warm.ru_maxrss < 32L * 1024 * 1024, "peak memory does not grow");
#else
  (void)warm;
  (void)after;
#endif
  unlink(big);
}

static void test_stale_cancels_are_bounded(void) {
  printf("cancels for operations that never start do not accumulate\n");
  char name[32];
  for (int i = 0; i < 5000; i++) {
    snprintf(name, sizeof name, "ghost-%d", i);
    muse_cancel(name);
  }
  MuseInspection r = inspect_fixture("valid-2-pages.pdf", -1);
  CHECK(r.ok == 1, "the module keeps working after many unmatched cancels");
}

int main(int argc, char **argv) {
  if (argc < 2) {
    fprintf(stderr, "usage: %s <fixtures dir>\n", argv[0]);
    return 2;
  }
  fixtures_dir = argv[1];
  test_valid_pdf_reports_page_count_and_fingerprint();
  test_encrypted_pdf_requires_a_password();
  test_damaged_and_foreign_files_are_classified();
  test_byte_limit_is_inclusive();
  test_cancelling_an_unknown_operation_changes_nothing();
  test_cancel_before_start_is_honoured();
  test_cancel_stops_a_running_inspection_promptly();
  test_cancel_affects_only_the_named_operation();
  test_concurrency_is_bounded();
  test_a_queued_inspection_can_be_cancelled();
  test_cleanup_is_deterministic();
  test_stale_cancels_are_bounded();
  printf(failures ? "%d failure(s)\n" : "all passed\n", failures);
  return failures ? 1 : 0;
}
