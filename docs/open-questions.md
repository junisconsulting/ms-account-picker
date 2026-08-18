# Open Questions

> This file shrinks as the project proceeds. Claude does not decide an open question on its own — when a task touches one, ask. A decision moves down with its date and its reasoning.

## Open

*(none at the moment — every question raised so far is decided)*

## Decided

### F8 — Live portal session → a sign-out action, not enforcement *(2026-08-18)*

Observed at `make.powerautomate.com`: once signed in, opening the portal in a new tab lands in the application directly. Neither picker nor direct sign-in takes effect, because no authorize request is made at all (`architecture.md` §5.1).

**Decision: a sign-out link in the configuration UI.** It opens the ESTS logout endpoint in a tab. It forces nothing automatically; it turns the switch into one click, after which the next sign-in runs through the extension's rule again and the configured mode applies.

It costs **no new permission**: `login.microsoftonline.com` is already in `host_permissions`, and a plain `<a href target="_blank">` needs no API at all — which is why it is not `chrome.tabs.create`. The URL is a fixed literal inside the static template and is pinned by an e2e assertion on both surfaces, so it cannot drift to another host unnoticed.

**Not decided this way:** enforcing the mode on every portal visit. That would mean matching the navigation to the portal domain itself, and therefore `host_permissions` on the portal domains — the project's stop criterion (`security-review.md` §4). It would also sign the user out repeatedly, which is a different product from an account picker. If the need ever becomes concrete, it is a new risk assessment, not a bugfix (A4).

**Measured 2026-08-18, and it holds:** the ESTS logout does hand the next sign-in back to the rule. One portal behaves differently — `make.powerautomate.com` keeps its own application session past the logout and releases it only after a browser restart. Accepted as-is by the client; sign out, restart, and the configured mode applies there too. The UI names it, because a user who clicks sign-out and sees no change would otherwise conclude the extension is broken. → `verification-matrix.md` Z8.

### F3 — Configuration source → manual entry in the extension UI *(2026-08-17)*

The UPN is entered once in the extension UI and persisted in `chrome.storage.local`. **No defaults by Edge policy.**

The client's reasoning: maximum flexibility — how the admin UPN is derived differs for every customer, so a central scheme would have to be rebuilt per environment.

The consequences that follow, and that are not negotiable:

- There is **no** `3rdparty/extensions/<id>/policy` path. The only policy in the project is `ExtensionSettings` for force-install and version pinning (`deployment.md` §2).
- `chrome.storage.managed` is not read. Anyone who wants to introduce it later has to note this: a policy applies to the OS user, not to an Edge profile — it therefore reaches the workforce profile too and dissolves the separation the deployment relies on.
- Activation stays a flag in `chrome.storage.local` in any case, off by default (constraint A3). Picker mode needs no UPN, so the UPN cannot be the gate.
- The per-admin setup step is therefore fixed: open the extension, activate it, enter the UPN if wanted. At the size of the target population that is an onboarding topic, not a technical one — an unconfigured profile stays silently inert, not broken.

### F5 — Device-registration block for admin accounts → out of scope *(2026-08-17)*

The CA policy that forbids admin accounts from registering a device is **not yet active** in the target environment and, like the whole CA design, is customer-specific. Neither link it nor co-manage it — this repository makes no statement about it.

For later understanding: the policy prevents an admin account from registering on a device and thereby getting an admin PRT into the CloudAP cache of the standard workstation — the clean-source violation that `architecture.md` §2 rejects as "EADM as a second Windows work account". For the extension it is irrelevant: it changes neither the rule shape nor the permissions.

### F1 — Mode → picker as the default, `login_hint` as an opt-in *(2026-08-17)*

The wish for "`login_hint` filled with the admin user **and** an account picker" cannot be satisfied in that form: a `prompt=select_account` that is set makes `login_hint` ineffective (`architecture.md` §3.1). There is no third mode "picker with preselection".

Decision: **the picker (`prompt=select_account`) is the default and the mandatory baseline**, `login_hint` stays available as a per-profile opt-in. The reasoning is in `architecture.md` §3.1 — in short: the picker is the empirically confirmed mode, it keeps foreign tenants reachable (which makes F2 moot), and it writes no identity into the URL.

**Remaining point:** whether `prompt=select_account` **together with** `login_hint` preselects the account in the picker is undocumented and checkable in five minutes → `verification-matrix.md` V1. Positive = both wishes satisfied, negative = the decision stands.

On the question "can the UPN be retrieved dynamically?": not usefully. `chrome.identity.getProfileUserInfo()` returns the account the **Edge profile** is signed in with — not the account of the portal session. It costs the additional `identity`/`identity.email` permission in a T0 extension and assumes the admin profile is signed in to Edge at all. With F3 (manual entry) the question is settled.

### F2 — Escape hatch → a global toggle in the extension UI *(2026-08-17)*

Follows from F1: in the picker default every foreign tenant is reachable through the account chooser, so an escape hatch has nothing to do there. It is only needed in the `login_hint` opt-in, and a switch is enough for that.

No tenant exception list: it would need tenant-segment matching in the `regexFilter`, and therefore additional RE2 surface in exactly the code that requires a review on every change — for a case that does not arise in the default mode.

### F4 — Repository name → `ms-account-picker` *(2026-08-17)*

Extension name "MS Account Picker". More general and less customer-specific than the working title `eadm-account-picker-extension`. Applied throughout the repository.

### F6 — E2E strategy → a dummy authorize endpoint *(2026-08-17)*

`tests/e2e/` tests against a local endpoint that has the shape of an authorize request and triggers the rule — **no real ESTS sign-in, no credentials in the test run**. It proves rule registration, parameter injection and redirect behaviour. What it does not prove remains the business of the verification matrix.

The detail question that was open at the time — how the dummy ends up under the real host name — is answered: Chrome's `--host-resolver-rules=MAP login.microsoftonline.com 127.0.0.1:<port>` plus `--ignore-certificate-errors` and a self-signed certificate generated per run. That runs the **production rule** against a local endpoint without anything in the extension being stubbed. Implemented in `tests/e2e/dnr.e2e.js` (2026-08-17).

### F7 — Endpoint aliases → not covered *(2026-08-17)*

`login.windows.net` and `login.microsoft.com` stay out. No portal in the target environment is known to use them, and each alias is another `host_permissions` entry. If a concrete need appears: a host-permission review per `security-review.md`, not a bugfix on the side.
