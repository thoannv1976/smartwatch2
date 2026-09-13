#!/usr/bin/env bash
#
# Deploy Smartwatch CEO Challenge to Cloud Run.
#
#   ./scripts/deploy.sh
#
# Reads .deploy.env (written by scripts/gcp-setup.sh) so there is nothing to
# remember or paste. Run gcp-setup.sh first.

set -euo pipefail

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok() { printf '    \033[32m%s\033[0m\n' "$1"; }
warn() { printf '    \033[33m%s\033[0m\n' "$1"; }

if [[ ! -f .deploy.env ]]; then
  echo "No .deploy.env found. Run ./scripts/gcp-setup.sh <PROJECT_ID> first." >&2
  exit 2
fi

# shellcheck disable=SC1091
set -a; source .deploy.env; set +a

: "${PROJECT_ID:?missing in .deploy.env}"
: "${REGION:?missing in .deploy.env}"
: "${SERVICE:?missing in .deploy.env}"
: "${FIREBASE_API_KEY:?missing in .deploy.env}"
: "${FIREBASE_APP_ID:?missing in .deploy.env}"

step "Building and deploying $SERVICE to $REGION"
echo "    project: $PROJECT_ID"

# SHORT_SHA is normally supplied by a Cloud Build trigger. Submitting by hand
# leaves it empty, which would tag the image ':' — so pass it explicitly.
SHORT_SHA="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d-%H%M%S)"
echo "    tag:     $SHORT_SHA"

gcloud builds submit --config cloudbuild.yaml --project "$PROJECT_ID" \
  --substitutions="SHORT_SHA=${SHORT_SHA},_REGION=${REGION},_SERVICE=${SERVICE},_FIREBASE_API_KEY=${FIREBASE_API_KEY},_FIREBASE_AUTH_DOMAIN=${FIREBASE_AUTH_DOMAIN},_FIREBASE_APP_ID=${FIREBASE_APP_ID},_BOOTSTRAP_ADMIN_EMAIL=${BOOTSTRAP_ADMIN_EMAIL:-}"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" \
  --project "$PROJECT_ID" --format='value(status.url)')"
HOST="${URL#https://}"

# --- Authorised domain ------------------------------------------------------
# Firebase rejects sign-in from a hostname it does not know, and the Cloud Run
# hostname is only knowable after the first deploy. Run it every time: it is a
# no-op once present, and forgetting it is the single most common reason a fresh
# deployment serves pages but nobody can sign in. The helper MERGES into the
# existing domain list rather than replacing it.

python3 scripts/firebase_setup.py authorize-domain "$PROJECT_ID" "$HOST" || \
  warn "could not authorise $HOST automatically — see the link above"

# --- Smoke check ------------------------------------------------------------
# Not a substitute for the eight-point verification in DEPLOY_PROMPT.md, but it
# catches the case where the revision deployed and the app still does not serve.

step "Smoke check"
CODE="$(curl -s -o /dev/null -w '%{http_code}' "$URL/login" || echo 000)"
if [[ "$CODE" == "200" ]]; then
  ok "GET /login → 200"
else
  warn "GET /login → $CODE"
  warn "Check the logs: gcloud run services logs read $SERVICE --region $REGION --limit 50"
fi

cat <<EOF

────────────────────────────────────────────────────────────────────
  $URL

Sign in with ${BOOTSTRAP_ADMIN_EMAIL:-<BOOTSTRAP_ADMIN_EMAIL not set>} to get the admin account.
Then work through the verification list in DEPLOY_PROMPT.md.
────────────────────────────────────────────────────────────────────
EOF
