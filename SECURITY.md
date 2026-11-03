# Security Policy

## Reporting a vulnerability

Please do **not** file public issues for security-sensitive bugs.

Use GitHub Security Advisories: **Repository → Security → Advisories → Report a vulnerability**.
If you cannot use that, open a private issue titled `[security]` with minimal
detail and wait for maintainer contact.

We aim to acknowledge reports within 7 days. If the report is confirmed, we
will ship a fix, credit you (unless you prefer otherwise), and publish an
advisory.

## Scope

- The ClipForge web app and desktop app (Electron shell).
- Build/release tooling in this repository.

Out of scope: vulnerabilities in your OS, browser, or media files you import.

## Privacy model (by design)

ClipForge processes all media locally. The only network request the app makes
is the Google Fonts stylesheet (Inter) when online; it degrades to system
fonts offline. No telemetry, no accounts, no uploads. Any code path that
breaks this model is a security bug — please report it.
