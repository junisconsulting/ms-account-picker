# Verification Matrix

> **Why manual:** the ESTS flow cannot be mocked in any meaningful way. Unit tests prove the rule object, this matrix proves the behaviour. Both are needed; neither replaces the other.

**Mandatory on every change to rule logic or permissions** (`CLAUDE.md`, Verify Requirement). A run that is not recorded did not happen.

## 0. Pre-verifications

These four assumptions carry the design. They are manual and one-off; while they were open, the project was building on unproven ground.

| # | Assumption | Check | Consequence if negative |
| --- | --- | --- | --- |
| V1 | `prompt=select_account` **plus** `login_hint` preselects the admin account in the picker | Take a portal's authorize URL, add both parameters by hand, call it | None — the picker simply stays without preselection (`open-questions.md` F1). If positive: both requirements are met and the mode design gets simpler |
| ~~V2~~ ✅ | The device claim (`deviceDetail.deviceId`) survives `prompt`/`login_hint` | **Confirmed 2026-08-17, manually in the sign-in log, in both modes.** The extension does not break the device binding — the stop criterion of the whole concept is cleared | — |
| V3 | `login_hint` overrides a PRT belonging to a **different** user | Manually, as with the `select_account` test | The `login_hint` mode is dropped with no replacement; the picker remains the only mode |
| ~~V4~~ ✅ | `host_permissions` on `login.microsoftonline.com` is enough for the redirect | **Confirmed 2026-08-17 by `tests/e2e/dnr.e2e.js`** — the rule applies even for a navigation from a foreign origin for which there is no host permission. The stop criterion from `security-review.md` §4 is averted for now | — |

### V5 ✅ — Does `redirect_uri` carry the portal's domain? *(confirmed 2026-08-17)*

The foundation of the per-site rules (`architecture.md` §4.2). Checked against real authorize requests from the target environment.

| Portal | Endpoint | Tenant segment | Domain in `redirect_uri` |
| --- | --- | --- | --- |
| Azure | **v2** `/oauth2/v2.0/authorize` | `/organizations/` | `portal.azure.com` ✅ |
| Defender | **v1** `/oauth2/authorize` | `/common/` | `security.microsoft.com` ✅ |
| Power Automate | **v2** `/oauth2/v2.0/authorize` | `/organizations/` | `make.powerautomate.com` ✅ |

Three side results that are worth more than the main result:

- **A6 is not theoretical.** Defender really does use the v1 endpoint. Had the rule covered only v2, a portal in the target environment would have been left silently unprotected.
- **A5 confirmed.** Two portals use `/organizations/`, one uses `/common/` — the variable tenant segment is a requirement, not a precaution.
- **The `redirect_uri=` anchor earns its place.** Azure carries `management.core.windows.net` percent-encoded in the `scope` parameter, *before* `redirect_uri`. Without the anchor, a site rule for that host would have matched falsely.

Frozen as a regression test in `tests/unit/rules.test.js` ("the site condition works on the real shape of the target portals") — with placeholders for client IDs, `state` and `nonce`; only the structure is preserved.

**The limits that follow, and that have to stay documented:** the configuration is an **exact host comparison**. `azure.com` does not cover `portal.azure.com`. Portals that share a `redirect_uri` host cannot be told apart. Portals whose `redirect_uri` host is not the host being visited fall through — that is not the case for the three checked, and it is open for the unchecked ones.

## 1. Covered automatically (not part of this matrix)

**Unit** (`tests/unit/`, runs in the verify gate):

- UPN → DNR rule object (fixed input, fixed expected object)
- RE2 compatibility of the generated `regexFilter`
- no `resourceTypes` other than `main_frame`
- empty configuration → no rule

**E2E** (`tests/e2e/dnr.e2e.js`, the loaded extension against a local fake endpoint):

`--host-resolver-rules` points the real host name `login.microsoftonline.com` at a local HTTPS server. DNR matches on the URL, not on DNS — what is tested is therefore the production rule, and nothing inside the extension is stubbed. No contact with Microsoft, no credentials.

| Covered | Statement |
| --- | --- |
| **Z3** | Chromium does not execute a redirect to an identical URL → no loop. Proven, no longer assumed |
| **V4** | The rule applies even for a navigation from a foreign origin for which no `host_permissions` exist |
| **A1** (mechanism) | An `authorize` request inside an iframe is not touched — `prompt=none` arrives unchanged |
| **A3** | Fresh profile → no rule; after `storage.local.clear()` → no rule again |
| **Z5** | The v1 endpoint (`/oauth2/authorize`) matches |
| Rule acceptance | Chromium accepts the `regexFilter` (no unit test can prove that) |
| Parameter fidelity | The portal's own parameters survive the transformation unchanged |

**What the e2e explicitly does not prove:** anything about the real ESTS, the PRT or the device claim. The endpoint is a decoy. Z1 (silent token renewal in real portals) stays manual — the e2e only shows that the rule does not match inside an iframe, not that token renewal as a whole is intact.

## 2. Matrix: portals × states

