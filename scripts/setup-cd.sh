#!/usr/bin/env bash
#
# One-time setup for continuous deployment: a Cloud Build trigger that builds
# and deploys this repository on every push to a branch you choose.
#
# After this runs, `git push` IS the deploy. Nothing has to be typed into Cloud
# Shell again, and no credential ever leaves Google Cloud.
#
#   ./scripts/setup-cd.sh                 # trigger on pushes to main
#   ./scripts/setup-cd.sh <branch-regex>  # e.g. '^(main|release)$'
#
# Idempotent: run it as many times as you like. If the one browser step has not
# been done yet, it says exactly what to click and stops without changing
# anything.
#
# Why a Cloud Build trigger rather than GitHub Actions: the build already runs
# on Cloud Build (cloudbuild.yaml), so this adds no second CI system, no key
# file, and no secrets stored outside GCP — the substitutions live in the
# trigger. The cost is one browser click, once, to let Cloud Build read the
# repository.

set -euo pipefail

BRANCH_PATTERN="${1:-^main$}"
TRIGGER_NAME="smartwatch-deploy"

step() { printf '\n\033[1;34m▸\033[0m %s\n' "$1"; }
ok()   { printf '  \033[0;32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[0;33m!\033[0m %s\n' "$1"; }
die()  { printf '\n\033[0;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

cd "$(dirname "$0")/.."

# ---------------------------------------------------------------- 1. inputs --
[[ -f .deploy.env ]] || die "No .deploy.env found. Run ./scripts/gcp-setup.sh <PROJECT_ID> first."
set -a; source .deploy.env; set +a

: "${PROJECT_ID:?missing in .deploy.env}"
: "${REGION:?missing in .deploy.env}"
: "${SERVICE:?missing in .deploy.env}"
: "${FIREBASE_API_KEY:?missing in .deploy.env}"
: "${FIREBASE_APP_ID:?missing in .deploy.env}"

command -v gcloud >/dev/null || die "gcloud is not installed. Run this in Cloud Shell."

# The GitHub repository this checkout points at, so the trigger cannot be
# pointed at the wrong one by accident.
ORIGIN_URL="$(git remote get-url origin 2>/dev/null || true)"
[[ -n "$ORIGIN_URL" ]] || die "This checkout has no 'origin' remote."
# Match the host explicitly. Trimming a prefix that is not there leaves the
# string untouched, so parsing without this test turns a non-GitHub remote into
# a nonsense owner ("https:") instead of an error.
[[ "$ORIGIN_URL" == *github.com[:/]* ]] \
  || die "origin is not a GitHub remote, so Cloud Build cannot watch it: $ORIGIN_URL"

REPO_PATH="${ORIGIN_URL#*github.com[:/]}"
REPO_PATH="${REPO_PATH%.git}"
REPO_PATH="${REPO_PATH%/}"
REPO_OWNER="${REPO_PATH%%/*}"
REPO_NAME="${REPO_PATH##*/}"
[[ "$REPO_OWNER" != "$REPO_PATH" && -n "$REPO_OWNER" && -n "$REPO_NAME" ]] \
  || die "could not read owner/repo out of origin: $ORIGIN_URL"

step "Continuous deployment for $REPO_OWNER/$REPO_NAME"
echo "    project: $PROJECT_ID"
echo "    region:  $REGION"
echo "    deploys: pushes matching  $BRANCH_PATTERN"

gcloud config set project "$PROJECT_ID" >/dev/null 2>&1

# ------------------------------------------------------------------ 2. APIs --
step "Enabling the APIs a trigger needs"
gcloud services enable \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  --project "$PROJECT_ID" >/dev/null
ok "enabled"

# ------------------------------------------------- 3. the one browser step --
# Cloud Build can only read a private repository after the Cloud Build GitHub
# App has been installed on it. That authorisation is an OAuth grant, so it
# cannot be done from a script — by design, and the same would be true of any
# other tool. It is needed exactly once per repository.
step "Checking that Cloud Build can see the repository"

CONNECTED=""
if gcloud beta builds repositories list --region="$REGION" --project "$PROJECT_ID" \
     --format='value(remoteUri)' 2>/dev/null | grep -qi "$REPO_OWNER/$REPO_NAME"; then
  CONNECTED="yes"
fi

if [[ -z "$CONNECTED" ]]; then
  cat <<EOF

────────────────────────────────────────────────────────────────────
  ONE BROWSER STEP, ONCE. Nothing has been changed yet.

  Open:

    https://console.cloud.google.com/cloud-build/triggers/connect?project=$PROJECT_ID

  1. Region: $REGION
  2. Source: GitHub  →  Continue  →  authorise Google Cloud Build
  3. Pick the repository: $REPO_OWNER/$REPO_NAME  →  Connect
  4. When it offers to create a trigger, click Skip / Done — this
     script creates the trigger for you with the right substitutions.

  Then run this script again:

    ./scripts/setup-cd.sh $BRANCH_PATTERN
────────────────────────────────────────────────────────────────────

EOF
  exit 2
fi
ok "repository is connected"

# ------------------------------------------------------- 4. build SA rights --
# The trigger runs as the Cloud Build service account, which must be able to
# deploy Cloud Run and to act as the runtime service account. gcp-setup.sh
# grants these too (section 3b); repeated here because CD can be set up on a
# project where that section predates this script.
step "Checking the Cloud Build service account can deploy"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUNTIME_SA="${SERVICE}@${PROJECT_ID}.iam.gserviceaccount.com"

for BUILD_SA in \
  "${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  "${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
do
  gcloud iam service-accounts describe "$BUILD_SA" --project "$PROJECT_ID" >/dev/null 2>&1 || continue

  for ROLE in roles/run.admin roles/artifactregistry.writer roles/logging.logWriter; do
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member="serviceAccount:$BUILD_SA" --role="$ROLE" \
      --condition=None --quiet >/dev/null 2>&1 || warn "could not grant $ROLE to $BUILD_SA"
  done

  # Deploying a service that RUNS AS another account requires actAs on it.
  gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
    --member="serviceAccount:$BUILD_SA" \
    --role="roles/iam.serviceAccountUser" \
    --project "$PROJECT_ID" --quiet >/dev/null 2>&1 \
    || warn "could not grant actAs on $RUNTIME_SA to $BUILD_SA"

  ok "$BUILD_SA"
done

# --------------------------------------------------------- 5. the trigger --
# BOOTSTRAP_ADMIN_EMAIL is deliberately left empty here. It only ever applies to
# a brand-new account, your admin already exists by the time CD is set up, and
# an empty value keeps the class roster out of the build configuration.
SUBSTITUTIONS="_REGION=${REGION}"
SUBSTITUTIONS+=",_SERVICE=${SERVICE}"
SUBSTITUTIONS+=",_FIREBASE_API_KEY=${FIREBASE_API_KEY}"
SUBSTITUTIONS+=",_FIREBASE_AUTH_DOMAIN=${FIREBASE_AUTH_DOMAIN}"
SUBSTITUTIONS+=",_FIREBASE_APP_ID=${FIREBASE_APP_ID}"

step "Creating the trigger"

if gcloud beta builds triggers describe "$TRIGGER_NAME" \
     --region="$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud beta builds triggers update github "$TRIGGER_NAME" \
    --region="$REGION" --project "$PROJECT_ID" \
    --repo-name="$REPO_NAME" --repo-owner="$REPO_OWNER" \
    --branch-pattern="$BRANCH_PATTERN" \
    --build-config=cloudbuild.yaml \
    --substitutions="$SUBSTITUTIONS" >/dev/null
  ok "updated '$TRIGGER_NAME'"
else
  gcloud beta builds triggers create github \
    --name="$TRIGGER_NAME" \
    --region="$REGION" --project "$PROJECT_ID" \
    --repo-name="$REPO_NAME" --repo-owner="$REPO_OWNER" \
    --branch-pattern="$BRANCH_PATTERN" \
    --build-config=cloudbuild.yaml \
    --substitutions="$SUBSTITUTIONS" \
    --description="Build, test and deploy $SERVICE on push" >/dev/null
  ok "created '$TRIGGER_NAME'"
fi

cat <<EOF

────────────────────────────────────────────────────────────────────
Continuous deployment is on.

Every push to a branch matching  $BRANCH_PATTERN  now runs the same
pipeline as ./scripts/deploy.sh: typecheck, 118 tests, build, push,
deploy. A failing test stops the deploy.

Watch builds:
    https://console.cloud.google.com/cloud-build/builds?project=$PROJECT_ID

Deploy right now without waiting for a push:
    gcloud beta builds triggers run $TRIGGER_NAME \\
      --region=$REGION --branch=main --project=$PROJECT_ID

Change which branch deploys:
    ./scripts/setup-cd.sh '^(main|release)\$'

Turn it off:
    gcloud beta builds triggers delete $TRIGGER_NAME --region=$REGION --project=$PROJECT_ID

One thing CD does NOT do: authorising a brand-new Cloud Run hostname
for Firebase sign-in. The hostname only changes if you rename or
recreate the service; if that happens, run ./scripts/deploy.sh once,
or add it here:
    https://console.firebase.google.com/project/$PROJECT_ID/authentication/settings
────────────────────────────────────────────────────────────────────

EOF
