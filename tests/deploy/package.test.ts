import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The boundary of the distributed package. EVERY SUITE HERE IS REPOSITORY-ONLY,
 * and that single rule is the result of breaking two customer builds in a row.
 *
 * What the suite guards
 * ---------------------
 * `scripts/make-package.sh` builds the ZIP with `git archive`, which writes only
 * COMMITTED files. That is what makes it structurally impossible to ship a
 * customer somebody's `.env.local`, a service-account key, `node_modules` or a
 * stale `.pyc` — even when those files sit in the working directory of whoever
 * builds the release. Two things can quietly break that guarantee and show up
 * nowhere else: a secret-shaped file getting committed, and `.gitignore` losing
 * a rule so the next `git add .` commits one.
 *
 * Why it refuses to run anywhere but a checkout
 * ---------------------------------------------
 * `npm test` runs in three environments, and only the first can answer any of
 * these questions:
 *
 *   1. a developer checkout — a git repository with every file present;
 *   2. an unpacked release — a plain directory, no `.git`, no history;
 *   3. the Docker `tester` stage of every install — an unpacked release with
 *      `.dockerignore` applied, which deliberately strips every *.md except
 *      README and the Dockerfile itself.
 *
 * Version one called `git ls-files` at import and failed (3) outright. Version
 * two switched to `existsSync` so the checks would "also run for the customer",
 * and failed (3) again — asking a filtered build context to prove it contains
 * the documentation that the filter exists to remove. Both broke the first
 * build of an install, which is the worst possible place to learn this.
 *
 * So: this file asks questions about a source repository, and stands aside
 * when there is no source repository. That costs nothing, because the moment
 * that matters is not CI — it is `scripts/make-package.sh`, which refuses to
 * run without git and runs `npm test` immediately before building the archive.
 * The checks always execute on the one machine, at the one instant, where they
 * protect anything.
 *
 * "Is the package complete?" is a real question, but it belongs to the packager,
 * which checks the staged archive directly. The final suite below keeps that
 * list honest from this side.
 */

const ROOT = path.resolve(__dirname, '../..');

/** True in a developer checkout, false in an unpacked release or a build context. */
const inRepository = (() => {
  // scripts/make-package.sh sets this to replay the exact conditions of a
  // customer's build without needing one. Collection under `repo === null` is
  // the failure mode that shipped twice; now it is checked before every release.
  if (process.env.SMARTWATCH_ASSUME_NO_REPO === '1') return false;
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    // Either this is not a repository, or git is not installed at all — the
    // node:22-alpine image the tester stage runs in has no git.
    return false;
  }
})();

/**
 * Every input is read HERE, at module level, behind the one condition.
 *
 * `describe.skipIf` skips the TESTS, not the suite body: vitest still runs the
 * factory to collect them. So NOTHING may touch `repo` outside an `it()` — not
 * a read, and not a helper computed at the top of a suite. Both forms throw
 * during collection and fail the whole file. Everything derived lives in here,
 * where the single condition covers it.
 */
function readRepository() {
  const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');
  const packager = read('scripts/make-package.sh');
  return {
    tracked: execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean),
    gitignore: read('.gitignore'),
    gcloudignore: read('.gcloudignore'),
    packager,
    /** The REQUIRED_IN_PACKAGE array the packager checks the staged archive against. */
    declared: (/REQUIRED_IN_PACKAGE=\(([^)]*)\)/.exec(packager)?.[1] ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#')),
    installVi: read('INSTALL.md'),
    installEn: read('INSTALL.en.md'),
    pkg: JSON.parse(read('package.json')) as {
      name: string;
      version: string;
      license?: string;
      private?: boolean;
    },
    lock: JSON.parse(read('package-lock.json')) as { lockfileVersion: number },
  };
}

const repo = inRepository ? readRepository() : null;

const describeRepo = describe.skipIf(!repo);

describeRepo('nothing secret is committed, so nothing secret can be packaged', () => {
  it('tracks no environment file except the example', () => {
    const envFiles = repo!.tracked.filter((file) => path.basename(file).startsWith('.env'));
    expect(envFiles).toEqual(['.env.example']);
  });

  it('tracks no deployment configuration', () => {
    // `.deploy.env` holds a real project id and its Firebase web config. It is
    // per-installation, written by the setup script, and never committed.
    expect(repo!.tracked).not.toContain('.deploy.env');
    expect(repo!.tracked).toContain('.deploy.env.example');
  });

  it('tracks no credential, key or debug log', () => {
    const suspicious = repo!.tracked.filter((file) =>
      /(^|\/)(serviceAccount.*\.json|.*-debug\.log|.*\.pem|.*\.key|.*credentials.*\.json)$/i.test(
        file,
      ),
    );
    expect(suspicious).toEqual([]);
  });

  it('tracks no build output or bytecode', () => {
    const generated = repo!.tracked.filter(
      (file) =>
        /(^|\/)(node_modules|\.next|dist|coverage|__pycache__)\//.test(file) ||
        file.endsWith('.pyc'),
    );
    expect(generated).toEqual([]);
  });
});

