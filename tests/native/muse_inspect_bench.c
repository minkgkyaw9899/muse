/* Benchmarks one file through muse_inspect. Run by scripts/bench-native.sh, one process per file. */
#include <CommonCrypto/CommonDigest.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/time.h>

#include "MuseInspect.h"

static double now_ms(void) {
  struct timeval tv;
  gettimeofday(&tv, NULL);
  return tv.tv_sec * 1000.0 + tv.tv_usec / 1000.0;
}

static int compare(const void *a, const void *b) {
  double d = *(const double *)a - *(const double *)b;
  return (d > 0) - (d < 0);
}

static double median(double *values, int n) {
  qsort(values, n, sizeof *values, compare);
  return values[n / 2];
}

/* Same read-and-SHA-256 loop as the wrapper, to separate hashing from the MuPDF open. */
static double hash_only_ms(const char *path) {
  double t0 = now_ms();
  FILE *f = fopen(path, "rb");
  if (!f) return 0;
  CC_SHA256_CTX ctx;
  CC_SHA256_Init(&ctx);
  static unsigned char buf[64 * 1024];
  size_t n;
  while ((n = fread(buf, 1, sizeof buf, f)) > 0) CC_SHA256_Update(&ctx, buf, (CC_LONG)n);
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256_Final(digest, &ctx);
  fclose(f);
  return now_ms() - t0;
}

int main(int argc, char **argv) {
  if (argc < 4) {
    fprintf(stderr, "usage: %s <file> <expected pages or -1> <warm runs>\n", argv[0]);
    return 2;
  }
  const char *path = argv[1];
  int expected_pages = atoi(argv[2]);
  int warm_runs = atoi(argv[3]);
  if (warm_runs < 1 || warm_runs > 50) return 2;

  struct stat st;
  if (stat(path, &st) != 0) return 2;

  struct rusage before, after;
  getrusage(RUSAGE_SELF, &before);

  MuseInspection result;
  double t0 = now_ms();
  muse_inspect("bench-cold", path, -1, &result);
  double cold = now_ms() - t0;

  double runs[50], hashes[50];
  for (int i = 0; i < warm_runs; i++) {
    char op[32];
    MuseInspection r;
    snprintf(op, sizeof op, "bench-%d", i);
    double s = now_ms();
    muse_inspect(op, path, -1, &r);
    runs[i] = now_ms() - s;
    hashes[i] = hash_only_ms(path);
  }
  getrusage(RUSAGE_SELF, &after);

  double warm = median(runs, warm_runs);
  double hash = median(hashes, warm_runs);
  double open = warm > hash ? warm - hash : 0;
  double rss_mb = (after.ru_maxrss - before.ru_maxrss) / (1024.0 * 1024.0);

  const char *outcome = result.ok ? "ok" : result.code;
  const char *check = "";
  if (result.ok && expected_pages >= 0 && result.page_count != expected_pages) check = " MISMATCH";

  printf("| %s | %.1f | %d%s | %s | %.1f | %.1f | %.1f | %.1f | %.1f |\n", strrchr(path, '/') ? strrchr(path, '/') + 1 : path,
         st.st_size / (1024.0 * 1024.0), result.ok ? result.page_count : 0, check, outcome, cold,
         warm, hash, open, rss_mb);
  return 0;
}
