#!/usr/bin/env bash
#
# Build the release ZIP that is handed to an institution.
#
#   ./scripts/make-package.sh              build from HEAD
#   ./scripts/make-package.sh --skip-checks  build without running the test gate
#
# Produces dist/smartwatch-ceo-challenge-v<version>.zip
#
# THREE GATES, AND THE THIRD IS THE IMPORTANT ONE.
#
#   1. The working tree must be clean. A ZIP that matches no commit cannot be
#      supported: a customer reports a fault and there is no way to check out
#      exactly what they are running.
#
#   2. typecheck + test + lint + balance must all pass. The Docker `tester`
#      stage only runs tsc and vitest, so this gate is stricter than the build
#      the customer will run. Shipping a red build to somebody who paid for it
#      is the one failure that has no excuse.
#
#   3. THE ARCHIVE IS BUILT WITH `git archive`, NOT `zip -r`.
#      `git archive` writes only COMMITTED files. That makes it structurally
#      impossible to ship .env.local, .deploy.env, a service-account JSON,
#      node_modules, .next (420 MB of it), firebase-debug.log or a stale
#      __pycache__/*.pyc — even when those files are sitting in the working
#      directory of whoever is building. For a file you email to a paying
#      customer that is not a convenience, it is the safety boundary.
#
# Three things are then added that are deliberately not in git: VERSION (so
# support can ask what someone is running), THIRD_PARTY_NOTICES.md (generated
# from the real dependency tree) and a top-level README for the ZIP itself.

set -euo pipefail

cd "$(dirname "$0")/.."

SKIP_CHECKS=false
[[ "${1:-}" == "--skip-checks" ]] && SKIP_CHECKS=true

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[32m%s\033[0m\n' "$1"; }
warn() { printf '    \033[33m%s\033[0m\n' "$1"; }
die()  { printf '\n\033[31mSTOPPED: %s\033[0m\n' "$1" >&2; exit 1; }

command -v git >/dev/null || die "git is required: the archive is built from the commit, not from the directory"
command -v zip >/dev/null || die "zip is required"

VERSION="$(node -p "require('./package.json').version")"
NAME="$(node -p "require('./package.json').name")"
STAMP="${NAME}-v${VERSION}"
OUT="dist/${STAMP}.zip"

# --- Gate 1: the tree must match a commit ----------------------------------

step "Checking the working tree"
if [[ -n "$(git status --porcelain)" ]]; then
  git status --short | sed 's/^/    /'
  die "uncommitted changes. The ZIP is built from the commit, so an unclean tree
       would produce a package nobody can reproduce. Commit or stash first."
fi
COMMIT="$(git rev-parse HEAD)"
ok "clean at ${COMMIT:0:12}"

# --- Gate 2: everything must be green --------------------------------------

if $SKIP_CHECKS; then
  warn "SKIPPING the test gate. Do not ship the result of this run."
else
  step "Release gate: typecheck, tests, lint, balance"
  npm run typecheck   || die "typecheck failed"
  ok "typecheck"
  npm test            || die "tests failed"
  ok "tests"
  npm run lint        || die "lint failed"
  ok "lint"
  npm run balance > /tmp/balance-$$.txt 2>&1 || die "balance script failed"
  if grep -q '^FAIL' /tmp/balance-$$.txt; then
    grep '^FAIL' /tmp/balance-$$.txt | sed 's/^/    /'
    rm -f /tmp/balance-$$.txt
    die "balance checks failed"
  fi
  ok "balance ($(grep -c '^PASS' /tmp/balance-$$.txt) checks)"
  rm -f /tmp/balance-$$.txt
fi

# --- Gate 3: archive only what is committed --------------------------------

step "Building the archive"
rm -rf dist/staging "$OUT"
mkdir -p dist/staging

git archive --format=tar HEAD | tar -x -C dist/staging
ok "$(find dist/staging -type f | wc -l | tr -d ' ') committed files"

# Belt and braces. `git archive` cannot include these, but a future change to
# how the staging directory is assembled could — and by then nobody would be
# looking. Cheap to check, catastrophic to miss.
step "Checking the archive for anything that must never ship"
LEAKS="$(find dist/staging \
  \( -name '.env' -o -name '.env.local' -o -name '.deploy.env' \
     -o -name 'serviceAccount*.json' -o -name '*.pyc' -o -name '*-debug.log' \
     -o -name 'node_modules' -o -name '.next' \) -print)"
if [[ -n "$LEAKS" ]]; then
  echo "$LEAKS" | sed 's/^/    /'
  die "the staged package contains files that must not be distributed"
fi
ok "no secrets, build output or bytecode"

# --- Stamp it --------------------------------------------------------------

step "Stamping the package"
cat > dist/staging/VERSION <<STAMPFILE
Smartwatch CEO Challenge
version   ${VERSION}
commit    ${COMMIT}
built     $(date -u +%Y-%m-%dT%H:%M:%SZ)
engine    $(node -e "const s=require('fs').readFileSync('src/domain/simulation/config.ts','utf8');console.log((s.match(/ENGINE_VERSION\s*=\s*'([^']+)'/)||[,'?'])[1])")
scenario  $(node -e "const s=require('fs').readFileSync('src/domain/simulation/config.ts','utf8');console.log((s.match(/SCENARIO_VERSION\s*=\s*'([^']+)'/)||[,'?'])[1])")

Quote the version and commit when reporting a problem.
STAMPFILE
sed 's/^/    /' dist/staging/VERSION

step "Generating third-party notices"
if [[ -d node_modules ]]; then
  node scripts/third-party-notices.mjs "$PWD/dist/staging/THIRD_PARTY_NOTICES.md"
else
  warn "node_modules is missing, so notices cannot be generated. Run npm ci first."
  die "refusing to ship a package without THIRD_PARTY_NOTICES.md"
fi

# --- Legal placeholders, flagged loudly ------------------------------------

PLACEHOLDERS="$(grep -c '\[FILL IN' dist/staging/LICENSE || true)"
LAWYER="$(grep -c '\[LAWYER\]' dist/staging/LICENSE || true)"

# --- Zip it ----------------------------------------------------------------

step "Writing $OUT"
( cd dist/staging && zip -qr "../${STAMP}.zip" . -x '.git*' )
rm -rf dist/staging

SIZE="$(du -h "$OUT" | cut -f1)"
COUNT="$(unzip -l "$OUT" | tail -1 | awk '{print $2}')"

step "Done"
printf '    %s\n    %s, %s files\n' "$OUT" "$SIZE" "$COUNT"

if [[ "$PLACEHOLDERS" -gt 0 || "$LAWYER" -gt 0 ]]; then
  printf '\n'
  warn "LICENSE still has ${PLACEHOLDERS} [FILL IN] and ${LAWYER} [LAWYER] placeholders."
  warn "That is fine for testing the build. It is not fine for a customer:"
  warn "fill them in, and have a lawyer read it, before this ZIP leaves your hands."
fi

if grep -q 'FILL IN' package.json; then
  warn "package.json still says \"[FILL IN: your name or company]\" for author."
fi

printf '\n    Before sending it to anyone, install it once on a brand-new GCP project:\n'
printf '        unzip %s && cd %s && ./install.sh\n\n' "$OUT" "$STAMP"
