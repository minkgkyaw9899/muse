/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(__dirname, '../../scripts/xcodebuild-profile.sh');

let dir: string;
let log: string;
let fakeXcodebuild: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'muse-xcodebuild-profile-'));
  log = join(dir, 'raw.log');
  fakeXcodebuild = join(dir, 'xcodebuild');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A stand-in for xcodebuild: echoes its arguments, and fails when asked to via FAKE_EXIT. */
function installFakeXcodebuild() {
  writeFileSync(
    fakeXcodebuild,
    '#!/bin/sh\necho "ARGS: $*"\necho "stderr line" >&2\nexit "$FAKE_EXIT"\n',
  );
  chmodSync(fakeXcodebuild, 0o755);
}

function run(args: string[], env: Record<string, string> = {}) {
  installFakeXcodebuild();
  const result = spawnSync('/bin/bash', [script, ...args], {
    encoding: 'utf8',
    env: {
      NODE_ENV: 'test',
      PATH: '/usr/bin:/bin',
      XCODEBUILD_REAL: fakeXcodebuild,
      XCODEBUILD_PROFILE_LOG: log,
      FAKE_EXIT: '0',
      ...env,
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('xcodebuild profiling shim', () => {
  it('asks xcodebuild for its build timing summary and keeps the arguments it was given', () => {
    const { status, stdout } = run(['-workspace', 'Muse.xcworkspace', '-scheme', 'Muse', 'build']);

    expect(status).toBe(0);
    expect(stdout).toContain(
      'ARGS: -workspace Muse.xcworkspace -scheme Muse build -showBuildTimingSummary',
    );
  });

  it('records the build output in the profile log while still printing it', () => {
    const { stdout } = run(['-scheme', 'Muse', 'build']);

    expect(stdout).toContain('ARGS:');
    expect(readFileSync(log, 'utf8')).toContain('ARGS: -scheme Muse build');
  });

  it('reports the exit status of the real xcodebuild', () => {
    expect(run(['-scheme', 'Muse', 'build'], { FAKE_EXIT: '65' }).status).toBe(65);
  });

  it('leaves query invocations untouched and unlogged', () => {
    const { stdout } = run(['-showBuildSettings', '-json', '-scheme', 'Muse']);

    expect(stdout).toContain('ARGS: -showBuildSettings -json -scheme Muse');
    expect(stdout).not.toContain('-showBuildTimingSummary');
    expect(existsSync(log)).toBe(false);
  });
});
