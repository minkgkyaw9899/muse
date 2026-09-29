/* Host-side tests for the native inspection wrapper. Run with `bun run test:native`. */
#include <stdio.h>
#include <string.h>

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

static MuseInspection inspect_fixture(const char *name, int64_t max_bytes) {
  char path[1024];
  MuseInspection result;
  snprintf(path, sizeof path, "%s/%s", fixtures_dir, name);
  muse_inspect(path, max_bytes, &result);
  return result;
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
  printf(failures ? "%d failure(s)\n" : "all passed\n", failures);
  return failures ? 1 : 0;
}
