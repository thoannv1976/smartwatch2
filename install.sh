#!/usr/bin/env bash
#
# Smartwatch CEO Challenge — installer.
#
#   ./install.sh                                  ask for what it needs
#   ./install.sh --project ID --admin you@uni.edu install without prompting
#   ./install.sh --dry-run                        show the plan, touch nothing
#
# This is the only file you need to run. It checks the prerequisites, calls
# scripts/gcp-setup.sh and scripts/deploy.sh in order, and offers to create a
# demo class so you can see the app working before you put a real cohort on it.
#
# Everything it does is idempotent. If it fails halfway, fix the cause and run
# it again — nothing is left in a broken half-state.
#
# Full instructions, costs and troubleshooting: INSTALL.md (Vietnamese) or
# INSTALL.en.md (English).

set -euo pipefail

cd "$(dirname "$0")"

PROJECT_ID=""
REGION="asia-southeast1"
ADMIN_EMAIL=""
DRY_RUN=false
SKIP_SEED=false

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[32m%s\033[0m\n' "$1"; }
warn() { printf '    \033[33m%s\033[0m\n' "$1"; }
die()  { printf '\n\033[31mSTOPPED: %s\033[0m\n' "$1" >&2; exit 1; }

usage() {
  cat <<'USAGE'
usage: ./install.sh [options]

  --project <id>     Google Cloud project id to install into (required)
  --region <region>  default: asia-southeast1
  --admin <email>    the email that becomes the first administrator
  --no-seed          do not offer to create demo data
  --dry-run          print what would happen, change nothing
  -h, --help         this message

The project must already exist and have billing enabled. Creating a project
and attaching billing is a one-minute step in the Google Cloud console, and it
is the one thing this installer deliberately does not do for you: it involves
your organisation's money.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) PROJECT_ID="${2:-}"; shift 2 ;;
    --region)  REGION="${2:-}"; shift 2 ;;
    --admin)   ADMIN_EMAIL="${2:-}"; shift 2 ;;
    --no-seed) SKIP_SEED=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

# --- 0. Where are we -------------------------------------------------------

printf '\n'
bold "Smartwatch CEO Challenge — installer"
if [[ -f VERSION ]]; then
  sed 's/^/    /' VERSION
else
  warn "no VERSION file — this looks like a development checkout rather than a release package"
fi
$DRY_RUN && warn "DRY RUN — nothing will be created or changed."

for required in scripts/gcp-setup.sh scripts/deploy.sh scripts/firebase_setup.py; do
  [[ -f "$required" ]] || die "$required is missing. Unpack the whole ZIP, then run ./install.sh from inside it."
done

# --- 1. Prerequisites ------------------------------------------------------

step "Checking prerequisites"

missing=()
command -v gcloud  >/dev/null 2>&1 || missing+=("gcloud (Google Cloud CLI)")
command -v python3 >/dev/null 2>&1 || missing+=("python3")
command -v curl    >/dev/null 2>&1 || missing+=("curl")

