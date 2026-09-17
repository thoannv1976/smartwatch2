import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The boundary of the distributed package.
 *
 * `scripts/make-package.sh` builds the ZIP with `git archive`, which writes
 * only COMMITTED files. That is what makes it structurally impossible to ship a
 * customer somebody's `.env.local`, a service-account key, `node_modules` or a
 * stale `.pyc` — even when those files are sitting in the working directory of
 * whoever is building the release.
 *
 * Two things can quietly break that guarantee, and neither shows up anywhere
 * else: a secret-shaped file getting committed, and `.gitignore` losing a rule
 * so the next `git add .` commits one. Both are checked here, because the cost
 * of finding out later is a customer holding a file they should never have had.
 */

const ROOT = path.resolve(__dirname, '../..');

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

/** Every file that would go into the ZIP. */
const tracked = git('ls-files').split('\n').filter(Boolean);

describe('nothing secret is committed, so nothing secret can be packaged', () => {
  it('tracks no environment file except the example', () => {
    const envFiles = tracked.filter((file) => path.basename(file).startsWith('.env'));
    expect(envFiles).toEqual(['.env.example']);
  });

  it('tracks no deployment configuration', () => {
    // `.deploy.env` holds a real project id and its Firebase web config. It is
    // per-installation, and it is written by the setup script, never committed.
    expect(tracked).not.toContain('.deploy.env');
    expect(tracked).toContain('.deploy.env.example');
  });

  it('tracks no credential, key or debug log', () => {
    const suspicious = tracked.filter((file) =>
      /(^|\/)(serviceAccount.*\.json|.*-debug\.log|.*\.pem|.*\.key|.*credentials.*\.json)$/i.test(
        file,
      ),
    );
    expect(suspicious).toEqual([]);
  });

  it('tracks no build output or bytecode', () => {
    const generated = tracked.filter((file) =>
      /(^|\/)(node_modules|\.next|dist|coverage|__pycache__)\//.test(file) || file.endsWith('.pyc'),
    );
    expect(generated).toEqual([]);
  });
});

describe('.gitignore keeps it that way', () => {
  const gitignore = readFileSync(path.join(ROOT, '.gitignore'), 'utf8');

  // Each entry is something that HAS existed in this working tree, or would be
  // created by a documented command. A missing rule means the next `git add .`
  // commits it, and the test above only fails afterwards.
  const required = [
    'node_modules/',
    '.next/',
    '.env.local',
    '.deploy.env',
    'serviceAccount*.json',
    '__pycache__/',
    '*.pyc',
    'dist/',
  ];

  for (const rule of required) {
    it(`ignores ${rule}`, () => {
      const lines = gitignore.split('\n').map((line) => line.trim());
      expect(lines).toContain(rule);
    });
  }

  it('does NOT ignore the example files, which have to ship', () => {
    // A blanket `.env*` rule would silently drop `.env.example` from the ZIP,
    // and the installer's documentation refers to it.
    for (const example of ['.env.example', '.deploy.env.example']) {
      const ignored = (() => {
        try {
          execFileSync('git', ['check-ignore', '-q', example], { cwd: ROOT });
          return true;
        } catch {
          return false;
        }
      })();
      expect(ignored, example).toBe(false);
    }
  });
});

describe('the package carries what a buyer needs', () => {
  const required = [
    'install.sh',
    'INSTALL.md',
    'INSTALL.en.md',
    'LICENSE',
    'HUONG_DAN.md',
    'README.md',
    '.env.example',
    '.deploy.env.example',
    'scripts/gcp-setup.sh',
    'scripts/deploy.sh',
    'scripts/uninstall.sh',
    'scripts/make-package.sh',
    'scripts/third-party-notices.mjs',
    'scripts/firebase_setup.py',
    'firestore.rules',
    'firestore.indexes.json',
    'cloudbuild.yaml',
    'Dockerfile',
    'package.json',
    'package-lock.json',
  ];

  for (const file of required) {
    it(`ships ${file}`, () => {
      expect(tracked).toContain(file);
    });
  }

  it('has a package-lock, so the buyer builds the same dependency tree we tested', () => {
    const lock = JSON.parse(readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
    expect(lock.lockfileVersion).toBeGreaterThanOrEqual(2);
  });

  it('declares a licence rather than leaving it undefined', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.license).toBeTruthy();
    expect(pkg.private).toBe(true);
  });
});

describe('the ZIP unpacks into one directory, and the instructions match its name', () => {
  // A flat ZIP is not a cosmetic problem. The documented first step is to run
  // `unzip` in Cloud Shell, which is the customer's home directory: a flat
  // archive empties 275 files into it, and the `cd` on the very next line then
  // fails. The packager stages everything under `<name>-v<version>/`, and this
  // pins that name to the one the documentation tells people to change into.
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
  };
  const stamp = `${pkg.name}-v${pkg.version}`;

  it('stages under the stamped directory rather than zipping a bare tree', () => {
    const script = readFileSync(path.join(ROOT, 'scripts/make-package.sh'), 'utf8');
    expect(script).toContain('STAGE="dist/staging/${STAMP}"');
    // `zip -qr ../X.zip .` is the flat form this test exists to prevent.
    expect(script).toContain('zip -qr "../${STAMP}.zip" "$STAMP"');
  });

  for (const doc of ['INSTALL.md', 'INSTALL.en.md']) {
    it(`${doc} tells the reader to cd into ${stamp}`, () => {
      expect(readFileSync(path.join(ROOT, doc), 'utf8')).toContain(`cd ${stamp}`);
    });
  }
});
