# Security Policy

This extension operates **inside the authentication flow of privileged accounts**. It is classified as a T0 influence path — whoever can ship or update it could rewrite `redirect_uri` instead of `prompt`, which is a token-theft path against exactly the population that phishing-resistant authentication is meant to protect. See [docs/security-review.md](docs/security-review.md).

Reports about this repository are therefore treated as security work, not as feature requests.

## Reporting a vulnerability

**Do not open a public issue.**

Use GitHub's private vulnerability reporting: **Security → Report a vulnerability** on this repository. That channel is private between you and the maintainers and needs no prior contact.

Useful in a report:

- the affected version (the extension version, from the popup or `src/manifest.json`)
- browser and version
- what an attacker gains — the impact matters more than the mechanism
- a reproduction, or the authorize URL shape that triggers the behaviour, with tenant IDs, `state`, `nonce` and real UPNs removed

We aim to acknowledge a report within five working days and to state whether we consider it in scope, along with the intended fix.

## What is in scope

The parts of this repository that can move a token or an identity:

- the DNR rule conditions and actions in `src/lib/rules.js` — above all anything that could make the extension touch a parameter other than `prompt` or `login_hint`, or move a request to another origin
- `src/manifest.json` — `permissions`, `host_permissions`, CSP
- `src/background/service-worker.js`
- the configuration surface in `src/ui/` — the stored UPN and the stored domains are the two values that reach a generated regex
- the packaging and signing path

## What is already known and accepted

These are documented properties, not vulnerabilities. A report about them is welcome as a discussion, but it will not be treated as a finding:

| Property | Where it is documented |
| --- | --- |
| In `login_hint` mode the UPN appears in the authorize URL, and therefore in browser history and proxy logs | [docs/security-review.md](docs/security-review.md) §5 |
| WS-Federation (`/wsfed?`) has no `prompt` parameter and is not covered | `CLAUDE.md` A9 |
| A per-site rule identifies the portal by the host inside `redirect_uri`, which is a heuristic with stated limits | [docs/verification-matrix.md](docs/verification-matrix.md) V5 |
| Endpoint aliases `login.windows.net` and `login.microsoft.com` are deliberately not covered | `CLAUDE.md` A7 |
| A percent-encoded dot (`%2E`) in a `redirect_uri` host could in theory bypass the host boundary of a site pattern. The consequence is the wrong *mode*, never a redirected token | [docs/security-review.md](docs/security-review.md) §6, review history, per-site rules entry |

## Supported versions

Only the latest published version receives fixes. The deployment policy pins versions on purpose ([docs/deployment.md](docs/deployment.md)), so an environment running an older version fixes it by raising the pin.
