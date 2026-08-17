---
name: security-review
description: Blocking security review for the MS Account Picker extension. Mandatory on every change to src/manifest.json, to permissions or host_permissions, to DNR rule conditions, to the service worker, or to the build/signing chain. Use before committing such a change, when asked for a security review, or when the verify procedure routes here.
---

# Security Review (blocking)

This extension runs inside the authentication flow of privileged accounts. A change that swaps `prompt` for `redirect_uri` is a token-theft path that looks exactly like a feature commit. **T0 influence path** — see `docs/security-review.md`.

This review is **blocking**. Not "recommended", not "when time allows". If it fails, the change does not get committed. You do not resolve findings on your own — you present them and the user decides.

## When this runs

Any of these touched → this skill runs. No exceptions for "small" changes:

- `src/manifest.json` — any key
- `permissions`, `host_permissions`, `declarative_net_request`, `content_security_policy`
- any `condition` or `action` field of a DNR rule (`src/lib/rules.js`)
- `src/background/service-worker.js`
- anything under `build/` or the signing/packaging path
- adding **any** dependency

## 1. Manifest diff — read it line by line

```bash
git diff src/manifest.json
```

- [ ] `host_permissions` unchanged — `https://login.microsoftonline.com/*` and nothing else. ESTS aliases are out of scope (A7). If a host was added: **stop and ask the user.** Constraint A4. Any addition is a re-run of the risk assessment, and for a portal domain it is the project's stop criterion (`docs/security-review.md` §4)
- [ ] `permissions` contains **only** `declarativeNetRequest` and `storage`. Not `webRequest`, not `tabs`, not `cookies`, not `<all_urls>`, not `activeTab`
- [ ] No `content_scripts` — none, for any match pattern
- [ ] No `web_accessible_resources`
- [ ] No `externally_connectable`
- [ ] `content_security_policy` not weakened (no `unsafe-eval`, no remote origins)
- [ ] `version` bumped, and the bump is intentional (the deployment policy pins versions)
- [ ] No `key` field committed — the CRX signing key never enters the repo

## 2. Rule action — the token-theft check 🔴

The single most dangerous class of change in this repository.

- [ ] `action.type` is `"redirect"` and the redirect is a `transform.queryTransform` — **never** a `redirect.url` or `regexSubstitution` pointing at a different host
- [ ] `addOrReplaceParams` touches **only** `prompt` or `login_hint`. Any other parameter name is a finding: `redirect_uri`, `client_id`, `scope`, `response_mode`, `state`, `nonce`, `code_challenge`, `resource` — all CRITICAL
- [ ] The parameter **value** comes from the stored UPN or is a fixed literal (`select_account`). Never from a URL, a message, a fetched response, or anything remote
- [ ] The rule's target host equals the request host — the transform must never move the request to another origin
- [ ] `condition.regexFilter` is anchored to the ESTS authorize endpoints and cannot match arbitrary hosts (a missing `^https://` anchor or an over-broad `.*` is a finding)

## 3. Service worker — scope creep

- [ ] Contains rule sync and nothing else (constraint A10)
- [ ] No `fetch`, no `XMLHttpRequest`, no WebSocket, no `import()` of a remote URL
- [ ] No `eval`, no `new Function`, no `chrome.scripting`
- [ ] No listener beyond `chrome.storage.onChanged` / `chrome.runtime.onInstalled`
- [ ] No logging of the UPN, of URLs, or of anything else to a remote sink — no telemetry, at all
- [ ] Reads configuration from `chrome.storage.local` only — never from a message from a web page

## 4. Data handling

- [ ] The stored UPN never leaves `chrome.storage.local` except into the DNR rule
- [ ] No real UPNs, tenant IDs, or customer client IDs in code, tests, docs, or commit messages — placeholders only
- [ ] The UPN's visibility in browser history / proxy logs / `Referer` is documented in `docs/security-review.md` §Datenschutz and unchanged by this diff. If the change widens that exposure, say so explicitly

## 5. Supply chain

- [ ] Zero runtime dependencies — still zero. Adding one requires an explicit user decision, and an extension in the auth path of T0 accounts should have none
- [ ] Build remains reproducible; the artifact hash procedure in `docs/deployment.md` still applies (and the documented hash is updated if the artifact changed)
- [ ] Version in the `ExtensionSettings` policy stays pinned — never suggest auto-update

## Output format

```
## Security Review — [scope of the diff]

### CRITICAL (blocks the commit)
- **[Finding]**: description
  - File: `path/to/file.js:line`
  - Risk: what an attacker or a mistake achieves
  - Fix: concrete mitigation

### HIGH (fix before rollout)
### MEDIUM (track in docs/open-questions.md)
### LOW / Informational

### Passed checks
- [ ] list of checks that passed — this is the audit trail
```

Severity rule: anything that touches the authorize request's routing or its non-`prompt`/`login_hint` parameters is **CRITICAL** by definition. There is no "low-severity redirect change" in this repository.

## After the review

Present the findings. **The user decides each one.** Then, if the diff touched rule logic or permissions, the verification matrix (`.claude/skills/verify/`, step 4) still has to run — a clean security review is not a substitute for it.
