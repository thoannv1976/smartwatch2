# Deploying to Google Cloud

## Fast path — two commands

Do this in **[Cloud Shell](https://shell.cloud.google.com/)**. It is the
quickest route by a wide margin: `gcloud` is already authenticated, `node`,
`docker` and `git` are installed, and the network to Artifact Registry is
Google-internal.

```bash
git clone <your-repo-url> && cd smartwatch2
git checkout claude/inspiring-darwin-4xajv8

./scripts/gcp-setup.sh YOUR_PROJECT_ID asia-southeast1 you@university.edu
./scripts/deploy.sh
```

`gcp-setup.sh` is **idempotent** — it enables the APIs, creates Firestore, the
runtime service account with its three roles, the Artifact Registry repository
and the Firebase web app, deploys the rules and indexes, and writes
`.deploy.env`. If it fails halfway, just run it again.

**There is no `firebase login`.** The Firebase side is done over the Firebase
Management, Firebase Rules, Firestore Admin and Identity Platform REST APIs
using the gcloud credentials Cloud Shell already has
(`scripts/firebase_setup.py`). Nothing is interactive, so an agent can run it
too. To see exactly what it will send before running it for real:

```bash
python3 scripts/firebase_setup.py --dry-run setup YOUR_PROJECT_ID
```

After that, every redeploy is one command:

```bash
./scripts/deploy.sh      # ~2 minutes
```

Two things still need a human in a browser, once each. `gcp-setup.sh` and
`deploy.sh` print the exact links:

1. **Google sign-in** needs an OAuth client (Email/Password works without it).
2. **Authorized domains** — `deploy.sh` adds the Cloud Run hostname over the
   Identity Platform API automatically (merging into the existing list), and
   tells you if it could not.

### How long it takes

| | First deploy | Redeploy (lockfile unchanged) |
|---|---|---|
| `npm ci` | 37s | **skipped** — cached layer |
| typecheck + 113 tests | 7s | 7s, in parallel with the build |
| `next build` | ~55s | ~55s |
| image push + Cloud Run rollout | ~60s | ~40s |
| **total** | **~4 min** | **~2 min** |

`scripts/gcp-setup.sh` adds about 3 minutes once, most of it waiting for the
APIs to enable and Firestore to provision.

---

## Manual path, step by step

Use this if you want to understand or adapt what the script does. Everything
below assumes you are signed in (`gcloud auth login`) and have a billing-enabled
project.

```bash
export PROJECT_ID=your-project-id
export REGION=asia-southeast1          # Singapore; closest region to Vietnam
export SERVICE=smartwatch-ceo-challenge
gcloud config set project "$PROJECT_ID"
```

---

## 1. Enable the APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  identitytoolkit.googleapis.com
```

## 2. Create the Firestore database

Native mode, one region. The app uses no Datastore-mode features.

```bash
gcloud firestore databases create --location="$REGION" --type=firestore-native
```

## 3. Set up Firebase Authentication

Firestore and Firebase share the GCP project, so adding Firebase to it is enough.

1. Open <https://console.firebase.google.com/>, **Add project**, and pick the
   existing `$PROJECT_ID`.
2. **Build → Authentication → Get started**.
3. Enable the **Email/Password** and **Google** sign-in providers.
4. **Project settings → Your apps → Web app (`</>`)**. Register an app and copy
   the `apiKey`, `authDomain` and `appId` — you need them in step 6.

These three values are public by design: they identify the project, they do not
authorise anything. Access is controlled by the Firestore rules (step 4) and by
the server's own role checks.

## 4. Deploy the security rules and indexes

The rules deny the client SDK **all** Firestore access. That is deliberate: the
browser only ever talks to Firebase Auth, and every read and write of game data
goes through the server. It is what makes "the browser sends only decisions"
(spec 13.1) a property the database enforces rather than a convention.

```bash
npm install -g firebase-tools     # once
firebase login
firebase deploy --only firestore:rules,firestore:indexes --project "$PROJECT_ID"
```

The composite indexes back the leaderboard's sort columns. Firestore builds them
in the background; a sort may return an error link for a minute or two until
they finish.

## 5. Create the runtime service account

The Cloud Run revision runs as this account, and the Firebase Admin SDK picks it
up through Application Default Credentials — so **no service-account key file is
ever created, committed or mounted**.

```bash
gcloud iam service-accounts create "$SERVICE" \
  --display-name="Smartwatch CEO Challenge runtime"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

# Needed to mint and verify session cookies.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/firebaseauth.admin"

# Signing session cookies uses the IAM signBlob API.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SERVICE}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"
```

## 6. Create the Artifact Registry repository

```bash
gcloud artifacts repositories create apps \
  --repository-format=docker \
  --location="$REGION" \
  --description="Container images"
```

## 7. Build and deploy

Fill in the three Firebase web values from step 3, plus the email of the first
person who should be an administrator.

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=\
_REGION="$REGION",\
_SERVICE="$SERVICE",\
_FIREBASE_API_KEY="AIza...",\
_FIREBASE_AUTH_DOMAIN="${PROJECT_ID}.firebaseapp.com",\
_FIREBASE_APP_ID="1:1234567890:web:abcdef",\
_BOOTSTRAP_ADMIN_EMAIL="you@university.edu"
```

The build runs `tsc --noEmit` and the full test suite **before** building the
image, so a broken simulation cannot reach students.

Grab the URL:

```bash
gcloud run services describe "$SERVICE" --region "$REGION" \
  --format='value(status.url)'
```

## 8. Authorise the Cloud Run domain for sign-in

Firebase rejects sign-in from a domain it does not know.

**Firebase console → Authentication → Settings → Authorized domains → Add
domain**, and add the Cloud Run hostname (for example
`smartwatch-ceo-challenge-abc123-as.a.run.app`).

## 9. First sign-in

1. Open the URL and sign in with the address you passed as
   `_BOOTSTRAP_ADMIN_EMAIL`. That account is created as **ADMIN**.
2. Go to **/admin** and promote your colleagues to **INSTRUCTOR**.
3. Everyone else who signs in is a **STUDENT** by default.

`BOOTSTRAP_ADMIN_EMAIL` only ever applies to a brand-new account — it cannot
change the role of an existing user, so leaving it set is harmless. Clear it
once your admins exist if you prefer.

## 10. Set up a class

As an instructor:

1. **/instructor** → create a course.
2. Open the course → add students by email. **A student must sign in once
   before they can be enrolled**, because enrolment is keyed on their Firebase
   account.
3. Create an assignment: title, open/close times, max attempts (1 is the
   recommended default), scenario version and the official seed.

Every student in an assignment shares the seed, which is what makes results
comparable and reproducible.

### Which scenario version?

| Version | Player starts as | Six-company game rank |
|---|---|---|
| `smartwatch-v1` (default) | A startup, exactly as the specification's table 2.4 | Always 6th of 6 — the benchmarks cannot be caught in six quarters. Class grading is unaffected. |
| `smartwatch-v1-challenger` | A well-funded challenger | Responds to skill: best play reaches 3rd, a naive even split still finishes 6th. |

Both use the identical engine, formulas and coefficients — only the player's
starting row differs. Pick `smartwatch-v1` if you want results that match the
specification document exactly; pick the challenger version if you want the
quarterly six-company ranking to mean something to students.

---

## Costs

- **Cloud Run** scales to zero. A class of 60 students playing six quarters is
  comfortably inside the free tier.
- **Firestore** free tier is 50,000 reads and 20,000 writes per day. One
  complete six-quarter game costs roughly 30 reads and 15 writes, so about 600
  full games a day fit in the free tier.
- **Firebase Auth** is free at this scale.
- **Artifact Registry** charges for storage; a few images cost cents per month.

## Local development

```bash
cp .env.example .env.local     # fill in the NEXT_PUBLIC_FIREBASE_* values
npm install
npm run dev
```

To develop without touching a real project, run the emulators and point the app
at them:

```bash
firebase emulators:start --only auth,firestore --project demo-smartwatch
```

then in `.env.local`:

```
GOOGLE_CLOUD_PROJECT=demo-smartwatch
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-smartwatch
NEXT_PUBLIC_FIREBASE_API_KEY=demo-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=demo-smartwatch.firebaseapp.com
NEXT_PUBLIC_FIREBASE_APP_ID=1:1:web:1
BOOTSTRAP_ADMIN_EMAIL=admin@example.edu
```

The tests need none of this: they run on the in-memory repositories.

## Troubleshooting

**"Firestore has already been initialized"** — the Admin SDK is being
initialised twice. The app caches it on `globalThis` precisely to avoid this; if
you see it again, look for a second `initializeApp` call.

**Sign-in popup closes with `auth/unauthorized-domain`** — step 8.

**A leaderboard sort returns an error with a long console link** — a composite
index is still building, or step 4 was skipped. The link creates the missing
index.

**A page fails with `FAILED_PRECONDITION` / "The query requires an index"** —
a query is missing an index. Note that the Firestore emulator does not enforce
indexes, so this class of bug never appears in local testing. The index each
query depends on is tabulated at the top of
`src/db/repositories/firestore.ts`; the error's console link also creates the
missing index directly.

**A student sees "You are not enrolled in the course for this assignment"** —
they are not on the course roster. Add them by email (step 10.2).

**`PERMISSION_DENIED` in the Cloud Run logs** — the runtime service account is
missing `roles/datastore.user` (step 5).
