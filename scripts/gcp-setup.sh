#!/usr/bin/env bash
#
# One-time GCP setup for Smartwatch CEO Challenge.
#
# Idempotent: safe to re-run. Anything that already exists is left alone, so a
# failure halfway through is fixed by running it again.
#
#   ./scripts/gcp-setup.sh <PROJECT_ID> [REGION] [BOOTSTRAP_ADMIN_EMAIL]
#
# On success it writes .deploy.env, after which every deploy is one command:
#
#   ./scripts/deploy.sh
#
# Run it in Cloud Shell if you can — gcloud is already authenticated there, and
# the network to Artifact Registry is Google-internal.

set -euo pipefail

PROJECT_ID="${1:-}"
REGION="${2:-asia-southeast1}"
BOOTSTRAP_ADMIN_EMAIL="${3:-}"
SERVICE="smartwatch-ceo-challenge"
REPOSITORY="apps"

if [[ -z "$PROJECT_ID" ]]; then
  echo "usage: $0 <PROJECT_ID> [REGION] [BOOTSTRAP_ADMIN_EMAIL]" >&2
  exit 2
fi

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok() { printf '    \033[32m%s\033[0m\n' "$1"; }
warn() { printf '    \033[33m%s\033[0m\n' "$1"; }

# --- 0. Preconditions ------------------------------------------------------
# Checked up front: a missing prerequisite should stop here with a clear
# instruction rather than fail three minutes into a build.

step "Checking prerequisites"

command -v gcloud >/dev/null || { echo "gcloud is not installed. https://cloud.google.com/sdk/docs/install" >&2; exit 1; }

if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q .; then
  echo "No active gcloud account. Run: gcloud auth login" >&2
  exit 1
fi
ok "gcloud authenticated as $(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -1)"

gcloud config set project "$PROJECT_ID" >/dev/null
ok "project set to $PROJECT_ID"

if gcloud beta billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null | grep -qi true; then
  ok "billing is enabled"
else
  warn "could not confirm billing is enabled (the gcloud beta component may be missing)."
  warn "If later steps fail with a billing error, enable it at:"
  warn "  https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
fi

# --- 1. APIs ---------------------------------------------------------------
# One call: enabling them in a single request is much faster than five.

step "Enabling APIs (takes a minute the first time)"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  identitytoolkit.googleapis.com \
  iamcredentials.googleapis.com \
  --project "$PROJECT_ID"
ok "APIs enabled"

# --- 2. Firestore ----------------------------------------------------------

step "Creating the Firestore database (Native mode)"
if gcloud firestore databases describe --database='(default)' --project "$PROJECT_ID" >/dev/null 2>&1; then
  ok "already exists"
else
  gcloud firestore databases create \
    --location="$REGION" --type=firestore-native --project "$PROJECT_ID"
  ok "created in $REGION"
fi

# --- 3. Runtime service account -------------------------------------------
# Cloud Run runs as this account and the Firebase Admin SDK picks it up through
# Application Default Credentials, so no key file is ever created.

step "Creating the runtime service account and granting roles"
SA_EMAIL="${SERVICE}@${PROJECT_ID}.iam.gserviceaccount.com"

if gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
  ok "service account already exists"
else
  gcloud iam service-accounts create "$SERVICE" \
    --display-name="Smartwatch CEO Challenge runtime" --project "$PROJECT_ID"
  ok "created $SA_EMAIL"
fi

# add-iam-policy-binding is idempotent. Output is the whole policy, so quieten it.
for role in roles/datastore.user roles/firebaseauth.admin roles/iam.serviceAccountTokenCreator; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" --role="$role" \
    --condition=None --quiet >/dev/null
  ok "granted $role"
done

# --- 4. Artifact Registry --------------------------------------------------

step "Creating the Artifact Registry repository"
if gcloud artifacts repositories describe "$REPOSITORY" \
  --location="$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  ok "already exists"
else
  gcloud artifacts repositories create "$REPOSITORY" \
    --repository-format=docker --location="$REGION" \
    --description="Container images" --project "$PROJECT_ID"
  ok "created"
fi

# --- 5. Firebase web app ---------------------------------------------------
# Fetched with the CLI rather than copied out of the console by hand.

step "Getting the Firebase web app configuration"
if ! command -v firebase >/dev/null; then
  warn "firebase-tools is not installed; installing it locally"
  npm install -g firebase-tools >/dev/null 2>&1 || {
    echo "Could not install firebase-tools. Run: npm install -g firebase-tools" >&2
    exit 1
  }
