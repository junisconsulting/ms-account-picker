# CLAUDE.md

## Project

MS Account Picker — a Manifest-V3 browser extension for Microsoft Edge. On hybrid-joined Windows clients Edge injects the workforce user's Primary Refresh Token (PRT) into **every** browser profile, so an admin working in a second profile is silently signed in with the wrong account. The extension appends a single query parameter (`prompt=select_account` or `login_hint=<EADM-UPN>`) to the OAuth authorize request in flight, so the admin lands on their cloud-only admin account (EADM) instead.

**This extension operates inside the authentication flow of privileged accounts.** Whoever can ship or update it could rewrite `redirect_uri` instead of `prompt` — a perfectly camouflaged token-theft path against exactly the population that phishing-resistant authentication is meant to protect. It is classified as a **T0 influence path**. Every rule below follows from that, not from style preference.

## Core Concept: Augment, Never Construct

The portal's own MSAL.js builds the authorize request including `state`, `nonce`, `code_challenge` (PKCE) and `response_mode`. The extension adds **one query parameter** to that request and nothing else. This is why it works for every Microsoft portal without maintaining client IDs or redirect URIs.

Pre-built authorize URLs fail by construction — PKCE and single-use `state` make them impossible. This was tested. **Do not propose it again.**

```
Options page  →  chrome.storage.local  →  Service Worker  →  DNR Dynamic Rule
   (UPN)             (configuration)        (rule sync)       (request transform)
```

## Non-Goals

Do not build, suggest, or "prepare for" any of these:

- **No tile portal / launcher page** — the extension has no UI beyond the configuration surface
- **No self-built authorize URLs** — see above, PKCE makes it impossible
- **No Okta interaction** — the extension never touches the IdP chain beyond the ESTS authorize request
- **No telemetry, no analytics, no error reporting** — nothing leaves the browser
- **No framework, no build step for the extension itself, no bundler** — plain JS, loaded as written
- **No remote code, no `fetch`, no `eval`, no CDN** — MV3 forbids it and the T0 classification doubly so
- **No content scripts** — the transform happens in DNR, not in the page

## Architecture Constraints (hard)

These are not preferences. A change that violates one is wrong, not debatable.

| # | Constraint | Why |
| --- | --- | --- |
| A1 | 🔴 `condition.resourceTypes` is **exactly** `["main_frame"]` | Silent token renewal runs as `prompt=none` in a hidden iframe. A rule matching there breaks token renewal in **all** M365 portals |
| A2 | 🔴 `regexFilter` is **RE2** — no lookaheads, no backreferences | Chromium's DNR engine. Loop protection must be solved without them |
| A3 | 🔴 Not **explicitly activated in this profile** → no rule registered at all | Enables browser-wide force-install; the workforce profile stays untouched. The gate is a per-profile `chrome.storage.local` flag, **never** a policy value — policy reaches every profile of the OS user, so a policy-only activation would arm the workforce profile too |
| A4 | 🔴 `host_permissions` minimal — ideally only `https://login.microsoftonline.com/*` | Any widening is a new risk assessment. **Ask the user before adding a host, never add one silently** |
| A5 | ⚠️ Tenant segment in the regex is **variable** (`[^/]+`) | The real request uses `/organizations/`, not `/common/` — verified on the Azure portal request |
| A6 | ⚠️ Cover v1 **and** v2 endpoints: `/oauth2/authorize` and `/oauth2/v2.0/authorize` | Portals still use both |
| A7 | Endpoint aliases `login.windows.net` / `login.microsoft.com` are **out of scope** (decided 2026-08-17) | No portal in the target environment is known to use them, and each alias is another `host_permissions` entry. Adding one is a host-permission review, not a bugfix |
| A8 | `prompt=select_account` and `login_hint` are **mutually exclusive** — Microsoft: *"You can't use both"* — and **picker mode is the default** | A set `prompt=select_account` makes `login_hint` ineffective. The picker is the mandatory baseline; `login_hint` is opt-in per profile (`docs/architecture.md` §3.1). The third mode, *only the sites I list*, picks **where** the extension acts, not what it injects — it leaves this constraint untouched |
| A9 | WS-Federation (`/wsfed?`) knows no `prompt` — **known gap, documented, not worked around** | See `docs/architecture.md` |
| A10 | The service worker does **nothing but rule sync** | No listeners, no state, no background work beyond `chrome.storage` → DNR |

