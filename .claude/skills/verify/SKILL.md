---
name: verify
description: Project verify procedure for the MS Account Picker extension — run after any code change. Defines success criteria before implementing, then runs the deterministic gate (manifest JSON, node --check, unit tests), plus a manual load check when extension files changed and the verification matrix when rule logic or permissions changed. Use when asked to verify changes, before declaring work done, or when the /verify skill bootstraps.
---

# Verify Procedure

Two halves. Step 0 happens **before** writing code — vague criteria produce endless clarification loops. Steps 1–4 happen after. Report every failure with its output; never summarize a red step as "mostly fine".

## 0. Define success criteria first (before implementing)

Turn the task into checkable statements. Not "make the rule work" but:

```
1. [Change] → verify: [concrete check]
```

For this project the criteria almost always come from the same set:

- The generated DNR rule is **exactly** the expected object (unit test with a fixed input)
- `condition.resourceTypes` is `["main_frame"]` and nothing else
- `regexFilter` compiles under RE2 and matches v1 + v2 endpoints
- Empty configuration → **no** rule registered
- No redirect loop: a request that already carries the parameter is not redirected again
- `permissions` and `host_permissions` in `src/manifest.json` are **unchanged** (`git diff --stat src/manifest.json` is empty) — if not, step 4 is mandatory

State these criteria to the user before you implement. If a criterion cannot be expressed as a check, it is not a criterion — ask.

## 1. The gate (always)

```bash
bash .claude/hooks/verify.sh     # exit 0 = green, exit 2 = red
```

Run it from the repo root, **standalone**. It reads the Stop-hook payload from stdin, so chaining it in front of something that needs stdin (`verify.sh && git commit -F - <<'EOF'`) makes it eat that input — the read is timeout-bounded, so it no longer hangs, but the command behind it still starves.

**Exit 2 means not done** — read the stderr output, fix, run again. There is no "mostly fine" here.

| Checked | How |
| --- | --- |
| `src/manifest.json` | `JSON.parse` — a broken manifest fails silently in the browser |
| every `*.js` in `src/` and `tests/` | `node --check` |
| `tests/unit/*.test.js` | `node --test tests/unit/*.test.js` — a directory argument resolves as a module on node 22 and fails |

The same script is wired as a `Stop` hook, so a red tree already blocks the turn from ending. Running it by hand only gets you the output sooner.

Not covered by the gate — that is what steps 2–4 are for: does Edge actually load the extension, does the rule fire, does anything break in the real ESTS flow.

## 2. Load check (when anything under `src/` changed)

The gate proves the files parse. It does not prove Edge accepts them.

1. `edge://extensions` → Developer mode → **Load unpacked** → `src/`
2. No error banner on the extension card, no warning triangle
3. Service worker card shows **active**, its console has no errors
4. `edge://extensions/?id=<id>` → the extension console:
   ```js
   chrome.declarativeNetRequest.getDynamicRules().then(console.log)
   ```
   In a profile that was never activated this must return `[]` (constraint A3). After activation it must return exactly one rule.

5. Arming without the options page — useful until it exists, and the fastest way
   to reach the matrix checks that need a live rule (V4, Z3):
   ```js
   chrome.storage.local.set({ enabled: true, mode: "picker" })          // picker
   chrome.storage.local.set({ enabled: true, mode: "hint", upn: "…" })  // hint
   chrome.storage.local.clear()                                         // back to inert
   ```
   `storage.onChanged` triggers the sync, so `getDynamicRules()` reflects the change
   immediately. Use a **test tenant** UPN here, never a production EADM.

## 2b. E2E against the fake endpoint (when rule logic changed)

```bash
node tests/e2e/dnr.e2e.js       # ~30 s, exit 0 = green
```

Needs a Chrome binary (`CHROME_BIN`, or the puppeteer cache under
`~/.cache/puppeteer/chrome/*/chrome-linux64/chrome`) and `openssl`. Deliberately
**not** part of the gate — it is slow and needs a browser.

It maps `login.microsoftonline.com` onto a local HTTPS server via
`--host-resolver-rules`, so the production rule runs against a fake endpoint with
nothing stubbed inside the extension. Covers Z3 (no loop), V4 (cross-origin
initiator), A1 (iframe untouched), A3, and the v1 endpoint.

Two things it cannot do: prove anything about real ESTS, and replace step 4.

## 3. DNR rule check (when `src/lib/rules.js` or a rule condition changed)

Run the `dnr-rule-check` skill. It is the static counterpart to the matrix: RE2 compatibility, `resourceTypes`, loop risk, endpoint coverage (v1/v2/aliases).

## 4. Verification matrix (when rule logic or permissions changed) 🔴

**Mandatory, not optional** — CLAUDE.md, Verify Requirement. The ESTS flow cannot be mocked; unit tests prove the rule object, only the matrix proves the behaviour.

Run `docs/verification-matrix.md`. Record the result in the matrix file itself (date, browser version, extension version) — an unrecorded run did not happen.

Full matrix (portals × states) is the release gate. For a scoped change, run the affected row plus the two non-negotiables:

- **Silent token renewal intact** — open any M365 portal, leave it idle past token lifetime, no re-auth prompt (constraint A1)
- **Workforce-profile regression** — same extension, never activated in that profile, zero behavioural change

## 5. Permission diff (whenever `src/manifest.json` changed)

```bash
git diff src/manifest.json
```

Any change to `permissions`, `host_permissions`, or `declarative_net_request` → run the `security-review` skill. Blocking. A permission widening that reaches a commit without a review is a process failure, not a detail.

## Out of scope

- No linter, no formatter, no type checker exists in this project — do not invent one.
- E2E never touches real ESTS. `tests/e2e/dnr.e2e.js` drives a loaded extension against a local fake endpoint; a test that signs in for real would be a credential leak waiting to happen. Keep it that way.
- **`/ponytail-review`** — required before committing a multi-file feature (`CLAUDE.md`, Commit Style), but deliberately not run *here*: verify is a deterministic pass/fail gate, and an over-engineering finding is a judgment about a finished diff. Not being part of verify does not make it optional.