fi

if ! firebase projects:list --json >/dev/null 2>&1; then
  echo "firebase CLI is not authenticated. Run: firebase login" >&2
  exit 1
fi

APP_ID="$(firebase apps:list WEB --project "$PROJECT_ID" 2>/dev/null \
  | grep -oE '1:[0-9]+:web:[0-9a-f]+' | head -1 || true)"

if [[ -z "$APP_ID" ]]; then
  firebase apps:create WEB "Smartwatch CEO Challenge" --project "$PROJECT_ID" >/dev/null
  APP_ID="$(firebase apps:list WEB --project "$PROJECT_ID" 2>/dev/null \
    | grep -oE '1:[0-9]+:web:[0-9a-f]+' | head -1 || true)"
  ok "created web app"
else
  ok "reusing existing web app"
fi

if [[ -z "$APP_ID" ]]; then
  echo "Could not determine the Firebase web app id. Create one in the console and re-run." >&2
  exit 1
fi

SDK_CONFIG="$(firebase apps:sdkconfig WEB "$APP_ID" --project "$PROJECT_ID" --json 2>/dev/null || true)"
API_KEY="$(printf '%s' "$SDK_CONFIG" | grep -oE '"apiKey"[[:space:]]*:[[:space:]]*"[^"]+"' | sed 's/.*"\([^"]*\)"$/\1/' | head -1)"
AUTH_DOMAIN="$(printf '%s' "$SDK_CONFIG" | grep -oE '"authDomain"[[:space:]]*:[[:space:]]*"[^"]+"' | sed 's/.*"\([^"]*\)"$/\1/' | head -1)"
AUTH_DOMAIN="${AUTH_DOMAIN:-${PROJECT_ID}.firebaseapp.com}"

if [[ -z "$API_KEY" ]]; then
  echo "Could not read the web apiKey from firebase apps:sdkconfig." >&2
  echo "Get it from https://console.firebase.google.com/project/$PROJECT_ID/settings/general" >&2
  exit 1
fi
ok "appId $APP_ID"
ok "authDomain $AUTH_DOMAIN"

# --- 6. Sign-in providers --------------------------------------------------
# Email/Password is configurable over the Identity Platform admin API.
# Google sign-in needs an OAuth client, which realistically means the console.

step "Enabling the Email/Password sign-in provider"
TOKEN="$(gcloud auth print-access-token)"
if curl -sS -f -X PATCH \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{"signIn":{"email":{"enabled":true,"passwordRequired":true}}}' >/dev/null 2>&1; then
  ok "enabled"
else
  warn "could not enable it over the API (Firebase Auth may need initialising once in the console)."
  warn "Enable it here: https://console.firebase.google.com/project/$PROJECT_ID/authentication/providers"
fi

# --- 7. Rules and indexes --------------------------------------------------
# The rules deny the client SDK everything; that is what makes "the browser
# sends only decisions" a property the database enforces.

step "Deploying the Firestore rules and indexes"
firebase deploy --only firestore:rules,firestore:indexes --project "$PROJECT_ID" --non-interactive
ok "deployed (composite indexes build in the background for a minute or two)"

# --- 8. Remember the answers ----------------------------------------------

step "Writing .deploy.env"
cat > .deploy.env <<EOF
# Written by scripts/gcp-setup.sh — used by scripts/deploy.sh.
# These Firebase web values are public by design, but this file is gitignored.
PROJECT_ID=$PROJECT_ID
REGION=$REGION
SERVICE=$SERVICE
FIREBASE_API_KEY=$API_KEY
FIREBASE_AUTH_DOMAIN=$AUTH_DOMAIN
FIREBASE_APP_ID=$APP_ID
BOOTSTRAP_ADMIN_EMAIL=$BOOTSTRAP_ADMIN_EMAIL
EOF
ok ".deploy.env written"

cat <<EOF

────────────────────────────────────────────────────────────────────
Setup done. Now deploy:

    ./scripts/deploy.sh

Two things still need a human in a browser, and only once:

1. Google sign-in needs an OAuth client:
   https://console.firebase.google.com/project/$PROJECT_ID/authentication/providers
   (Email/Password already works without this.)

2. After the first deploy, add the Cloud Run hostname to the authorized
   domains, or sign-in fails with auth/unauthorized-domain.
   deploy.sh prints the hostname and attempts this for you.
────────────────────────────────────────────────────────────────────
EOF
