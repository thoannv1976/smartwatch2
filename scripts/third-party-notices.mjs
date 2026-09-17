#!/usr/bin/env node
/**
 * Generates THIRD_PARTY_NOTICES.md from the installed dependency tree.
 *
 * WHY IT IS GENERATED AND NOT WRITTEN BY HAND. A hand-written notices file is
 * wrong the first time a dependency is added, and nobody notices because
 * nothing tests it. This one is rebuilt from `node_modules` every time the
 * package is built, so it cannot drift from `package-lock.json`.
 *
 * WHAT THIS FILE IS AND IS NOT, stated accurately:
 *
 *   The distributed ZIP contains OUR source plus `package.json` and
 *   `package-lock.json`. It does NOT contain third-party code — npm fetches
 *   that at the buyer's own build, from npm, with each package's own licence
 *   text inside it. So this file is not us discharging a redistribution
 *   obligation; strictly, we are not redistributing those packages.
 *
 *   It exists because a university's procurement or legal office will ask what
 *   is in the product, and "here is the list, with licences" is a better answer
 *   than "run npm ls yourself". It is also what makes the Docker image the
 *   buyer builds explainable to their own auditors.
 *
 * Usage:  node scripts/third-party-notices.mjs [output-path]
 * Requires `npm ci` to have been run, because it reads node_modules.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] ?? 'THIRD_PARTY_NOTICES.md';
const ROOT = process.cwd();

/** Package paths from npm, split into production and development. */
function listPackages(omitDev) {
  const args = ['ls', '--all', '--parseable', '--long=false'];
  if (omitDev) args.push('--omit=dev');
  let out = '';
  try {
    out = execFileSync('npm', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (error) {
    // `npm ls` exits non-zero on peer-dependency warnings while still printing
    // a complete tree. The output is what matters, not the exit code.
    out = error.stdout ?? '';
  }
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line !== ROOT && line.includes('node_modules'));
}

/** The licence text a package ships, if it ships one. */
function licenceText(dir) {
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  const match = names.find((name) => /^(LICENSE|LICENCE|COPYING)(\.\w+)?$/i.test(name));
  if (!match) return null;
  try {
    const text = readFileSync(path.join(dir, match), 'utf8').trim();
    // A 40 KB licence file is almost always a bundled collection; the notice is
    // more readable with a pointer than with the whole thing inlined.
    return text.length > 8000 ? `${text.slice(0, 8000)}\n\n[... truncated, full text in ${match}]` : text;
  } catch {
    return null;
  }
}

function describe(dir) {
  const manifestPath = path.join(dir, 'package.json');
  if (!existsSync(manifestPath)) return null;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
  if (!manifest.name || !manifest.version) return null;

  const licence =
    typeof manifest.license === 'string'
      ? manifest.license
      : manifest.license?.type ?? (Array.isArray(manifest.licenses) ? manifest.licenses.map((l) => l.type).join(' OR ') : 'UNKNOWN');

  const repository =
    typeof manifest.repository === 'string' ? manifest.repository : (manifest.repository?.url ?? '');

  return {
    name: manifest.name,
    version: manifest.version,
    licence: licence || 'UNKNOWN',
    repository: repository.replace(/^git\+/, '').replace(/\.git$/, ''),
    dir,
  };
}

function collect(omitDev) {
  const seen = new Map();
  for (const dir of listPackages(omitDev)) {
    const info = describe(dir);
    if (!info) continue;
    seen.set(`${info.name}@${info.version}`, info);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const production = collect(true);
const everything = collect(false);
const prodKeys = new Set(production.map((p) => `${p.name}@${p.version}`));
const devOnly = everything.filter((p) => !prodKeys.has(`${p.name}@${p.version}`));

const root = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const direct = Object.keys(root.dependencies ?? {});

const byLicence = new Map();
for (const pkg of everything) {
  byLicence.set(pkg.licence, (byLicence.get(pkg.licence) ?? 0) + 1);
}

const rows = (list) =>
  list
    .map((p) => `| \`${p.name}\` | ${p.version} | ${p.licence} | ${p.repository || '—'} |`)
    .join('\n');

const out = `# Third-party notices

${root.name} ${root.version} — generated ${new Date().toISOString().slice(0, 10)} by
\`scripts/third-party-notices.mjs\`. Do not edit by hand; it is rebuilt on every release.

## What this file is

This package is distributed as source. It contains this project's own code plus
\`package.json\` and \`package-lock.json\`; the third-party packages below are
fetched from the npm registry during your own build, each carrying its own
licence text. This file is a manifest so your procurement or legal office can
see what the product depends on without running \`npm ls\`.

Packages are licensed to you by their own authors under their own terms. Nothing
in this project's LICENCE restricts any right an open-source licence grants you.

## Summary

- **${production.length}** packages in the production dependency tree
- **${devOnly.length}** additional packages used only to build and test
- Licences present: ${[...byLicence.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name} (${count})`).join(', ')}

## Direct dependencies

${direct.map((name) => `- \`${name}\` ${root.dependencies[name]}`).join('\n')}

## Production dependency tree

| Package | Version | Licence | Source |
|---|---|---|---|
${rows(production)}

## Build and test only

These are not present in the deployed container image.

| Package | Version | Licence | Source |
|---|---|---|---|
${rows(devOnly)}

## Licence texts — direct dependencies

${direct
  .map((name) => {
    const pkg = production.find((p) => p.name === name);
    if (!pkg) return `### ${name}\n\nNot installed; run \`npm ci\` and regenerate.`;
    const text = licenceText(pkg.dir);
    return `### ${pkg.name} ${pkg.version} — ${pkg.licence}\n\n${
      text ? `\`\`\`\n${text}\n\`\`\`` : `No licence file shipped in the package. Declared licence: ${pkg.licence}. See ${pkg.repository || 'the package registry'}.`
    }`;
  })
  .join('\n\n')}
`;

// `path.resolve` so an absolute output path is honoured, which is what the
// package builder passes when it writes into a staging directory.
writeFileSync(path.resolve(ROOT, OUT), out);
console.log(`${OUT}: ${production.length} production + ${devOnly.length} build-only packages`);
