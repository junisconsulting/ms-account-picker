# Architecture

> Status: implemented, not yet rolled out. The decisions recorded here are made. What is still unproven is listed in §7.2 and nowhere else — an assumption that does not appear there is either proven or not load-bearing.

## 1. Problem

On hybrid-joined Windows clients Edge injects the signed-in workforce user's Primary Refresh Token (PRT) into **every** browser profile. An admin who wants to work in a second Edge profile with a cloud-only admin account (EADM) is therefore signed in with the workforce account automatically.

**Affected population:** the client's EADM accounts, and prospectively further customers in the same constellation.

**Why this is not trivial:** the PRT also supplies the device claim that the conditional-access policy for hybrid join (below: the **device-claim CA**) requires. Any solution that switches SSO off breaks the device binding.

## 2. Rejected alternatives

Do not propose these again. Every line has been examined and failed for the reason given.

| Approach | Why it was rejected |
| --- | --- |
| Edge setting "Automatically sign in to sites…" | It is a **picker** switch, not an SSO switch. It only hides the choice |
| Edge policy `AADWebSiteSSOUsingThisProfileEnabled` | `Per Profile: No` → it hits the workforce profile as well |
| `loginHint` in portal URLs | Only the Azure and Entra portals support `/signin/index/@domain?loginHint=`. Defender, Fabric, SharePoint, Teams: no mechanism |
| EADM as a second Windows work account | The admin PRT lands in the CloudAP cache of the standard workstation → a clean-source violation (Enterprise Access Model). Rejected by the client |
| CA block on `MicrosoftAdminPortals` for workforce | SSO still happens, and a block page offers no way to switch accounts |
| Edge custom site switch | The Windows account appears in every profile; switching profiles does not solve it |
| Firefox / Chrome without WAM | No device claim → the device-claim CA blocks |
| A second Windows user account / PAW / AVD | Structurally correct, but rejected by the client as unusable in daily work |
| Pre-built authorize URLs | Fails by construction on PKCE and single-use `state`. Tested |

## 3. The approach

A **Manifest-V3 browser extension** that, in the admin profile, adds a query parameter to the OAuth authorize request in flight.

**Core principle: augment, never construct.** The portal (MSAL.js) builds the request including `state`, `nonce`, `code_challenge` (PKCE) and `response_mode`. The extension adds exactly one parameter. That is why the approach works for every Microsoft portal without maintaining client IDs or redirect URIs.

### 3.1 Two parameters, three modes

There are exactly two parameters the extension will ever inject:

| Mode | Injected parameter | Behaviour |
| --- | --- | --- |
| **Picker** | `prompt=select_account` | The account chooser always appears; the workforce account stays visible |
| **Hint** | `login_hint=<UPN>` | Straight to the configured account; the workforce account never appears |

**The two are mutually exclusive.** Microsoft documents it in one sentence: *"You can't use both `login_hint` and `select_account`."* ([OIDC protocol reference](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc), `prompt` parameter). "Picker, but with the account preselected" is therefore not an unexplored third mode — it is documented as unsupported.

**Decision (2026-08-17):** the picker is the default and the mandatory baseline. `login_hint` remains available as a per-profile opt-in, for admins who want to save the click and do not need a foreign tenant.

Reasoning:

- The picker is the mode that works without unproven assumptions — `prompt=select_account` is empirically confirmed (§7.1), the effect of `login_hint` against a foreign PRT is not (§7.2).
- The picker keeps every foreign tenant reachable, which makes a separate escape hatch unnecessary.
- The picker writes no identity into the URL — the data-protection point from `security-review.md` §5 does not arise in this mode at all.

That closes what used to be an open verification (V1). It was carried as "undocumented, checkable by hand in five minutes"; the documentation existed, we had not read it. The combination is not available, so the decision above is not a compromise between two options — it is the only shape the protocol offers.

#### 3.1.1 The third mode is a scope, not a parameter (decided 2026-08-18)

**Only the sites I list** injects nothing globally: no base rule is registered, and only the configured sites get one — each with the parameter its own mode names. A8 is untouched, because the choice is *where* the extension acts, not *what* it injects.

It exists because reach is a customer decision. The base rule matches every ESTS authorize request, which is exactly what lets the extension work on portals nobody has tested; a customer who wants a deliberately narrow deployment had no way to say so.

**It inverts the failure direction, which is why it is opt-in and never the default:**

| A site fails to match | Result |
| --- | --- |
| Picker / Hint | Falls back to the global default → the user gets a picker → safe |
| Only the sites I list | No rule fires → the user is signed in silently with the PRT account |

The per-site condition finds the portal host inside the percent-encoded `redirect_uri` — a heuristic, with the `%2E` caveat and exact-host-only matching recorded in `SECURITY.md`. As an exception mechanism a miss costs nothing. As the **primary gate** every miss is an invisible failure. Two consequences are therefore part of the mode, not decoration: an empty list is a warning in the UI rather than a saved state, and the status line names the number of sites the configuration actually reaches.