## Security Rules

Derived from the T0 classification (`docs/security-review.md`). Formulated as rules, not as prose:

1. **Every change to `src/manifest.json`, to `permissions`/`host_permissions`, or to a DNR rule condition triggers the `security-review` skill.** Blocking, not optional. No exceptions for "small" changes.
2. **No new dependency without an explicit decision by the user.** The extension ships zero runtime dependencies; that is a security property, not an accident.
3. **The build is reproducible and its artifact hash is documented** (`docs/deployment.md`). A build that cannot be reproduced cannot be reviewed.
4. **The delivery route auto-updates, and that is accepted** (decided 2026-08-18, `docs/security-review.md` §7). Version pinning is **not available**: `ExtensionSettings` has no such field, and `minimum_version_required` is a floor against downgrades, not a ceiling. **Do not propose `pinned_version` — it does not exist in either the Edge or the Chrome schema.** Two consequences are rules, not observations: the policy always carries `minimum_version_required` so an old version cannot be pushed back onto a profile, and **rollback is `installation_mode: blocked`, never a previous version**.
5. **The repository stays customer- and environment-neutral.** Never commit real UPNs, tenant IDs or names, customer client IDs, CRX signing keys — nor the customer's own identifiers: CA policy names, security group names, internal document versions, proxy or company names. Placeholders and generic descriptions only ("the device-claim CA", not its name). Describe the *role* an artefact plays; its name belongs to the environment, not to this repo.
6. **The EADM UPN appears in every authorize URL** → browser history, proxy logs, possibly `Referer`. Not a new attack vector versus sign-in logs, but broader visibility. Name it in the documentation; never "solve" it by obfuscation.

## Verify Requirement

**Every change to rule logic or permissions requires a run of the verification matrix** (`docs/verification-matrix.md`). The ESTS flow cannot be meaningfully mocked — unit tests cover rule generation, the matrix covers reality.

After any code change run the project verify procedure (`.claude/skills/verify/`). It is also wired as a `Stop` hook, so a red tree blocks the turn from ending. **Exit 2 means not done.**

Unit-testable (and therefore mandatory as a unit test): UPN → DNR rule object · RE2 compatibility of the generated `regexFilter` · no `resourceTypes` other than `main_frame` · empty configuration → no rule.

## Repository Layout

```
ms-account-picker/
├── CLAUDE.md                     # This file — canonical project-wide rules
├── README.md                     # Purpose, status, quick start
├── CHANGELOG.md                  # What each version changed — the audit surface for auto-update
├── .claude/
│   ├── settings.json             # Permissions + Stop hook
│   ├── hooks/verify.sh           # The deterministic gate (exit 0 green / 2 red)
│   └── skills/                   # verify, security-review, dnr-rule-check, release
├── LICENSE                       # Apache-2.0, verbatim
├── NOTICE                        # Copyright line + the trademark reservation
├── SECURITY.md                   # Vulnerability reporting; known-and-accepted properties
├── docs/                         # Project documentation
│   ├── architecture.md           # Decision + rejected alternatives
│   ├── security-review.md        # T0 classification, permissions, risk acceptance
│   ├── deployment.md             # ExtensionSettings policy, signing, rollout
│   ├── verification-matrix.md    # Manual test matrix (portals × states)
│   ├── store-listing.md          # Listing texts, permission justifications, privacy answers
│   └── open-questions.md         # Open decisions — shrinks over the project
├── src/                          # The extension, loaded as written (no build step)
│   ├── manifest.json
│   ├── background/service-worker.js   # Rule sync only
│   ├── ui/                            # The whole configuration UI + vendor strings
│   ├── popup/                         # The one shell — action popup AND options_ui page
│   ├── icons/                         # Rendered PNGs (Chrome takes no SVG)
│   └── lib/rules.js                   # Rule building — pure, unit-testable
├── tools/package.py              # Reproducible ZIP for the store — stdlib only
├── tests/
│   ├── unit/                     # node:test, no framework
│   └── e2e/                      # Loaded-extension checks (Phase 2)
└── build/                        # CRX packaging output — gitignored
```