Three questions per combination:

- **A** — does the sign-in land on the admin account?
- **B** — is `deviceDetail.deviceId` populated in the sign-in log? *(device claim intact → the device-claim CA does not block)*
- **C** — does silent token renewal break? *(must be **no**)*

States: `S1` no session · `S2` admin session active · `S3` workforce PRT active · `S4` after the sign-in-frequency interval of the admin session baseline has elapsed

| Portal | S1 (A/B/C) | S2 (A/B/C) | S3 (A/B/C) | S4 (A/B/C) |
| --- | --- | --- | --- | --- |
| Azure | | | | |
| Entra | | | | |
| Defender | | | | |
| Fabric | | | | |
| SharePoint Admin | | | | |
| Teams Admin | | | | |
| Intune | | | | |
| Purview | | | | |
| M365 Admin | | | | |

One entry per cell: `A✓ B✓ C✓`, or the concrete deviation. No `n/a` without a reason.

## 3. Non-negotiable additional checks

| # | Check | Expectation |
| --- | --- | --- |
| Z1 🔴 | **Silent token renewal** — leave any M365 portal open, let the token lifetime elapse | No re-auth prompt, no `interaction_required` in the console. If that breaks, constraint A1 is violated |
| Z2 🔴 | **Workforce-profile regression** — the same extension, in a profile where it was **never activated** | No change in behaviour whatsoever. `getDynamicRules()` returns `[]` |
| ~~Z3~~ ✅ | **Redirect loop** | **Confirmed 2026-08-17 by the e2e:** Chromium skips a redirect that would produce an identical URL. Manually only as a spot check against a real portal |
| Z4 | **Foreign tenant** — in the picker default | Reachable through the account chooser, with no further action |
| Z4b | **Foreign tenant** — in the `login_hint` opt-in | Reachable only through the toggle in the configuration UI; after switching back on, the rule applies again immediately |
| Z5 | **v1 endpoint** — a portal using `/oauth2/authorize` (without `v2.0`) | The rule applies |
| Z5b | **`prompt=none` in the main frame** — not the iframe variant (A1 covers that), but a genuine top-level navigation carrying `prompt=none` | The rule replaces `none` with `select_account` and turns a silent flow into a visible one. Not broken, but surprising. Watch whether any portal in the target environment actually does this — if so, it is a design decision, not a bug |
| ~~Z8~~ ✅ | **Sign-out link** — with a live portal session, use the link in the configuration UI, then open the portal again | **Confirmed 2026-08-18, manually.** The portal asks again and the configured mode applies. One exception measured: `make.powerautomate.com` keeps its own application session past the ESTS logout and only releases it after a **browser restart**. Sign out, restart, and the rule applies there too. Named in the UI, because otherwise it reads as the extension being broken |
| Z7 | **Live portal session** — sign in to a portal, then open it again in a new tab | The portal loads straight away and **no** rule fires: there is no authorize request to augment (`architecture.md` §5.1). Not a defect of the rule — the boundary of the mechanism. The account menu produces a fresh authorize request, and there the configured mode applies again |
| Z6 | **WS-Federation** — the known gap (A9) | The rule does **not** apply, behaviour unchanged. Documented, not a defect |

## 4. Run log

| Date | Extension version | Edge version | Scope | Result | Performed by |
| --- | --- | --- | --- | --- | --- |
| 2026-08-17 | 0.1.0 | *to be recorded* | **V5** — authorize requests from Azure, Defender and Power Automate checked for the domain inside `redirect_uri` | 🟢 all three carry it. Side finding: Defender uses the v1 endpoint, and both `/common/` and `/organizations/` occur | D. H. + Claude |
| 2026-08-17 | 0.1.0 | n/a (Chrome 152 headless) | E2E extended: the per-site model E1–E9, the configuration UI on **both** surfaces | green, 38/38 | Claude, automated |
| 2026-08-17 | 0.0.0 (unpacked) | *to be recorded* | E2E against the local fake endpoint: Z3, V4, the A1 mechanism, A3, Z5, the options page | green, 14/14 | Claude, automated |
| 2026-08-17 | 0.0.0 (unpacked) | *to be recorded* | **V2** — device claim in the sign-in log, picker **and** hint mode | 🟢 `deviceDetail.deviceId` populated, both modes | D. H. |

For a tightly scoped change, the affected row plus Z1 and Z2 is enough. Before a ring change in the rollout: the **complete** matrix.

## 5. Procedure per cell

1. An Edge profile with the extension configured; establish the state (clear the session / sign in the admin account / workforce PRT active / let the sign-in frequency elapse)
2. Open the portal URL
3. **A** — read the signed-in account off the portal UI
4. **B** — Entra sign-in log → the relevant entry → is `deviceDetail.deviceId` populated?
5. **C** — leave the portal open, watch the DevTools console for `interaction_required` and for failed `prompt=none` requests

For **B** it is not enough that the sign-in succeeded: as long as the device-claim CA is in report-only state, a successful sign-in does not prove that the device claim was present. Always look at the log entry itself.
