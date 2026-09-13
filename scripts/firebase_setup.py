#!/usr/bin/env python3
"""
Firebase-side setup over REST, using the gcloud access token.

Why this exists: the `firebase` CLI needs its OWN interactive OAuth login
(`firebase login`), which cannot be completed by an automated agent and is
awkward even for a human in Cloud Shell. Everything the CLI does here is
available over the Firebase Management, Firebase Rules, Firestore Admin and
Identity Platform APIs, which accept the gcloud credentials Cloud Shell already
has. So: no `firebase login`, no prompts, nothing to paste.

Subcommands
    setup             add Firebase to the project, ensure a web app exists and
                      print its config, enable Email/Password, publish
                      firestore.rules, create the composite indexes
    authorize-domain  add a hostname to Firebase Auth's authorized domains,
                      merging into the existing list

Every operation is idempotent: an "already exists" is success, not a failure.
Pass --dry-run to see the exact requests without sending any.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

FIREBASE_API = "https://firebase.googleapis.com/v1beta1"
RULES_API = "https://firebaserules.googleapis.com/v1"
FIRESTORE_API = "https://firestore.googleapis.com/v1"
IDENTITY_API = "https://identitytoolkit.googleapis.com"

BOLD, GREEN, YELLOW, RED, RESET = "\033[1m", "\033[32m", "\033[33m", "\033[31m", "\033[0m"


def step(msg: str) -> None:
    print(f"\n{BOLD}==> {msg}{RESET}", flush=True)


def ok(msg: str) -> None:
    print(f"    {GREEN}{msg}{RESET}", flush=True)


def warn(msg: str) -> None:
    print(f"    {YELLOW}{msg}{RESET}", flush=True)


def fail(msg: str) -> None:
    print(f"    {RED}{msg}{RESET}", flush=True)


class ApiError(Exception):
    def __init__(self, status: int, body: str):
        super().__init__(f"HTTP {status}: {body[:400]}")
        self.status = status
        self.body = body

    @property
    def already_exists(self) -> bool:
        return self.status == 409 or "ALREADY_EXISTS" in self.body


def access_token(dry_run: bool = False) -> str:
    # In dry-run nothing is sent, so gcloud need not even be installed: the
    # point of --dry-run is to let someone inspect the plan first.
    if dry_run:
        return "DRY_RUN_TOKEN"
    try:
        return subprocess.run(
            ["gcloud", "auth", "print-access-token"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    except FileNotFoundError:
        sys.exit("gcloud is not installed.")
    except subprocess.CalledProcessError as exc:
        sys.exit(f"Could not get a gcloud access token. Run `gcloud auth login`.\n{exc.stderr}")


class Client:
    def __init__(self, token: str, dry_run: bool = False):
        self.token = token
        self.dry_run = dry_run

    def request(self, method: str, url: str, body: dict | None = None) -> dict:
        if self.dry_run:
            print(f"    [dry-run] {method} {url}")
            if body is not None:
                preview = json.dumps(body)
                print(f"    [dry-run]   body: {preview[:300]}{'…' if len(preview) > 300 else ''}")
            return {}

        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.token}")
        if data is not None:
            req.add_header("Content-Type", "application/json")

        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                raw = response.read().decode()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            raise ApiError(exc.code, exc.read().decode(errors="replace")) from exc
        except urllib.error.URLError as exc:
            raise ApiError(0, str(exc.reason)) from exc

    def await_operation(self, operation: dict, api: str, timeout: int = 300) -> dict:
        """Polls a long-running operation until it is done."""
        name = operation.get("name", "")
        if not name or operation.get("done"):
            return operation.get("response", operation)

        deadline = time.time() + timeout
        while time.time() < deadline:
            time.sleep(3)
            current = self.request("GET", f"{api}/{name}")
            if current.get("done"):
                if "error" in current:
                    raise ApiError(0, json.dumps(current["error"]))
                return current.get("response", {})
        raise ApiError(0, f"operation {name} did not finish within {timeout}s")


# --------------------------------------------------------------------------
# setup
# --------------------------------------------------------------------------


def ensure_firebase(client: Client, project: str) -> None:
    step("Adding Firebase to the project")
    try:
        operation = client.request("POST", f"{FIREBASE_API}/projects/{project}:addFirebase")
        client.await_operation(operation, FIREBASE_API)
        ok("added")
    except ApiError as exc:
        if exc.already_exists:
            ok("already a Firebase project")
        else:
            raise


def ensure_web_app(client: Client, project: str, display_name: str) -> dict:
    step("Ensuring a Firebase web app exists")

    existing = client.request("GET", f"{FIREBASE_API}/projects/{project}/webApps")
    apps = existing.get("apps", [])
    if apps:
        app_id = apps[0]["appId"]
        ok(f"reusing {app_id}")
    elif client.dry_run:
        client.request(
            "POST", f"{FIREBASE_API}/projects/{project}/webApps", {"displayName": display_name}
        )
        return {"appId": "1:000000000000:web:dryrun", "apiKey": "DRY_RUN", "authDomain": f"{project}.firebaseapp.com"}
    else:
        operation = client.request(
            "POST", f"{FIREBASE_API}/projects/{project}/webApps", {"displayName": display_name}
        )
        created = client.await_operation(operation, FIREBASE_API)
        app_id = created.get("appId", "")
        if not app_id:
            raise ApiError(0, f"web app created but no appId returned: {created}")
        ok(f"created {app_id}")

    config = client.request("GET", f"{FIREBASE_API}/projects/{project}/webApps/{app_id}/config")
    if not client.dry_run and not config.get("apiKey"):
        raise ApiError(0, "web app config has no apiKey")
    config.setdefault("appId", app_id)
    config.setdefault("authDomain", f"{project}.firebaseapp.com")
    return config


def enable_email_password(client: Client, project: str) -> None:
    step("Enabling the Email/Password sign-in provider")

    # Identity Platform has to be initialised once before its config exists.
    try:
        client.request("POST", f"{IDENTITY_API}/v2/projects/{project}/identityPlatform:initializeAuth", {})
        ok("Identity Platform initialised")
    except ApiError as exc:
        if exc.already_exists:
            ok("Identity Platform already initialised")
        else:
            warn(f"could not initialise Identity Platform: {exc}")

    url = (
        f"{IDENTITY_API}/admin/v2/projects/{project}/config"
        "?updateMask=signIn.email.enabled,signIn.email.passwordRequired"
    )
    try:
        client.request("PATCH", url, {"signIn": {"email": {"enabled": True, "passwordRequired": True}}})
        ok("enabled")
    except ApiError as exc:
        warn(f"could not enable it over the API ({exc.status}).")
        warn(
            "Enable it here: "
            f"https://console.firebase.google.com/project/{project}/authentication/providers"
        )


def publish_rules(client: Client, project: str, rules_path: str) -> None:
    step("Publishing the Firestore security rules")

    with open(rules_path, encoding="utf-8") as handle:
        source = handle.read()

    ruleset = client.request(
        "POST",
        f"{RULES_API}/projects/{project}/rulesets",
        {"source": {"files": [{"name": "firestore.rules", "content": source}]}},
    )
    ruleset_name = ruleset.get("name", "projects/PROJECT/rulesets/DRY_RUN")
    ok(f"ruleset {ruleset_name.rsplit('/', 1)[-1]}")

    release_name = f"projects/{project}/releases/cloud.firestore"
    body = {"name": release_name, "rulesetName": ruleset_name}
    try:
        client.request("POST", f"{RULES_API}/projects/{project}/releases", body)
        ok("released")
    except ApiError as exc:
        if exc.already_exists:
            # A release for cloud.firestore already exists: point it at the new ruleset.
            client.request("PATCH", f"{RULES_API}/{release_name}", {"release": body})
            ok("release updated")
        else:
            raise


def create_indexes(client: Client, project: str, indexes_path: str) -> None:
    step("Creating the composite indexes")

    with open(indexes_path, encoding="utf-8") as handle:
        spec = json.load(handle)

    created = skipped = 0
    for index in spec.get("indexes", []):
        collection_group = index["collectionGroup"]
        # Pass every recognised field key through, so an index that uses
        # arrayConfig instead of order still works.
        fields = []
        for field in index["fields"]:
            entry = {"fieldPath": field["fieldPath"]}
            for key in ("order", "arrayConfig", "vectorConfig"):
                if key in field:
                    entry[key] = field[key]
            fields.append(entry)

        body = {"queryScope": index.get("queryScope", "COLLECTION"), "fields": fields}
        url = (
            f"{FIRESTORE_API}/projects/{project}/databases/(default)"
            f"/collectionGroups/{collection_group}/indexes"
        )
        try:
            client.request("POST", url, body)
            created += 1
        except ApiError as exc:
            if exc.already_exists:
                skipped += 1
            else:
                warn(f"{collection_group}: {exc}")

    ok(f"{created} created, {skipped} already existed (they build in the background)")


def command_setup(args: argparse.Namespace) -> int:
    client = Client(access_token(args.dry_run), args.dry_run)
    project = args.project

    ensure_firebase(client, project)
    config = ensure_web_app(client, project, args.display_name)
    enable_email_password(client, project)
    publish_rules(client, project, args.rules)
    create_indexes(client, project, args.indexes)

    # Printed as shell assignments so the caller can eval them.
    print("\n# --- firebase web config ---")
    print(f"FIREBASE_API_KEY={config.get('apiKey', '')}")
    print(f"FIREBASE_AUTH_DOMAIN={config.get('authDomain', '')}")
    print(f"FIREBASE_APP_ID={config.get('appId', '')}")
    return 0


# --------------------------------------------------------------------------
# authorize-domain
# --------------------------------------------------------------------------


def command_authorize_domain(args: argparse.Namespace) -> int:
    client = Client(access_token(args.dry_run), args.dry_run)
    project, host = args.project, args.host

    step(f"Authorising {host} for Firebase sign-in")
    config_url = f"{IDENTITY_API}/admin/v2/projects/{project}/config"

    try:
        current = client.request("GET", config_url)
    except ApiError as exc:
        warn(f"could not read the Identity Platform config ({exc.status}).")
        warn(
            f"Add {host} by hand at "
            f"https://console.firebase.google.com/project/{project}/authentication/settings"
        )
        return 0

    domains = list(current.get("authorizedDomains", []))
    if host in domains:
        ok("already authorised")
        return 0

    # Merge, never replace: dropping localhost or the firebaseapp.com domain
    # would break local development and the default Firebase hosting domain.
    domains.append(host)
    try:
        client.request(
            "PATCH", f"{config_url}?updateMask=authorizedDomains", {"authorizedDomains": domains}
        )
        ok(f"authorised ({len(domains)} domains total)")
    except ApiError as exc:
        warn(f"could not add it over the API ({exc.status}).")
        warn(
            f"Add {host} by hand at "
            f"https://console.firebase.google.com/project/{project}/authentication/settings"
        )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="print the requests without sending them")
    subparsers = parser.add_subparsers(dest="command", required=True)

    setup = subparsers.add_parser("setup", help="full Firebase-side setup")
    setup.add_argument("project")
    setup.add_argument("--display-name", default="Smartwatch CEO Challenge")
    setup.add_argument("--rules", default="firestore.rules")
    setup.add_argument("--indexes", default="firestore.indexes.json")
    setup.set_defaults(func=command_setup)

    authorize = subparsers.add_parser("authorize-domain", help="add a hostname to the authorized domains")
    authorize.add_argument("project")
    authorize.add_argument("host")
    authorize.set_defaults(func=command_authorize_domain)

    args = parser.parse_args()
    try:
        return args.func(args)
    except ApiError as exc:
        fail(str(exc))
        return 1
    except FileNotFoundError as exc:
        fail(f"missing file: {exc.filename} (run this from the repository root)")
        return 1


if __name__ == "__main__":
    os.environ.setdefault("PYTHONUNBUFFERED", "1")
    sys.exit(main())
