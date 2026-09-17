# Installation guide — Smartwatch CEO Challenge

This document is for whoever installs the system (university IT, or the person deploying it).
If you are an **instructor** or a **student**, you do not need this file — once it is installed,
open `/guide` in the app and read `HUONG_DAN.md`.

*Bản tiếng Việt: `INSTALL.md`.*

---

## 1. What you are installing

A web-based business simulation used for teaching: students run a smartwatch company for six
quarters, either alone or in groups of six competing against each other. The interface is
bilingual, Vietnamese and English.

It runs on **Google Cloud Platform**, in **your own institution's project**:

| Component | What it does |
|---|---|
| Cloud Run | Runs the web application |
| Firestore | Stores classes, game sessions, results |
| Firebase Authentication | Email and password sign-in |
| Artifact Registry | Holds the container images |
| Cloud Build | Builds the application on install and on update |

> **Student data lives entirely inside your institution's own GCP project.** The software supplier
> cannot reach it and keeps no copy.

---

## 2. Prerequisites

- A **Google Cloud project** with **billing enabled**. This is the one thing the installer
  deliberately does not do for you, because it commits your organisation's money.
- **Owner** or **Editor** on that project.
- `gcloud`, `python3`, `curl`.

> **The easy route is to install nothing: use Google Cloud Shell.** Open
> https://console.cloud.google.com/ and click the `>_` icon, top right. Cloud Shell has all three
> tools and is already signed in. Upload the ZIP there, unzip, and you are ready.

---

## 3. Install

```bash
unzip smartwatch-ceo-challenge-v1.0.0.zip
cd smartwatch-ceo-challenge-v1.0.0
./install.sh
```

It asks for three things: the **project id**, the **region** (default `asia-southeast1`, in
Singapore), and the **administrator email**.

To see what it would do without touching Google Cloud:

```bash
./install.sh --dry-run --project <project-id> --admin <email>
```

Or run it without prompts:

```bash
./install.sh --project <project-id> --region asia-southeast1 --admin <email>
```

**It takes about 15 minutes**, mostly Cloud Build compiling the application for the first time.
Later updates take about two.

The installer is **safe to re-run**. If it fails halfway, fix the cause and run it again — it
leaves nothing in a broken half-state.

### The administrator email — read this part carefully

The **first** person to sign in with that address becomes the administrator, and **nobody else can
claim the role afterwards**. Use an address the responsible person can actually receive mail at.

If you get it wrong it is fixable: re-run `./scripts/gcp-setup.sh <project> <region> <correct-email>`
and then `./scripts/deploy.sh`.

---

## 4. After it finishes

1. Open the address the installer printed.
2. Choose **Create account** and sign in with the administrator email.
3. Create a class, add your instructors, hand the class code to students.
4. Send students the `/guide` link — the introduction and how-to-play page. It is **public and
   needs no login**.

Full documentation for all three roles is in **`HUONG_DAN.md`** (Vietnamese).

---

## 5. Two browser steps, and only two

The installer automates nearly everything over APIs. Exactly two things need a person with a
browser.

### 5.1. Authorising the sign-in domain — **usually automatic, but check**

`deploy.sh` adds the Cloud Run address to Firebase's authorized domains for you. **That step can
fail with a 403** (*"could not read the Identity Platform config"*), usually because IAM
permissions have not finished propagating.

**Symptom:** sign-in fails with `auth/unauthorized-domain`.

**Fix, ten seconds:**

1. Open `https://console.firebase.google.com/project/<project-id>/authentication/settings`
2. **Authorized domains** → **Add domain**
3. Paste the hostname part of the app address — **hostname only, no `https://`**, e.g.
   `smartwatch-ceo-challenge-abc123-as.a.run.app`
4. Save and reload the sign-in page

### 5.2. Google sign-in — **optional**

If you want a "Sign in with Google" button you need an OAuth client, which is the one step that
genuinely cannot be automated. Open
`https://console.firebase.google.com/project/<project-id>/authentication/providers` and enable
Google.

**Skipping this is fine.** Email and password sign-in works immediately.

---

## 6. Running costs

An estimate for **one class of 60 students, one semester**. This is an **estimate, not a
commitment** — the real bill depends on your region, your usage, and Google's pricing at the time.

