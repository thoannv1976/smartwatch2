#!/usr/bin/env bash
#
# Remove a Smartwatch CEO Challenge installation.
#
#   ./scripts/uninstall.sh              ask before each step
#   ./scripts/uninstall.sh --dry-run    list what would be removed
#   ./scripts/uninstall.sh --with-data  also offer to delete student data
#
# Written for two situations: a trial that is finished, and a handover where
# the software is being taken out of service. It removes what this product
# created and nothing else.
#
# WHAT IT DELETES:
#   - the Cloud Run service
#   - the container images in Artifact Registry
#   - the runtime service account and its project IAM bindings
#   - with --with-data, and only after you type the project id: the Firestore
#     collections this app writes
#
# WHAT IT DELIBERATELY DOES NOT DELETE:
#   - the Google Cloud project itself. Deleting a project is irreversible after
#     30 days and may take other things with it. Do that by hand if you mean it.
#   - Firebase Authentication accounts. They are people's logins and may be
#     shared with other apps in the same project.
#   - the Firestore database, only the documents. An empty database costs
#     nothing and deleting it is a separate, riskier operation.
#   - anything in Cloud Build history or Cloud Logging.

set -euo pipefail

cd "$(dirname "$0")/.."

DRY_RUN=false
WITH_DATA=false

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[32m%s\033[0m\n' "$1"; }
warn() { printf '    \033[33m%s\033[0m\n' "$1"; }
die()  { printf '\n\033[31mSTOPPED: %s\033[0m\n' "$1" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY_RUN=true; shift ;;
    --with-data) WITH_DATA=true; shift ;;
    -h|--help)
      sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

[[ -f .deploy.env ]] || die "No .deploy.env found. This script removes the installation it describes.
       If you have lost that file, remove the pieces by hand from the Cloud console."

# shellcheck disable=SC1091
set -a; source .deploy.env; set +a
: "${PROJECT_ID:?missing in .deploy.env}"
: "${REGION:?missing in .deploy.env}"
: "${SERVICE:?missing in .deploy.env}"

REPOSITORY="${REPOSITORY:-apps}"
SA_EMAIL="${SERVICE}@${PROJECT_ID}.iam.gserviceaccount.com"

step "About to remove"
cat <<PLAN
    Project              $PROJECT_ID
    Region               $REGION
    Cloud Run service    $SERVICE
    Container images     ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE}
    Service account      $SA_EMAIL
    Student data         $($WITH_DATA && echo "YES — will be offered" || echo "no (pass --with-data to include)")
PLAN

if $DRY_RUN; then
  printf '\n'
  ok "Dry run. Nothing was removed."
  exit 0
fi

printf '\n'
read -r -p "    Remove the installation? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || die "cancelled"

# Every step is best-effort: a piece that is already gone must not stop the
# rest, or a half-finished uninstall becomes impossible to finish.
run() { "$@" || warn "could not run: $* (already removed?)"; }

step "Cloud Run service"
run gcloud run services delete "$SERVICE" \
  --region "$REGION" --project "$PROJECT_ID" --quiet

step "Container images"
run gcloud artifacts docker images delete \
  "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE}" \
  --project "$PROJECT_ID" --delete-tags --quiet
run gcloud artifacts docker images delete \
  "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE}-deps" \
  --project "$PROJECT_ID" --delete-tags --quiet

step "Service account and its IAM bindings"
for role in roles/datastore.user roles/firebaseauth.admin roles/iam.serviceAccountTokenCreator; do
  run gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA_EMAIL}" --role="$role" --quiet
done
run gcloud iam service-accounts delete "$SA_EMAIL" --project "$PROJECT_ID" --quiet

step "Continuous deployment trigger, if one was created"
run gcloud builds triggers delete smartwatch-deploy --project "$PROJECT_ID" --quiet

# --- student data ----------------------------------------------------------

if $WITH_DATA; then
  step "Student data"
  cat <<'DATA'
    This deletes every course, class roster, game session, group match and
    final result the application has stored.

    IT CANNOT BE UNDONE, and it includes graded results. If this installation
    was ever used for real assessment, export the CSVs first — an instructor
    can do that from the assignment page.
DATA
  printf '\n'
  read -r -p "    Type the project id to confirm ($PROJECT_ID): " typed
  if [[ "$typed" != "$PROJECT_ID" ]]; then
    warn "did not match — student data was left alone"
  else
    for collection in users courses assignments gameSessions finalResults \
                      attemptClaims roleInvites groups groupJoinCodes \
                      groupSeatClaims groupGames; do
      run gcloud firestore bulk-delete \
        --collection-ids="$collection" --project "$PROJECT_ID" --quiet
    done
    warn "subcollections (members, quarters, submissions, studentCodes) are removed with their parents"
  fi
fi

step "Removed"
cat <<DONE
    Still present, on purpose:

      - the Google Cloud project "$PROJECT_ID"
      - Firebase Authentication accounts (people's logins)
      - the Firestore database itself$($WITH_DATA || echo ", and all student data")
      - Cloud Build history and logs

    To remove the project entirely — which does take everything with it:
      https://console.cloud.google.com/iam-admin/settings?project=$PROJECT_ID

    Check nothing is still billing you:
      https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID
DONE
printf '\n'
