#!/usr/bin/env python3
"""Fail if a likely-real credential is committed to the repository.

Scans the files tracked by git (`git ls-files`) and nothing else. Run it locally
with `python3 scripts/ci/secret_scan.py`; CI runs it in the "no-secrets" job of
.github/workflows/ci.yml.

The rules are deliberately conservative: a hit must look like a real value, not
a documented placeholder. Every exception below is intentional and explained —
see docs/secrets.md for where each of these values is supposed to live (GitHub
Actions secrets, Supabase Vault, EAS environment variables, or the operator's
machine) and never in git.

Exit code: 0 clean, 1 findings, 2 could not run.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Binary and generated files that cannot hold a readable secret (or are too
# noisy to scan); package-lock.json is full of integrity hashes.
SKIP_SUFFIXES = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".avif", ".zip", ".gz",
    ".tgz", ".tar", ".ttf", ".otf", ".woff", ".woff2", ".mp3", ".mp4", ".mov",
    ".pdf", ".p8", ".p12", ".cer", ".mobileprovision", ".keystore", ".jks",
    ".db", ".sqlite", ".sqlite3", ".DS_Store",
}
SKIP_NAMES = {"package-lock.json", "pnpm-lock.yaml", "yarn.lock"}

# Values that are obviously not secrets.
PLACEHOLDER = re.compile(
    r"""^(?:
          <[^>]*>                              # <your-key-here>
        | \$\{?[A-Za-z_][A-Za-z0-9_]*\}?       # $ENV_VAR / ${ENV_VAR}
        | \$\{\{.*\}\}                         # ${{ secrets.FOO }}
        | [*xX-]+                              # ***, xxx, ---
        | .*(?:@|:)//.*                        # a URL: point at docs, not a value
        | hostname | host | your-project.*     # placeholders in URI templates
        | user | username | pass | password    # ditto: the words themselves
        | secret | token | key | api[_-]?key
        | (?:change|replace)[-_ ]?me.*
        | (?:placeholder|example|sample|fake|dummy|redacted).*
        | .*example.*
        | todo.* | none | null | true | false
        | postgres | dev-secret-change-me | insecure-do-not-use-in-production
        | "" | ''
      )$""",
    re.VERBOSE | re.IGNORECASE,
)

RULES: list[tuple[str, re.Pattern[str]]] = [
    ("JWT-shaped key (Supabase anon / service_role)", re.compile(
        r"\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
    ("PEM private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("AWS access key id", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("GitHub token", re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b")),
    ("Google service-account JSON", re.compile(r'"type"\s*:\s*"service_account"')),
    ("Apple App Store Connect API key", re.compile(r"AuthKey_[A-Z0-9]{10}\.p8")),
    ("Postgres DSN with an inline password", re.compile(
        r"postgres(?:ql)?://[^/\s:@]+:(?P<password>[^@\s]+)@(?P<host>[^/\s:?]+)")),
    ("assigned secret-looking variable", re.compile(
        r"""(?im)^[ \t]*(?:export[ \t]+)?
             (?P<name>
                SUPABASE_ACCESS_TOKEN | SUPABASE_DB_PASSWORD | SUPABASE_SERVICE_ROLE_KEY
              | SUPABASE_DB_URL | INGEST_CRON_SECRET | EXPO_TOKEN
              | GOOGLE_MAPS_API_KEY | GOOGLE_MAPS_ANDROID_API_KEY
              | ASC_KEY_ID | ASC_ISSUER_ID | ASC_PRIVATE_KEY | TDX_CLIENT_SECRET
              | AWS_SECRET_ACCESS_KEY | PLAY_SERVICE_ACCOUNT_JSON
             )
             [ \t]*[=:][ \t]*(?P<value>.+?)[ \t]*$
          """, re.VERBOSE)),
]

# The local development stack (docker-compose.yml, README, docs) uses a
# throwaway password on a loopback host. Only those DSNs are allowed.
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal", "db"}


def dsn_is_allowed(match: re.Match[str]) -> bool:
    """A DSN is only flagged when it carries a real password for a real host."""
    if PLACEHOLDER.match(match.group("password")):
        return True
    return match.group("host") in LOCAL_HOSTS


def mask(value: str) -> str:
    value = value.strip()
    return value[:6] + "…" if len(value) > 8 else value


def tracked_files() -> list[str]:
    proc = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=False
    )
    if proc.returncode != 0:
        print("secret_scan: not a git repository (git ls-files failed)", file=sys.stderr)
        raise SystemExit(2)
    return [n for n in proc.stdout.decode("utf-8", "replace").split("\0") if n]


def scan_file(rel: str) -> list[str]:
    path = ROOT / rel
    if path.suffix.lower() in SKIP_SUFFIXES or path.name in SKIP_NAMES or not path.is_file():
        return []
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return []  # binary or unreadable: nothing to review
    if "\x00" in text:
        return []

    findings: list[str] = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        if len(line) > 4000:  # minified blobs
            continue
        for label, pattern in RULES:
            for m in pattern.finditer(line):
                if label.startswith("Postgres DSN") and dsn_is_allowed(m):
                    continue
                if m.groupdict().get("value") is not None:
                    # Shell/YAML values are often quoted, possibly followed by a
                    # line continuation; judge the value itself
                    # (INGEST_CRON_SECRET="$CRON_SECRET" \ is a reference, not a secret).
                    value = m.group("value").strip().rstrip("\\").strip()
                    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                        value = value[1:-1].strip()
                    if PLACEHOLDER.match(value):
                        continue
                    shown = mask(value)
                else:
                    shown = mask(m.group(0))
                findings.append(f"{rel}:{lineno}: {label}: {shown}")
    return findings


def main() -> int:
    findings: list[str] = []
    files = tracked_files()
    for rel in files:
        findings.extend(scan_file(rel))

    if findings:
        print("secret_scan: likely committed secret(s) found\n", file=sys.stderr)
        for line in findings:
            print(f"  {line}", file=sys.stderr)
        print(
            "\nMove the value into GitHub Actions secrets / Supabase Vault / EAS environment\n"
            "variables (docs/secrets.md) and commit only an .env.example placeholder.",
            file=sys.stderr,
        )
        return 1

    print(f"secret_scan: clean ({len(files)} tracked files scanned)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