| Service | Note | Estimate / month |
|---|---|---|
| Cloud Run | Configured `min-instances=0`: **nobody using it costs nothing**. Charged per request | $0 – $5 |
| Firestore | A few thousand small documents. Usually inside the free tier | $0 – $2 |
| Firebase Auth | Email/password is free at this scale | $0 |
| Artifact Registry | A handful of container images | under $1 |
| Cloud Build | 120 free build-minutes a day; one install uses about 4 | $0 |

**In practice one class runs at under $5 a month, and $0 in months when nobody teaches.** The
largest cost is Cloud Run while a whole class is online at once, and that lasts exactly as long as
the lesson does.

Set a budget alert for peace of mind: `https://console.cloud.google.com/billing/budgets`

---

## 7. Updating to a new version

```bash
unzip smartwatch-ceo-challenge-v<new>.zip -d /tmp/new
cp .deploy.env /tmp/new/smartwatch-ceo-challenge-v<new>/
cd /tmp/new/smartwatch-ceo-challenge-v<new>
./scripts/deploy.sh
```

Carrying `.deploy.env` across is all that is needed — it holds the whole configuration of the
installation. Student data is untouched.

> **Read the release notes first.** If a new version changes the simulation coefficients or the
> `engineVersion`, marks awarded under the old version are **no longer comparable** with marks
> under the new one. Do not update mid-semester while you are still grading.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `auth/unauthorized-domain` on sign-in | Domain not authorised | Section 5.1 |
| `PERMISSION_DENIED` during `gcp-setup.sh` | Account lacks rights | You need Owner or Editor on the project |
| Billing-related error | Billing not enabled | `https://console.cloud.google.com/billing/linkedaccount?project=<project-id>` |
| Build fails at the `test` step | Source was modified and tests fail | Check the Cloud Build log; the shipped source is always green |
| `found no Cloud Build service account` | Project is brand new | Wait a minute and re-run `gcp-setup.sh` |
| Signs in but is not an admin | Administrator email does not match | Re-run `gcp-setup.sh` with the right email, then `deploy.sh` |
| App returns a 500 | Read the logs | `gcloud run services logs read smartwatch-ceo-challenge --region <region> --project <project-id> --limit 50` |

---

## 9. Uninstalling

```bash
./scripts/uninstall.sh --dry-run    # list what would be removed
./scripts/uninstall.sh              # remove the app, keep the data
./scripts/uninstall.sh --with-data  # also remove student data
```

**Export the CSVs before deleting data.** An instructor can do that from the assignment page.
It cannot be undone, and it includes marks already awarded.

The script does **not** remove the GCP project itself, Firebase sign-in accounts, or Cloud Build
history. It prints the links so you can do those by hand if you want to.

---

## 10. Options

### Competitor names

By default the five benchmark rivals carry descriptive names (*Premium benchmark*, *Sport
benchmark*, and so on). The archetypes were modelled on real brands, and you can display those
real names by adding to `.deploy.env`:

```
NEXT_PUBLIC_USE_BRAND_NAMES=true
```

then re-running `./scripts/deploy.sh`.

> **Think before enabling it.** Using another company's trademark is your institution's decision
> and your institution's responsibility — see clause 12 of `LICENSE`. Technically, the switch
> **changes no number at all**: scores are identical either way, only the displayed label differs.
>
> **Decide before your first cohort plays.** The names are written into each session when it is
> created, so switching mid-course leaves older games showing the old names and newer ones the
> new. Nothing breaks, but it looks inconsistent within one class.
>
> **Group mode always uses neutral names** (`Bot 2`…`Bot 6`) either way, so an empty seat beside a
> classmate is never mistaken for a real company.

### Deploy automatically on push

If your institution keeps the source in GitHub and wants automatic deploys:

```bash
./scripts/setup-cd.sh
```

It needs a GitHub repository. A ZIP installation has none, which is fine — deploying is one
command.

### Running it locally

See the "Local development" section of `DEPLOY.md`.

---

## 11. Licence and third-party components

- `LICENSE` — terms of use
- `THIRD_PARTY_NOTICES.md` — the full list of open-source packages and their licences

---

## 12. Getting help

When reporting a problem, include these — they make diagnosis far faster:

1. The contents of `VERSION`
2. Your region and project id
3. The full error line, or the log excerpt from the command in section 8
4. Which step you were on when it happened