**No list of portals ships with the extension.** A prefilled set of Microsoft hostnames was considered and rejected on 2026-08-18. Microsoft is renaming its portal estate (`compliance.` → `purview.`, `endpoint.` → `intune.`, the consolidation onto `*.cloud.microsoft`), so a shipped list is stale on arrival — and staleness surfaces as silent non-coverage on the new hostname. It would also reach the customer through the auto-updating delivery route they cannot decline (F9), changing the rule surface under them. The list stays empty and customer-owned; the UI offers free text, not a menu.

## 4. Components

Deliberately minimal — no framework, no build step for the extension itself, no remote code.

```
Configuration UI  →  chrome.storage.local  →  Service Worker  →  DNR dynamic rules
 (mode, UPN, sites)     (configuration)         (rule sync)      (request transform)
```

| Component | File | Job |
| --- | --- | --- |
| Configuration UI | `src/ui/config-ui.js` | Activation, mode, UPN and the per-site list; writes to `chrome.storage.local`. **The only configuration source** — no policy defaults, deliberately manual (`open-questions.md` F3) |
| Shell | `src/popup/` | One document, two entry points: `action.default_popup` and `options_ui.page` both name it, so the popup and the link Chrome offers on the extensions page are the same surface and cannot drift apart |
| Rule builder | `src/lib/rules.js` | Configuration → rule objects. Purely functional, no `chrome.*` calls, unit-testable |
| Service worker | `src/background/service-worker.js` | Reads storage, syncs the dynamic rules. Nothing else |
| Manifest | `src/manifest.json` | Permissions, MV3 declaration |

### 4.1 Rule shape

```
action.type              = "redirect"
redirect.transform.queryTransform.addOrReplaceParams
condition.regexFilter    = ^https://login\.microsoftonline\.com/[^/]+/oauth2/(?:v2\.0/)?authorize\?
condition.resourceTypes  = ["main_frame"]
```

### 4.2 Per-site rules

One global default plus exceptions per portal. Three priority bands:

| Band | Priority | Rule | When |
| --- | --- | --- | --- |
| Base | 1 | broad authorize regex → the global default parameter | activated, unless the global mode is *only the sites I list* |
| Site guard | 2 | site regex → `action: "allow"` | for **every** configured site |
| Site injection | 3 | the **identical** site regex → that site's parameter | site mode ≠ `off` |

**How the portal is recognised.** Not by the initiator: `condition.initiatorDomains` is unusable here, because a browser-initiated navigation — a typed URL, a bookmark, history — has **no** initiator, and an HTTP 302 keeps the *original* initiator rather than the redirecting portal (Chromium sources `url_pattern_index.cc`, `navigation_params.mojom`). Filtering on that basis would work sporadically, which is worse than not at all.

Instead, the portal's domain is already present in the authorize URL: percent-encoded inside `redirect_uri`. Confirmed for three portals of the target environment → `verification-matrix.md` V5, together with the limits of the heuristic.

**Why the guard rule matches on the site condition and not on the injected parameter.** The priority-2 condition does not mention the parameter, and therefore matches identically before and after the injection. That makes the model correct regardless of how Chromium treats a rule that has no effect.

Measured (2026-08-17): **Chromium does not fall through.** With the guard rule removed, E1 stays green — after a rule whose redirect would produce an identical URL, matching stops and the base rule never gets its turn. The guard is thus redundant for `picker`/`hint` sites and load-bearing for `off` sites. It stays for both: a T0 path must not rest on undocumented behaviour that a browser update can change silently.

With no base rule — the *only the sites I list* mode — no guard is emitted either. A guard exists solely to hold the base rule off a site, so without one it would be dead weight in the rule set.

**One account name, not one per site.** Every rule that injects `login_hint` — the global one and every per-site one — reads the same stored value. A per-site account was considered and not built: it would multiply the trust boundary of `isValidUpn` across an unbounded list for a need nobody has stated. The consequence for the UI is that the field belongs to the profile rather than to the global mode, and is offered whenever direct sign-in appears anywhere in the configuration.

**Rejected:** using `removeParams` to make the base rule and the site rule mutually exclusive. That oscillates — the base sets the parameter, the site rule removes it, and the flow ends in `ERR_TOO_MANY_REDIRECTS`. It is recorded as a named trap in `dnr-rule-check`.

## 5. Hard technical constraints

The binding version is in `CLAUDE.md` (A1–A10). The reasoning:

- 🔴 **`resourceTypes: ["main_frame"]` is mandatory.** Silent token renewal runs as `prompt=none` in a hidden iframe. A rule that matches there breaks token renewal in **all** M365 portals.
- 🔴 **`regexFilter` uses RE2 — no lookaheads.** Loop protection has to be solved without them: an identical target URL produces no redirect. Confirmed, see §7.1.
- ⚠️ **Cover the v1 and the v2 endpoint:** `/oauth2/authorize` and `/oauth2/v2.0/authorize`.
- **Endpoint aliases (`login.windows.net`, `login.microsoft.com`): deliberately not covered** (2026-08-17). No portal in the target environment is known to use them, and each alias is another `host_permissions` entry. If a concrete need appears: a host-permission review, not a bugfix.
- ⚠️ **WS-Federation (`/wsfed?`) has no `prompt`.** Not covered — a known gap.
- **Without explicit activation in the profile, no rule may be registered.** The extension is then functionally inert. That is what makes a browser-wide force-install possible without affecting the workforce profile. The gate is a flag in `chrome.storage.local` (per profile), **not** the UPN — the picker default needs no UPN at all.

