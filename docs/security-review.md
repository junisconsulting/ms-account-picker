# Security Review — Classification and Requirements

> Binding. The operational checklist for individual changes lives in `.claude/skills/security-review/SKILL.md` and is **blocking**.

## 1. Classification: T0 influence path

The extension operates **inside the authentication flow** of privileged accounts. Whoever can ship or update it could manipulate `redirect_uri` instead of `prompt` — a perfectly camouflaged token-theft path against exactly the population that phishing-resistant methods are meant to protect.

That makes the extension's own build and delivery chain a T0 asset. It must not be protected any less strongly than the systems it influences.

## 2. Binding requirements

1. Build and signing chain at the same protection level as the IDemFlow pipelines
2. `host_permissions` minimal — ideally nothing but `https://login.microsoftonline.com/*`
3. No background script beyond the rule sync, no `fetch`, no remote code, no telemetry
4. A review is mandatory for **every** change to rules or permissions
5. Reproducible build; artefact hash documented (`deployment.md`)
6. Pinned version in the deployment policy — no auto-update without approval

## 3. Attack surfaces and countermeasures

| Surface | Risk | Countermeasure |
| --- | --- | --- |
| Rule `action` | Rewritten to `redirect_uri` → the auth code lands with an attacker | Security-review skill §2: only `prompt`/`login_hint` in `addOrReplaceParams`, target host == request host |
| `host_permissions` | Widened to portal domains → access to session-bearing requests | Widen only after asking; see the stop criterion |
| Update channel | A substituted version pushed to all admin profiles | Pinned version, signed package. The delivery route itself is under revision — see `deployment.md` §1 |
| Service worker | Loading code at runtime, exfiltrating the UPN | No `fetch`/`eval`/`chrome.scripting`; MV3 CSP; review checklist §3 |
| Dependencies | Supply-chain compromise | Zero runtime dependencies. Adding one is an explicit decision by the client |
| Repository | A signing key or real identifiers in the clear | `.gitignore` for `*.pem`/`*.crx`; no real UPNs or tenant IDs in code, tests, docs or commits |

## 4. Stop criterion 🔴

If it turns out that host permissions on the portal domains (`portal.azure.com`, `security.microsoft.com`, …) are needed, the risk assessment has to be **redone**. The project may then have to be discontinued.

Reasoning: an extension with read access to the portal domains sees the authenticated sessions themselves, not merely the authorize request. The benefit — convenience when switching accounts — does not justify that surface.

Status: not triggered. `host_permissions` on `login.microsoftonline.com` proved sufficient, including for navigations from a foreign origin (`verification-matrix.md` V4).

## 5. Data protection

In `login_hint` mode the UPN appears in every authorize URL → browser history, proxy logs, possibly `Referer`.

Assessment: **not a new attack vector** compared with the sign-in logs, which contain the same UPN anyway — but broader visibility, in particular towards roles that have access to proxy logs without having access to Entra logs.

Consequence: name it, do not obscure it. Obfuscating the UPN in the URL would be ineffective (ESTS needs the clear text) and would make the flow harder to trace.

In picker mode (`prompt=select_account`) this point does not arise at all — the parameter carries no identity. That is one of the arguments in F1 of the open questions.

## 6. Review history

| Date | Scope | Result | Reviewer |
| --- | --- | --- | --- |
| 2026-08-17 | Phase-1 scaffolding: new `manifest.json`, placeholders in `src/` | No CRITICAL/HIGH. MEDIUM: customer-identifying values in the repository → cleaned up (tenant replaced by a placeholder, source document gitignored). LOW: `minimum_chrome_version: 120` not checked against the Edge version of the target fleet | Claude + D. H. |
| 2026-08-17 | `src/lib/rules.js` — the first real rule condition, plus unit tests | No CRITICAL/HIGH. LOW: `isValidUpn` lets `+` and `;` through — no injection is possible, but a `+` would become a space server-side. Check during the load test whether `queryTransform` encodes it | Claude + D. H. |
| 2026-08-17 | Per-site rules: `src/lib/rules.js` (the three-band priority model, `isValidDomain`), `src/background/service-worker.js` (union of rule IDs) | No CRITICAL/HIGH. MEDIUM: new `.*` surface in the site pattern — bounded behind the ESTS anchor, secured as a unit-test invariant. LOW: `%2E` bypass of the host boundary (produces the wrong mode, never a redirected token); rule-count ceiling ≈ 500 sites | Claude + D. H. |
| 2026-08-17 | Popup + shared UI (`src/ui/`, `src/popup/`), manifest (`action`, `icons`, v0.1.0) | No CRITICAL/HIGH. `permissions`/`host_permissions` byte-identical, exactly one `innerHTML` with a static template, validation imported from `rules.js` instead of reimplemented. LOW: `options_ui.open_in_tab` set to `true` (Chrome does not guarantee the behaviour of `openOptionsPage()` when it is `false`) | Claude + D. H. |
| 2026-08-17 | `src/background/service-worker.js` — rule sync | No findings. Two listeners (`onInstalled`, `storage.onChanged` filtered to `local`), no `onMessage`, no `fetch`/`eval`, `removeRuleIds` + `addRules` atomic in a single call | Claude + D. H. |

Every review performed against the skill checklist is recorded here with its date, the scope of the diff, and the result. A review that is not recorded did not happen.
