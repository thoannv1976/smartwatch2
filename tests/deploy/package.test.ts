import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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
 *
 * WHY HALF OF THIS FILE CAN SKIP ITSELF, AND WHY THAT IS NOT A LOOPHOLE.
 *
 * The suite runs in two very different places. In the source repository it is
 * the guard described above. But the same suite is also run by the customer:
 * `npm test` is the Docker `tester` stage of every install, and there the
 * questions above have no answer — a released package is a plain directory with
 * no `.git` and no `.gitignore`. An earlier version of this file called
 * `git ls-files` unconditionally, which threw at import time and failed the
 * first build of every install. The guard has to hold where the question means
 * something and stand aside where it does not.
 *
 * The moment that matters is not CI, it is `scripts/make-package.sh`, which
 * refuses to run without git and runs `npm test` immediately before building
 * the archive. So the repository checks always execute on the one machine and
 * at the one instant they exist to protect.
 *
 * Everything that can be asked of a bare directory is asked of one, so the
 * customer's build still verifies that what they received is complete.
 */

const ROOT = path.resolve(__dirname, '../..');

/** True in a developer checkout, false inside an unpacked release. */
const inRepository = (() => {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

/**
 * Both repository-only inputs are read HERE, outside any `describe`.
 *
 * `describe.skipIf` skips the tests, not the suite body: vitest still runs the
 * factory to collect them. Reading a repository-only file inside one therefore
 * throws during collection and fails the whole file — which is exactly the way
 * the first version of this suite broke every customer's install.
 */
const tracked = inRepository ? git('ls-files').split('\n').filter(Boolean) : [];
const gitignore = inRepository ? readFileSync(path.join(ROOT, '.gitignore'), 'utf8') : '';

describe.skipIf(!inRepository)('nothing secret is committed, so nothing secret can be packaged', () => {
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

describe.skipIf(!inRepository)('.gitignore keeps it that way', () => {
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
  // Checked on disk rather than through git, so this runs inside the customer's
  // own build too: there it stops an install whose package arrived incomplete.
  const required = [
    'install.sh',
    'INSTALL.md',
    'INSTALL.en.md',
    'LICENSE',
    'HUONG_DAN.md',
    'README.md',
    '.env.example',
    '.deploy.env.example',
    '.gcloudignore',
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
      expect(existsSync(path.join(ROOT, file)), file).toBe(true);
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
  // archive empties 275 files into it, and the `cd` on the very next line would
  // then fail. The packager stages everything under `<name>-v<version>/`, and
  // this pins that name to the one the documentation says to change into.
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

describe('the upload to Cloud Build is filtered explicitly', () => {
  // `gcloud builds submit` falls back to .gitignore when no .gcloudignore
  // exists — and a released package has no .gitignore. INSTALL.md tells the
  // installer to run `npm ci` for the demo data, so without this file the next
  // `./scripts/deploy.sh` would upload the whole node_modules tree to Cloud
  // Build. Being explicit also means the dev checkout and the customer's
  // installation upload exactly the same thing.
  const gcloudignore = readFileSync(path.join(ROOT, '.gcloudignore'), 'utf8');
  const lines = gcloudignore.split('\n').map((line) => line.trim());

  for (const rule of ['node_modules/', '.next/', 'dist/', '.git/', '.deploy.env', '__pycache__/']) {
    it(`keeps ${rule} out of the build upload`, () => {
      expect(lines).toContain(rule);
    });
  }

  it('still uploads what the Dockerfile needs', () => {
    // The tester stage typechecks and runs the suite, so tests/ and scripts/
    // must reach the build context. Excluding them would turn the correctness
    // gate into a no-op without anything failing.
    for (const needed of ['src', 'tests', 'scripts', 'public', 'package.json']) {
      expect(lines).not.toContain(needed);
      expect(lines).not.toContain(`${needed}/`);
    }
  });
});
