---
name: dnr-rule-check
description: Static check of a generated declarativeNetRequest rule for the MS Account Picker — RE2 compatibility of the regexFilter, resourceTypes restriction, redirect-loop risk, and endpoint coverage (v1/v2, tenant segment, ESTS aliases). Use after changing src/lib/rules.js, when a rule does not fire or fires too often, or when the verify procedure routes here.
---

# DNR Rule Check

Static inspection of the rule object **before** it meets a browser. Cheap, deterministic, catches the four failure modes this project actually has. It does not replace the verification matrix — a syntactically perfect rule can still break silent token renewal.

Input: the object returned by the rule builder in `src/lib/rules.js` for a given configuration.

## 1. RE2 compatibility

Chromium's DNR engine uses RE2, JavaScript's `RegExp` does not. A pattern that works in `node -e` can still be rejected at `updateDynamicRules` — and a rejected rule means the extension is silently inactive.

**The authority is the browser, not a heuristic.** In the extension console (`edge://extensions` → service worker):

```js
chrome.declarativeNetRequest.isRegexSupported({
  regex: "<the regexFilter>",
  isCaseSensitive: false,
  requireCapturing: false,
}).then(console.log)   // { isSupported: true } — anything else is a finding
```

Statically, reject these outright (constraint A2 — RE2 has none of them):

| Construct | Example |
| --- | --- |
| Lookahead | `(?=` `(?!` |
| Lookbehind | `(?<=` `(?<!` |
| Backreference | `\1` |
| Possessive / atomic groups | `a*+` `(?>...)` |
| Conditionals | `(?(1)...)` |

Note `requireCapturing`: only pass `true` if the action actually uses `\1`-style substitution. This rule set uses `queryTransform`, so capturing is not needed — keep the pattern free of capture groups except the non-capturing `(?:v2\.0/)?`.

## 2. resourceTypes 🔴

```
condition.resourceTypes === ["main_frame"]
```

Exactly that. Not a superset, not `undefined` (which defaults to *all types except* `main_frame` — the precise opposite of what is needed), not `["main_frame", "sub_frame"]`.

**Why this is the single most destructive mistake possible here:** silent token renewal runs as `prompt=none` in a hidden iframe (`sub_frame`). A rule that injects `prompt=select_account` there turns every silent renewal into an interaction-required error — in *every* M365 portal, for *every* profile that has the extension configured. It does not look like an extension bug; it looks like Entra is broken.

Also check: no `excludedResourceTypes` compensating for a too-wide `resourceTypes` — express the restriction positively.

## 3. Redirect-loop risk 🔴

RE2 has no lookaheads, so "match only if the parameter is absent" cannot be expressed in the filter (constraint A2). The loop protection therefore rests on Chromium's behaviour: a redirect whose target URL is **identical** to the request URL is not performed.

- [ ] With the parameter **already present and identical**, `addOrReplaceParams` produces a byte-identical URL → no redirect
- [ ] With the parameter present but a **different value** (e.g. a portal that sends `prompt=login` itself), the rule replaces it → exactly one redirect, then identical → stop
- [ ] The transform touches **only** the one parameter — any reordering or re-encoding of other query parameters produces a different URL string on every pass, which is a loop even though the parameters are semantically equal

**This is an assumption, not a verified fact** (`docs/open-questions.md`, briefing §3.2). Until verified in a browser, treat "identical URL → no redirect" as unproven and check for `net::ERR_TOO_MANY_REDIRECTS` in the load check. Do not claim it works because the code looks right.

## 4. Endpoint coverage

| Must match | Example |
| --- | --- |
| Variable tenant segment | `/organizations/`, `/common/`, `/<tenant-guid>/`, `/contoso.onmicrosoft.com/` — the real Azure-portal request uses `/organizations/` (A5) |
| v2 endpoint | `/oauth2/v2.0/authorize?` |
| v1 endpoint | `/oauth2/authorize?` (A6) |

Reference pattern (RE2-clean, no capture groups, no lookaheads):

```
^https://login\.microsoftonline\.com/[^/]+/oauth2/(?:v2\.0/)?authorize\?
```

| Must NOT match | Why |
| --- | --- |
| `/oauth2/token`, `/oauth2/v2.0/token` | Token endpoint — not an interactive request |
| `/oauth2/logout`, `/oauth2/v2.0/logout` | Sign-out |
| `/kmsi`, `/login`, `/appverify`, `/reprocess` | Interior ESTS pages of an already-running flow |
| `/wsfed?` | WS-Federation knows no `prompt` — known gap (A9), do not try to cover it |
| any host outside the ESTS host set | The regex must be anchored at `^https://` |

**Aliases (A7):** `login.windows.net` and `login.microsoft.com` reach the same ESTS but are **deliberately out of scope** (decided 2026-08-17). A rule set that covers them is a finding, not a feature — each alias is another `host_permissions` entry and therefore a host-permission review. If a portal in the target environment turns out to use one, that is a decision for the user, not a fix.

## 5. Rule hygiene

- [ ] `id` is stable and unique; the sync **replaces** by id (`removeRuleIds` + `addRules` in one call) instead of accumulating rules
- [ ] `priority` set explicitly if more than one rule exists
- [ ] `prompt` and `login_hint` are never both injected (A8 — a set `prompt=select_account` makes `login_hint` ineffective). Picker mode is the default
- [ ] Not activated in this profile → the builder returns **no rule at all** (A3), not a rule with an empty value. The activation flag is the gate, not the UPN — picker mode needs no UPN
- [ ] `login_hint` mode with an empty UPN → also no rule (a `login_hint=` with no value would be sent to ESTS on every authorize request)

## Output

One line per finding: `[PASS|FAIL] <check> — <what and where>`. On any FAIL name the concrete rule field and the expected value. If checks 1–3 pass but the rule has never run in a browser, say so explicitly — static green is not behavioural green.