if [[ ${#missing[@]} -gt 0 ]]; then
  printf '\n'
  for tool in "${missing[@]}"; do echo "    missing: $tool"; done
  cat <<'HELP'

    The simplest fix is not to install anything: open Google Cloud Shell,
    which has all three ready and is already signed in.

        https://console.cloud.google.com/  →  the >_ icon, top right

    Upload this ZIP there, unzip it, and run ./install.sh again.
HELP
  # On a dry run this is a finding, not a failure: the whole point is to let
  # somebody read the plan on whatever machine they happen to be at.
  $DRY_RUN || die "prerequisites missing"
  warn "dry run continues anyway, so you can read the rest of the plan"
else
  ok "gcloud, python3 and curl are present"
fi

if ! $DRY_RUN && ! gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | grep -q .; then
  die "gcloud is not signed in. Run: gcloud auth login"
fi
$DRY_RUN || ok "signed in as $(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -1)"

# --- 2. What are we installing into ----------------------------------------

if [[ -z "$PROJECT_ID" ]]; then
  current="$(gcloud config get-value project 2>/dev/null || true)"
  printf '\n'
  read -r -p "    Google Cloud project id${current:+ [$current]}: " PROJECT_ID
  PROJECT_ID="${PROJECT_ID:-$current}"
fi
[[ -n "$PROJECT_ID" ]] || die "a project id is required"

if [[ -z "$ADMIN_EMAIL" ]]; then
  printf '\n'
  echo "    The first person to sign in with this address becomes the administrator."
  echo "    Use an address the person can actually receive mail at."
  read -r -p "    Administrator email: " ADMIN_EMAIL
fi
[[ -n "$ADMIN_EMAIL" ]] || die "an administrator email is required"
# Not a full RFC validator — just enough to catch a typo before twenty minutes
# of cloud work, since getting this wrong means nobody can administer the app.
[[ "$ADMIN_EMAIL" == *@*.* ]] || die "that does not look like an email address: $ADMIN_EMAIL"

step "Plan"
cat <<PLAN
    Project        $PROJECT_ID
    Region         $REGION
    Administrator  $ADMIN_EMAIL
    Service        smartwatch-ceo-challenge

    Will run:
      1. scripts/gcp-setup.sh  — APIs, Firestore, Firebase, service account,
                                 Artifact Registry, security rules
      2. scripts/deploy.sh     — build the container and deploy to Cloud Run
PLAN

if $DRY_RUN; then
  printf '\n'
  ok "Dry run finished. Nothing was changed."
  echo "    Run without --dry-run to install for real."
  exit 0
fi

if ! gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  die "project '$PROJECT_ID' does not exist, or this account cannot see it.
       Create it at https://console.cloud.google.com/projectcreate and attach billing."
fi
ok "project $PROJECT_ID exists"

printf '\n'
read -r -p "    Proceed? This takes about 15 minutes. [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || die "cancelled"

# --- 3. Set up, then deploy ------------------------------------------------

step "Step 1 of 2 — Google Cloud and Firebase setup"
./scripts/gcp-setup.sh "$PROJECT_ID" "$REGION" "$ADMIN_EMAIL"

step "Step 2 of 2 — build and deploy"
./scripts/deploy.sh

URL="$(gcloud run services describe smartwatch-ceo-challenge \
  --region "$REGION" --project "$PROJECT_ID" \
  --format='value(status.url)' 2>/dev/null || true)"

# --- 4. Optional demo data -------------------------------------------------

if ! $SKIP_SEED; then
  step "Demo data (optional)"
  cat <<'SEED'
    A demo class with sample students lets you see the app working end to end
    before a real cohort touches it. It is ordinary data and you can delete it.

    It needs the accounts to exist first: the people have to sign in once
    before they can be added to a class. So this is usually done later, not now.
SEED
  echo
  echo "    To create it later:"
  echo "        npm ci"
  echo "        npm run seed:demo -- <instructor-email> <student-email> [more...]"
fi

# --- 5. What now -----------------------------------------------------------

step "Installed"
printf '\n'
bold "    ${URL:-<could not read the service URL — check the Cloud Run console>}"
printf '\n'
cat <<NEXT
    Next, in this order:

    1. Open the address above and sign in with $ADMIN_EMAIL.
       Use "Create account" the first time. That first sign-in makes you the
       administrator; nobody else can claim it afterwards.

    2. If sign-in fails with "auth/unauthorized-domain", the hostname was not
       added to Firebase automatically. Add it by hand — it takes ten seconds:
         https://console.firebase.google.com/project/$PROJECT_ID/authentication/settings
       See the troubleshooting section of INSTALL.md.

    3. Create a class, add your instructors, and read the guide at ${URL:-<url>}/guide
       That page is written for students and is public — send the link to them.

    Full documentation: INSTALL.md (Vietnamese), INSTALL.en.md (English),
    HUONG_DAN.md (the complete user manual, Vietnamese).
NEXT
printf '\n'
