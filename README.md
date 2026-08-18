# MS Account Picker

Manifest-V3 browser extension for Microsoft Edge. It appends a single query parameter (`prompt=select_account` or `login_hint=<UPN>`) to the OAuth authorize request, so that an admin working in a dedicated browser profile is not signed in automatically with the wrong account by the injected workforce PRT.

**Status: Phase 2 — implemented, not yet rolled out.** Rule builder, service worker and the configuration UI are in place; 31 unit tests and 38 end-to-end checks pass. Still open: the store item that produces a stable extension ID, and a full run of the manual verification matrix.

> 🔴 The extension operates **inside the authentication flow of privileged accounts** and is classified as a T0 influence path. Every change to the manifest, to permissions, or to a rule condition requires a blocking security review. See [docs/security-review.md](docs/security-review.md).

## Documentation

| File | Contents |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | Binding project rules, hard architecture constraints, glossary |
| [docs/architecture.md](docs/architecture.md) | The approach, rejected alternatives, empirical status |
| [docs/security-review.md](docs/security-review.md) | T0 classification, requirements, stop criterion, data protection |
| [docs/deployment.md](docs/deployment.md) | `ExtensionSettings` policy, signing, rollout, rollback |
| [docs/store-listing.md](docs/store-listing.md) | The store listing texts, permission justifications, privacy answers |
| [docs/verification-matrix.md](docs/verification-matrix.md) | Manual test matrix — portals × session states |
| [docs/open-questions.md](docs/open-questions.md) | Open decisions; shrinks as the project proceeds |
| [SECURITY.md](SECURITY.md) | How to report a vulnerability, and what is already known and accepted |

## Development

No build step, no dependencies. What is in `src/` is what runs in the browser.

```bash
bash .claude/hooks/verify.sh       # gate: manifest JSON, node --check, unit tests
node --test tests/unit/*.test.js   # unit tests on their own
node tests/e2e/dnr.e2e.js          # e2e: the loaded extension against a local fake endpoint
```

The e2e run needs a Chrome binary (`CHROME_BIN` or the Puppeteer cache) and `openssl`. It is deliberately not part of the gate — it takes about 30 s and needs a browser. It never contacts Microsoft: `--host-resolver-rules` points `login.microsoftonline.com` at a local server, and what gets tested is still the production rule.

Load the extension: `edge://extensions` → developer mode → **Load unpacked** → the `src/` directory.

## Claude Code

`.claude/skills/` holds three procedures: `verify` (success criteria and the gate), `security-review` (the blocking checklist for changes to the manifest, permissions or rules), and `dnr-rule-check` (static rule inspection: RE2, `resourceTypes`, loop risk, endpoint coverage).

`verify.sh` is additionally wired as a `Stop` hook — a red tree blocks the turn from ending.

## Licence

[Apache-2.0](LICENSE). Copyright 2026 junis GmbH.

The junis name, the word mark and the logo files under `assets/logo/` and `src/icons/` are brand assets and are **not** covered by the code licence — see [NOTICE](NOTICE). Fork the code freely; replace the mark.
