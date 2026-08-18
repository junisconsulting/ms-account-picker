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
6. Controlled version in the deployment policy — **under revision**, see §7: version pinning is not available on the store route

## 3. Attack surfaces and countermeasures

| Surface | Risk | Countermeasure |
| --- | --- | --- |
| Rule `action` | Rewritten to `redirect_uri` → the auth code lands with an attacker | Security-review skill §2: only `prompt`/`login_hint` in `addOrReplaceParams`, target host == request host |
| `host_permissions` | Widened to portal domains → access to session-bearing requests | Widen only after asking; see the stop criterion |
| Update channel | A substituted version pushed to all admin profiles | Google signs the package and controls the release moment. Version pinning is **not** available — the residual risk and the open decision are in §7 |
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
| 2026-08-17 | Product copy generalised: `src/manifest.json` (`description`), UI strings in `src/ui/config-ui.js`, two comments in `src/lib/rules.js` | No CRITICAL/HIGH/MEDIUM. Strings and comments only; the manifest is touched at `description` and nowhere else, `permissions`/`host_permissions` byte-identical, no rule condition or action in the diff. LOW: version deliberately not bumped — 0.1.0 has never been delivered, so no installation carries a diverging description. From the first store upload onwards, a manifest text change is a version bump | Claude + D. H. |
| 2026-08-17 | `src/background/service-worker.js` — rule sync | No findings. Two listeners (`onInstalled`, `storage.onChanged` filtered to `local`), no `onMessage`, no `fetch`/`eval`, `removeRuleIds` + `addRules` atomic in a single call | Claude + D. H. |

Every review performed against the skill checklist is recorded here with its date, the scope of the diff, and the result. A review that is not recorded did not happen.

## 7. Risk acceptance: public store distribution

The project began with the opposite decision — self-hosted CRX, internal infrastructure — because a T0 influence path should not hand its delivery to a third party. That is reversed (`deployment.md` §1). The reversal is recorded here rather than as a footnote, because three properties change and none of them improve.

**The code is publicly readable.** Both through the store package and through this repository. Accepted deliberately: it is a transparency gain for the customer's own security review and simultaneously reconnaissance help for an attacker who wants to know exactly which requests are modified. The judgement is that a rule set this small offers an attacker nothing they could not learn by installing the extension anyway, while the review benefit is real.

**The moment of delivery belongs to Google.** A published update reaches profiles when Google's pipeline releases it, not when we say so. There is no supported way to hold it back — see the next point.

**🔴 Version pinning is not achievable, and security rule 4 currently claims it is.** Verified against the Edge and Chrome `ExtensionSettings` schemas on 2026-08-18: the field earlier revisions of `deployment.md` named, `pinned_version`, does not exist. `minimum_version_required` is a floor that blocks downgrades; it cannot stop an update. Real version control requires `override_update_url` pointing at an update manifest we host, which is the route the store replaced.

Consequences that follow and are not yet decided (`deployment.md` §1.2):

- Rule 4 says "never suggest auto-update". On the store route, auto-update is not a suggestion but the mechanism. Either the rule is rewritten to what is enforceable, or the delivery route changes back.
- **Rollback is "off", not "back".** The store serves the current version only, so a bad release is answered with `installation_mode: blocked`, not with a previous version. For an extension in an authentication path that is a materially different recovery story, and the customer has to know it before the rollout, not during an incident.

**The signing key leaves our custody.** Google signs the CRX. That removes a key we would otherwise have to protect at T0 level — genuinely a reduction in attack surface — and it removes the customer's ability to verify a junis signature. What remains verifiable is the uploaded ZIP against the hash in `deployment.md` §3.1.

**Google's review is not one of ours.** It checks store policy, not this project's constraints. The blocking `security-review` skill, the verification matrix, and the reproducible artefact hash all continue to apply unchanged.