## Code Standards

- **Plain JavaScript, ES modules, no TypeScript, no bundler.** What is in `src/` is what runs in the browser.
- `src/lib/rules.js` stays **pure**: configuration in, rule objects out. No `chrome.*` calls in there — that is what makes it unit-testable.
- All `chrome.*` access lives in the service worker and the configuration UI.
- Every function carries a comment explaining **intent** — reviewers of this repo are identity admins, not JS developers.
- **Everything in this repository is English** — identifiers, code comments, commit messages, `docs/`, `README.md`, UI strings. Decided 2026-08-17 when the repository was set on course to be public: a German doc set would lock out most of its readers. There is no bilingual mode and no translation to maintain.
- Tests use `node:test` + `node:assert`. No Jest, no Vitest, no fixtures.

## Way of Working

- **YAGNI / KISS / DRY.** Minimum code that solves the problem. No speculative features, no configurability that was not requested.
- **Surgical edits.** Touch only what the request requires. Do not "improve" adjacent code, comments, or formatting.
- **Make assumptions explicit instead of deciding silently.** When multiple interpretations exist, present them. When something is unclear, stop and ask — especially for anything in `docs/open-questions.md`.
- **Flag gaps rather than introduce errors.** Technical correctness beats completeness.
- **When uncertain about current Microsoft/Chromium behavior, state the uncertainty.** Do not guess; the empirically verified facts are in `docs/architecture.md`, everything else is an assumption to be tested.

## Learning Loop

When a session reveals that a documented procedure was wrong, that Chromium/ESTS behaved differently than a skill claims, or a non-obvious environment fact — persist it **in the same session**: correct the affected skill or CLAUDE.md section, or add a line to `docs/open-questions.md`. A wrong doc is worse than no doc.

## Licence

**Apache-2.0**, decided 2026-08-17. The identifier lives in exactly one place: `LICENSE`, the canonical text verbatim. Never restate it in a source header or a second metadata field.

Three consequences that follow from the licence and are not style preferences:

- **`NOTICE` is part of the distribution.** Apache-2.0 §4(d) obliges downstream redistributors to carry it, so it stays short and factual. It holds the copyright line and the trademark reservation — the junis name and the logo files under `assets/logo/` and `src/icons/` are **not** covered by the code grant (§6).
- **No CLA.** §5 licenses inbound contributions under the same terms outbound, and this project has no dual-licensing path to protect. That is the difference from IDemFlow, which needs one — do not copy its CLA apparatus into this repository.
- **Apache-2.0, not AGPL.** AGPL's §13 network-use trigger cannot fire for a browser extension: there is no service anyone could offer. It would add procurement friction without adding protection. Do not propose it again.

## Commit Style

Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`

Two reviews sit before a commit, and they answer different questions:

- **`security-review`** — on any change to rules, `src/manifest.json`, or permissions. **Blocking**: a finding stops the commit until it is decided with the user.
- **`/ponytail-review`** — on any multi-file feature, before committing. A judgment pass on the finished diff: what could be deleted, what was built that nobody asked for, what reinvents something already in the repo. Findings are decided with the user, never resolved alone.

Neither belongs in `verify`. Verify is a deterministic pass/fail gate; these are judgments about a finished diff, and a gate that starts judging stops being a gate. **Not being part of verify does not make either of them optional.**

## Glossary

| Term | Meaning |
| --- | --- |
| **EADM** | Enterprise Admin — cloud-only admin account, separate from the workforce identity |
| **PRT** | Primary Refresh Token — Windows-issued token that Edge injects into every profile; carries the device claim |
| **DNR** | `declarativeNetRequest` — Chromium API for declarative request manipulation without reading request content |
| **MV3** | Manifest V3 — current extension platform; service workers instead of background pages, no remote code |
| **ESTS** | Evolved Security Token Service — the Entra ID token service behind `login.microsoftonline.com` |
| **PKCE** | Proof Key for Code Exchange — `code_challenge`/`code_verifier`; the reason authorize URLs cannot be pre-built |
| **Device-claim CA** | The Conditional Access policy that requires the device claim the PRT supplies. Its name differs per environment and is deliberately not recorded here |
| **Auth Context** | Conditional-access authentication context — step-up trigger for sensitive actions |