describeRepo('.gitignore keeps it that way', () => {
  // Each entry is something that HAS existed in this working tree, or would be
  // created by a documented command. A missing rule means the next `git add .`
  // commits it, and the suite above only fails afterwards.
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
      const lines = repo!.gitignore.split('\n').map((line) => line.trim());
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

describeRepo('the upload to Cloud Build is filtered explicitly', () => {
  // `gcloud builds submit` falls back to .gitignore when no .gcloudignore
  // exists. INSTALL.md tells the installer to run `npm ci` before seeding demo
  // data, so a package without this file would upload the whole node_modules
  // tree on the next ./scripts/deploy.sh. Being explicit also means a developer
  // checkout and a customer's installation upload the same build context.
  const lines = () => repo!.gcloudignore.split('\n').map((line) => line.trim());

  for (const rule of ['node_modules/', '.next/', 'dist/', '.git/', '.deploy.env', '__pycache__/']) {
    it(`keeps ${rule} out of the build upload`, () => {
      expect(lines()).toContain(rule);
    });
  }

  it('still uploads what the Dockerfile needs', () => {
    // The tester stage typechecks and runs the suite, so tests/ and scripts/
    // must reach the build context. Excluding them would turn the correctness
    // gate into a no-op without anything failing.
    for (const needed of ['src', 'tests', 'scripts', 'public', 'package.json']) {
      expect(lines()).not.toContain(needed);
      expect(lines()).not.toContain(`${needed}/`);
    }
  });
});

describeRepo('the ZIP unpacks into one directory, and the instructions match its name', () => {
  // A flat ZIP is not a cosmetic problem. The documented first step runs
  // `unzip` in Cloud Shell, which is the customer's home directory: a flat
  // archive empties 275 files into it, and the `cd` on the very next line then
  // fails. The packager stages everything under `<name>-v<version>/`.
  const stamp = () => `${repo!.pkg.name}-v${repo!.pkg.version}`;

  it('stages under the stamped directory rather than zipping a bare tree', () => {
    expect(repo!.packager).toContain('STAGE="dist/staging/${STAMP}"');
    // `zip -qr ../X.zip .` is the flat form this test exists to prevent.
    expect(repo!.packager).toContain('zip -qr "../${STAMP}.zip" "$STAMP"');
  });

  it('INSTALL.md tells the reader to cd into the directory that appears', () => {
    expect(repo!.installVi).toContain(`cd ${stamp()}`);
  });

  it('INSTALL.en.md tells the reader to cd into the directory that appears', () => {
    expect(repo!.installEn).toContain(`cd ${stamp()}`);
  });
});

describeRepo("the packager's completeness list stays honest", () => {
  /**
   * The packager checks the staged archive for these files. It cannot know
   * whether they are things this repository actually produces — so that half is
   * checked from here. Between the two, a file cannot be promised to a customer
   * and then quietly stop shipping, in either direction.
   */
  /** Written into the staging directory by the packager, so never in git. */
  const generated = ['VERSION', 'THIRD_PARTY_NOTICES.md'];

  it('has a list at all, so a silent regex change cannot empty it', () => {
    expect(repo!.declared.length).toBeGreaterThan(15);
  });

  it('promises nothing this repository does not produce', () => {
    const phantom = repo!.declared.filter(
      (file) => !generated.includes(file) && !repo!.tracked.includes(file),
    );
    expect(phantom).toEqual([]);
  });

  it('covers everything the documentation sends the customer to', () => {
    // These are named in INSTALL.md, install.sh or the licence section. Losing
    // one from the archive is a broken instruction in a paid product.
    const documented = [
      'install.sh',
      'INSTALL.md',
      'INSTALL.en.md',
      'HUONG_DAN.md',
      'LICENSE',
      'THIRD_PARTY_NOTICES.md',
      'VERSION',
      '.deploy.env.example',
      'scripts/gcp-setup.sh',
      'scripts/deploy.sh',
      'scripts/uninstall.sh',
      'scripts/firebase_setup.py',
      'cloudbuild.yaml',
      'Dockerfile',
      'package-lock.json',
    ];
    for (const file of documented) {
      expect(repo!.declared, file).toContain(file);
    }
  });

  it('has a package-lock, so the buyer builds the dependency tree we tested', () => {
    expect(repo!.lock.lockfileVersion).toBeGreaterThanOrEqual(2);
  });

  it('declares a licence rather than leaving it undefined', () => {
    expect(repo!.pkg.license).toBeTruthy();
    expect(repo!.pkg.private).toBe(true);
  });
});