### 5.1 The boundary: an existing portal session

The extension augments an authorize request that is **in flight**. Where there is no authorize request, there is nothing to augment.

That is exactly the state after a successful sign-in. A portal such as Power Automate keeps its own application session — cookies on its own origin plus the MSAL token cache in that origin's browser storage. Opening the portal in a new tab then loads the application directly: MSAL finds a valid token in its cache, and where it needs a fresh one it fetches it silently as `prompt=none` in a hidden iframe, which A1 excludes on purpose (matching there breaks token renewal in every M365 portal).

Stated plainly: **the extension decides which account you sign in as, not whether you are asked to sign in at all.** While a portal session is alive, switching accounts is the portal's own business. The account menu ("sign in with a different account") is the path, and it produces a fresh authorize request — at which point the rule applies again and the configured mode takes effect.

Reaching into that state would mean matching the navigation to the portal domain itself, and therefore `host_permissions` on the portal domains. That is the project's stop criterion (`security-review.md` §4), not a feature increment. The decision is recorded as F8 in `open-questions.md`.

**What the extension does offer for it** (F8, 2026-08-18): a sign-out link in the configuration UI, pointing at the ESTS logout endpoint. It enforces nothing — it hands the next sign-in back to the rule, in one click instead of through the portal's account menu. It needs no new permission, because `login.microsoftonline.com` is already covered and a plain link needs no API.

Measured on 2026-08-18: it works. Microsoft documents why it works — after a sign-out, *"if a valid Primary Refresh Token (PRT) exists for the signed-out user and a new sign-in is executed, single sign-out will be interrupted and user will see a prompt with an account picker"* ([OIDC protocol reference](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc), sign-out request). The PRT that causes this project's problem is the same PRT that makes the sign-out land on a picker.

One portal is slower to let go — `make.powerautomate.com` holds its own application session past the ESTS logout and releases it only after a browser restart (`verification-matrix.md` Z8). The same page explains that too: single sign-out reaches an application only through **front-channel logout**, which requires the application to have registered a front-channel logout URL *and* to clear its own session on request. Where an application does not, the ESTS session ends and the application's does not. That is a property of the portal, not of the rule — named in the UI rather than worked around.

Reported from real use on 2026-08-18, at `make.powerautomate.com` with a live session.

## 6. Escape hatch

The problem only exists **in `login_hint` mode**: there, no other account is reachable, not even a test tenant. In picker mode (the default) every account is reachable through the account chooser, so an escape hatch has nothing to do.

**Decision (2026-08-17):** a global on/off switch in the configuration UI. No tenant exception list — that would need tenant-segment matching in the `regexFilter`, and therefore additional RE2 surface in exactly the part of the code that requires a review on every change. For a case that does not arise in the default mode.

The switch is not a fleet-level rollback path; that runs through the policy, see `deployment.md` §5.

## 7. Empirical status

### 7.1 Confirmed

- `prompt=select_account` reliably interrupts PRT-based auto-SSO. Verified manually against the Azure portal request (`/organizations/oauth2/v2.0/authorize`).
- The real request uses `/organizations/`, not `/common/` → the tenant segment in the regex has to be variable.
- Pre-built URLs fail on PKCE and single-use `state`.
- 🟢 **The device claim survives — in both modes.** Verified manually in the sign-in log (2026-08-17). This clears the concept's central uncertainty: the extension does not break the device binding, and the device-claim CA does not block even in enforcement mode.
- No redirect loop: Chromium does not execute a redirect to an identical URL. Proven automatically by `tests/e2e/dnr.e2e.js` (2026-08-17).
- `host_permissions` on `login.microsoftonline.com` is sufficient — the rule applies even when the navigation starts from a foreign origin. Proven automatically (2026-08-17). The stop criterion from `security-review.md` §4 has therefore not been triggered.

### 7.2 Not yet confirmed

| Assumption | Verification | Consequence if negative |
| --- | --- | --- |
| `login_hint` overrides a PRT belonging to a **different** user | Manually, in the admin profile with an active workforce PRT | The `login_hint` mode is dropped with no replacement; the picker remains the only mode and carries the concept on its own |
| `prompt=select_account` + `login_hint` preselects the account in the picker | Manually, by adding both parameters to an authorize URL | None — the picker simply stays without preselection |

## 8. References

Public:

- MS Learn: `declarativeNetRequest`, `conditionalAccessApplications`, the OIDC `prompt` parameter
- Microsoft Enterprise Access Model — the clean-source principle

Environment-specific, and deliberately **not** in this repository:

- The client's CA naming convention
- The device-claim CA (the hybrid-join requirement) — its name differs per environment
- The admin session baseline (non-persistent browser session, sign-in frequency)
- The internal Enterprise Access Model document

These artefacts have their life cycle outside the extension. Whoever needs them will find them at the client; they do not belong in this repository, which stays customer- and environment-neutral.
