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

int main(int argc, char **argv) {
  if (argc < 2) {
    fprintf(stderr, "usage: %s <fixtures dir>\n", argv[0]);
    return 2;
  }
  fixtures_dir = argv[1];
  test_valid_pdf_reports_page_count_and_fingerprint();
  printf(failures ? "%d failure(s)\n" : "all passed\n", failures);
  return failures ? 1 : 0;
}
