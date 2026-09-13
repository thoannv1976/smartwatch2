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
# hostname is only knowable after the first deploy. Add it every time: it is a
# no-op once present, and forgetting it is the single most common reason a fresh
# deployment "works" but nobody can log in.

step "Authorising $HOST for Firebase sign-in"
TOKEN="$(gcloud auth print-access-token)"
CONFIG_URL="https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config"
CURRENT="$(curl -sS -f -H "Authorization: Bearer ${TOKEN}" "$CONFIG_URL" 2>/dev/null || true)"

if [[ -z "$CURRENT" ]]; then
  warn "could not read the Identity Platform config."
  warn "Add $HOST by hand at:"
  warn "  https://console.firebase.google.com/project/$PROJECT_ID/authentication/settings"
elif printf '%s' "$CURRENT" | grep -q "\"$HOST\""; then
  ok "already authorised"
else
  EXISTING="$(printf '%s' "$CURRENT" \
    | tr -d '\n ' \
    | grep -oE '"authorizedDomains":\[[^]]*\]' \
    | sed 's/"authorizedDomains":\[//; s/\]$//' || true)"
  DOMAINS="${EXISTING:+${EXISTING},}\"${HOST}\""

  if curl -sS -f -X PATCH "${CONFIG_URL}?updateMask=authorizedDomains" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "{\"authorizedDomains\":[${DOMAINS}]}" >/dev/null 2>&1; then
    ok "authorised"
  else
    warn "could not add it over the API. Add $HOST by hand at:"
    warn "  https://console.firebase.google.com/project/$PROJECT_ID/authentication/settings"
  fi
fi

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
