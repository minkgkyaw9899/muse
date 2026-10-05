/** Parses `KEY=VALUE` lines, the format scripts emit for $GITHUB_ENV and $GITHUB_OUTPUT. */
export function parseKeyValueLines(output: string): Record<string, string> {
  return Object.fromEntries(
    output
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
}
