/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * MuPDF is AGPL-3.0. ADR 0001 blocks distributing it until a licensing path is accepted, so builds
 * only contain MuPDF when someone runs scripts/build-mupdf.sh. These tests keep that true.
 */
const root = join(__dirname, '../..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const FRAMEWORK_DIR = 'modules/mupdf-renderer/ios/Frameworks';

/** Workflows that may build MuPDF: test builds that are never uploaded or distributed. */
const MAY_BUILD_MUPDF = ['e2e-ios.yml'];

function workflowFiles() {
  return ['.github/workflows', '.eas/workflows']
    .filter((dir) => existsSync(join(root, dir)))
    .flatMap((dir) =>
      readdirSync(join(root, dir))
        .filter((file) => /\.ya?ml$/.test(file))
        .map((file) => ({ file, path: join(dir, file) })),
    );
}

describe('MuPDF licensing gate', () => {
  it('never tracks MuPDF binaries in git', () => {
    const tracked = execFileSync('git', ['ls-files', FRAMEWORK_DIR], { cwd: root }).toString();
    expect(tracked.trim()).toBe('');
  });

  it('ignores the built framework and the source cache', () => {
    const ignored = read('.gitignore').split('\n');
    expect(ignored).toContain(`/${FRAMEWORK_DIR}/`);
    expect(ignored).toContain('/.cache/');
  });

  it('only vendors MuPDF into the pod when the framework has been built locally', () => {
    const podspec = read('modules/mupdf-renderer/ios/MupdfRenderer.podspec');
    const guard = podspec.indexOf('File.exist?(framework)');
    const vendored = podspec.indexOf('s.vendored_frameworks');
    expect(guard).toBeGreaterThan(-1);
    expect(vendored).toBeGreaterThan(guard);
  });

  it('never builds MuPDF from EAS build hooks or profiles', () => {
    const scripts: Record<string, string> = JSON.parse(read('package.json')).scripts;
    const hooks = Object.entries(scripts).filter(([name]) => name.startsWith('eas-build-'));
    for (const [, command] of hooks) expect(command).not.toMatch(/mupdf/i);
    expect(read('eas.json')).not.toMatch(/mupdf/i);
  });

  it('lets only test workflows build MuPDF, and never alongside distribution steps', () => {
    for (const { file, path } of workflowFiles()) {
      const content = read(path);
      if (!/build-mupdf/.test(content)) continue;
      expect(MAY_BUILD_MUPDF).toContain(file);
      expect(content).not.toMatch(/eas (build|submit)|eas-cli|testflight|altool|upload-artifact/i);
    }
  });
});
