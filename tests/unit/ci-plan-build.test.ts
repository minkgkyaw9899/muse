/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { parseKeyValueLines } from '../support/key-value-lines';

const script = join(__dirname, '../../scripts/ci-plan-build.sh');

type Plan = { run_build: string; fresh: string };

/** Runs the planning script the way the workflow does: event in the environment, changed paths on stdin. */
function plan(event: string, changed: string[], env: Record<string, string> = {}): Plan {
  const result = spawnSync('bash', [script], {
    input: changed.length ? `${changed.join('\n')}\n` : '',
    encoding: 'utf8',
    env: { NODE_ENV: 'test', PATH: process.env.PATH ?? '', EVENT: event, ...env },
  });
  expect(result.status).toBe(0);
  return parseKeyValueLines(result.stdout) as Plan;
}

describe('iOS build planning', () => {
  it('skips the macOS build when a pull request only changes documentation', () => {
    const result = plan('pull_request', ['docs/testing.md', 'README.md', 'docs/plans/0007-x.md']);

    expect(result.run_build).toBe('false');
  });

  it('builds when any changed file is not documentation', () => {
    const result = plan('pull_request', ['docs/testing.md', 'src/screens/library-screen.tsx']);

    expect(result.run_build).toBe('true');
  });

  it.each([
    'bun.lock',
    'app.json',
    'eas.json',
    'modules/publication-import/ios/PublicationSources.swift',
    'plugins/with-something.js',
  ])('starts from clean caches when native input %s changes', (path) => {
    expect(plan('pull_request', ['src/app/index.tsx', path]).fresh).toBe('true');
  });

  it('reuses caches for a JavaScript-only change', () => {
    expect(plan('pull_request', ['src/app/index.tsx']).fresh).toBe('false');
  });

  it('starts from clean caches when a pull request changes more than 150 files', () => {
    const many = Array.from({ length: 151 }, (_, i) => `src/generated/file-${i}.ts`);

    expect(plan('pull_request', many).fresh).toBe('true');
    expect(plan('pull_request', many.slice(0, 150)).fresh).toBe('false');
  });

  it('skips the macOS build when a push only changes documentation', () => {
    expect(plan('push', ['docs/agents/issue-tracker.md']).run_build).toBe('false');
  });

  it('builds when the changed files are unknown, so a mistake never hides a build', () => {
    expect(plan('push', []).run_build).toBe('true');
    expect(plan('pull_request', []).run_build).toBe('true');
  });

  it('always builds a manual run, even for a documentation-only change list', () => {
    expect(plan('workflow_dispatch', ['docs/testing.md']).run_build).toBe('true');
  });

  it('starts from clean caches when a manual run asks for it', () => {
    expect(plan('workflow_dispatch', [], { CLEAN_INPUT: 'true' }).fresh).toBe('true');
    expect(plan('workflow_dispatch', [], { CLEAN_INPUT: 'false' }).fresh).toBe('false');
  });
});
