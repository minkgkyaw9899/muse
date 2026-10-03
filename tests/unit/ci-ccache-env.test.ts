/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseKeyValueLines } from '../support/key-value-lines';

const script = join(__dirname, '../../scripts/ci-ccache-env.sh');

let toolDir: string;

beforeEach(() => {
  toolDir = mkdtempSync(join(tmpdir(), 'muse-ccache-env-'));
});

afterEach(() => {
  rmSync(toolDir, { recursive: true, force: true });
});

function installFakeCcache(): string {
  const path = join(toolDir, 'ccache');
  writeFileSync(path, '#!/bin/sh\nexit 0\n');
  chmodSync(path, 0o755);
  return path;
}

/** Runs the script as the workflow does: only the runner's PATH and HOME are visible to it. */
function run() {
  const result = spawnSync('/bin/bash', [script], {
    encoding: 'utf8',
    env: { NODE_ENV: 'test', PATH: toolDir, HOME: '/Users/runner' },
  });
  return { status: result.status, stderr: result.stderr, env: parseKeyValueLines(result.stdout) };
}

describe('ccache build environment', () => {
  it('exports the resolved ccache binary, which Xcode compile tasks cannot read from build settings', () => {
    const ccache = installFakeCcache();

    const { status, env } = run();

    expect(status).toBe(0);
    expect(env.CCACHE_BINARY).toBe(ccache);
  });

  it('accepts the virtual-file-system overlays and modules that Xcode passes to every compile', () => {
    installFakeCcache();

    const sloppiness = run().env.CCACHE_SLOPPINESS.split(',');

    expect(sloppiness).toEqual(expect.arrayContaining(['ivfsoverlay', 'modules', 'pch_defines']));
  });

  it('tracks module header contents so a changed header never serves a stale object', () => {
    installFakeCcache();

    expect(run().env.CCACHE_DEPEND).toBe('true');
  });

  it('enables ccache and keeps its store under the home directory the workflow caches', () => {
    installFakeCcache();

    const { env } = run();

    expect(env.USE_CCACHE).toBe('1');
    expect(env.CCACHE_DIR).toBe('/Users/runner/.ccache');
  });

  it('fails with an actionable message when ccache is not installed', () => {
    const { status, stderr } = run();

    expect(status).not.toBe(0);
    expect(stderr).toMatch(/ccache is not installed/i);
  });
});
