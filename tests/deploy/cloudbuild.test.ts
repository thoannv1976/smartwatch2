import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Guards the Cloud Build step graph.
 *
 * These are not style checks. Two builds failed in production because the
 * deploy step ran `gcloud run deploy --image=...:${SHORT_SHA}` against a tag
 * that had never been pushed: the pushes were declared in an `images:` block,
 * and Cloud Build only pushes those AFTER every step has finished — i.e. after
 * the deploy. The failure is invisible locally (the file is valid YAML, the
 * image builds, the tests pass) and costs a full ~4 minute build to discover,
 * so the invariant is asserted here instead.
 *
 * The file is parsed with a purpose-built reader rather than a YAML library:
 * `js-yaml` is only present transitively through ESLint, and adding a real
 * dependency to assert five lines of structure is a worse trade.
 */

const yaml = readFileSync(path.resolve(__dirname, '../../cloudbuild.yaml'), 'utf8');

interface Step {
  id: string;
  waitFor: string[];
  /** Everything in the step's body, substitutions left as written. */
  body: string;
}

function parseSteps(source: string): Step[] {
  const lines = source.split('\n');
  const start = lines.findIndex((l) => l === 'steps:');
  if (start === -1) throw new Error('cloudbuild.yaml has no top-level `steps:` key');

  // A step begins at `  - id: <name>` and runs until the next one, or until the
  // next top-level key (a line with a non-space first character).
  const steps: Step[] = [];
  let current: Step | null = null;

  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break; // left the steps block
    const header = /^ {2}- id: (\S+)\s*$/.exec(line);
    if (header) {
      current = { id: header[1]!, waitFor: [], body: '' };
      steps.push(current);
      continue;
    }
    if (!current) continue;

    const wait = /^ {4}waitFor: \[(.*)\]\s*$/.exec(line);
    if (wait) {
      current.waitFor = wait[1]!
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      continue;
    }
    current.body += `${line}\n`;
  }

  if (steps.length === 0) throw new Error('parsed no steps — has the file layout changed?');
  return steps;
}

const steps = parseSteps(yaml);
const byId = new Map(steps.map((s) => [s.id, s]));

/** Every step that must finish before `id` starts. */
function upstreamOf(id: string): Set<string> {
  const seen = new Set<string>();
  const walk = (current: string) => {
    for (const parent of byId.get(current)?.waitFor ?? []) {
      if (seen.has(parent)) continue;
      seen.add(parent);
      walk(parent);
    }
  };
  walk(id);
  return seen;
}

const APP_TAG = '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPOSITORY}/${_SERVICE}:${SHORT_SHA}';

describe('cloudbuild.yaml', () => {
  it('declares no `images:` block', () => {
    // Cloud Build pushes `images:` only after the LAST step, so the deploy step
    // would reference a tag that does not exist yet. Pushes are explicit steps.
    expect(yaml).not.toMatch(/^images:/m);
  });

  it('has a deploy step that deploys the commit-tagged image', () => {
    const deploy = byId.get('deploy');
    expect(deploy, 'no step with id `deploy`').toBeDefined();
    expect(deploy!.body).toContain(`--image=${APP_TAG}`);
  });

  it('pushes the deployed image in a step the deploy waits on', () => {
    const upstream = upstreamOf('deploy');
    const pushers = steps.filter(
      (s) => /(^|\s)push(\s|$)/m.test(s.body) && s.body.includes(APP_TAG),
    );

    expect(pushers.map((s) => s.id), 'nothing pushes the tag deploy consumes').not.toHaveLength(0);
    expect(
      pushers.some((s) => upstream.has(s.id)),
      `deploy waits on [${[...upstream].join(', ')}] but the tag is only pushed by ` +
        `[${pushers.map((s) => s.id).join(', ')}] — the deploy would race the push`,
    ).toBe(true);
  });

  it('runs the test suite before deploying', () => {
    // Skipping the tests would let a broken simulation reach students.
    expect(upstreamOf('deploy').has('test')).toBe(true);
    expect(byId.get('test')!.body).toContain('--target=tester');
  });

  it('only waits on steps that exist and come earlier', () => {
    const order = steps.map((s) => s.id);
    for (const [index, step] of steps.entries()) {
      for (const parent of step.waitFor) {
        expect(order, `${step.id} waits on unknown step ${parent}`).toContain(parent);
        expect(
          order.indexOf(parent),
          `${step.id} waits on ${parent}, which is declared later`,
        ).toBeLessThan(index);
      }
    }
  });
});
