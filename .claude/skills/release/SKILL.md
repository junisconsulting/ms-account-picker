---
name: release
description: Release procedure for the MS Account Picker extension — bump the version, package a reproducible ZIP, record its hash, write the changelog entry, tag the commit. Use when asked to cut a release, prepare a store upload, bump the version, or when a version number in src/manifest.json needs to change for any reason.
---

# Release Procedure

The delivery route auto-updates and cannot be pinned (`CLAUDE.md` security rule 4, `docs/open-questions.md` F9). That acceptance was granted on one condition: **an unwanted version has to be detectable, since it can no longer be prevented.** This procedure is that detectability. A release that skips a step is not a tidier release — it is a version the customer cannot audit.

Six steps, in order. Steps 2 and 3 produce evidence; steps 4–6 publish it.

## 0. Choose the version — rules, not gut feeling

The version lives in **exactly one place**: `version` in `src/manifest.json`. The UI reads it at runtime via `chrome.runtime.getManifest().version`, so there is no second copy to bump and no build step where it could drift. Never add a version to `src/ui/vendor.js` — that file says why.

Semantic versioning, translated for a browser extension with no public API: the "contract" is what an administrator must **do** or will **notice**. Judge the **whole diff since the last release** and take the **highest** rule that applies.

| Bump | Rule | Examples |
| --- | --- | --- |
| **MAJOR** (1.x.y → 2.0.0) | The update demands human action outside the extension before it works again | A new `permissions` or `host_permissions` entry — the browser holds the extension until the added access is accepted, and the customer owes a fresh risk assessment (A4). A stored-configuration change without automatic migration, so profiles must be reconfigured. A raised `minimum_chrome_version` that excludes part of the fleet |
| **MINOR** (x.4.y → x.5.0) | Behaviour or capability changes, but nobody has to act | A changed rule condition — which requests are touched is different now. A new mode, a new configuration surface, a new per-site option. Endpoint coverage added or dropped |
| **PATCH** (x.y.2 → x.y.3) | Same capabilities, just working better | Bug fixes with no rule change, UI copy, icons, documentation, test-only changes |

Two questions settle almost every case: *"Must an administrator **do** anything after this update?"* → MAJOR. *"Will the extension **behave** differently?"* → MINOR. Neither → PATCH.

Edge rules:

- **Mixed releases take the highest bump.** One rule change plus five fixes is a MINOR.
- **A change to a rule condition is never a PATCH**, even when it fixes a bug. The set of requests the extension touches changed, and that is the one thing a customer's security review exists to see. "It was only a fix" is how that change gets hidden.
- **Security fixes are a PATCH** and ship promptly — unless the fix itself demands action, which makes it MAJOR like anything else.
- **Under-bumping costs more here than in most projects.** The delivery route auto-updates and cannot be pinned (F9), so the customer cannot decline a version and read up afterwards. The number and the changelog entry are the *only* signals they get, and they arrive with the update, not before it. When torn between two bumps, take the higher one.
- **Pre-1.0:** the same MINOR/PATCH rules apply. `1.0.0` is never reached by counting — it is the deliberate declaration that this is fit for a listed, production release. Pre-1.0 numbers belong to unlisted pilot uploads.

Two constraints that are not preferences:

- **Versions only ever go up.** The store rejects an upload whose version is not higher than the published one. There is no way back down, so do not spend a range you may still want.
- **`0.x` means "no stability promise" in SemVer.** That is the wrong signal for something a customer force-installs into the authentication path of privileged accounts.

Chrome accepts one to four dot-separated integers, each 0–65535.

## 1. Gate and e2e (always)

```bash
bash .claude/hooks/verify.sh     # exit 0 green, exit 2 red
node tests/e2e/dnr.e2e.js        # ~40 s, needs a Chrome binary and openssl
```

**Exit 2 means not done.** A release is the one moment where "mostly fine" costs the most: the artifact is about to become un-recallable except by switching the extension off fleet-wide.

## 2. Bump, and review because you bumped

Edit `version` in `src/manifest.json`.

That edit touches the manifest, which triggers the **blocking `security-review` skill** — no exception for "it's only the version" (`CLAUDE.md` security rule 1). In practice the review is short and the diff is one line, but it is the checkpoint where a permission that crept in earlier gets caught before it ships.

Record the review in `docs/security-review.md` §6. A review that is not recorded did not happen.

## 3. Package reproducibly and hash

```bash
python3 tools/package.py --check
```

`--check` packs twice and fails if the bytes differ. The script pins entry order, timestamp, permissions and compression, because a plain `zip` stores each file's mtime and therefore produces a different hash on a fresh clone — measured on 2026-08-18, not assumed. Do not replace it with a `zip` one-liner; that regression is invisible until someone tries to verify a hash on another machine.

Then add the row to the artefact register in `docs/deployment.md` §3.1: version, date, SHA-256, store item state, who approved it. **A version without a register row is not approved.**

## 4. Changelog

Add the entry to `CHANGELOG.md`, newest first. Write it for the person who cannot refuse the update — a customer administrator who will be handed this version by Google's pipeline whether they want it or not.

That audience decides the content:

- **Anything that changes what requests are touched leads the entry.** Rule conditions, permissions, hosts, `resourceTypes`. If nothing in the entry mentions them, say so explicitly — "no change to rules or permissions" is the sentence a reviewer is looking for.
- Behaviour a user will notice, in their words, not the code's.
- No commit dump. If the entry needs a scrollbar, the release was too big.

## 5. Commit and tag

```bash
git add -A && git commit    # conventional commit, e.g. "chore: release 0.9.0"
git tag -a v<version> -m "<version>"
git push origin main --follow-tags
```

The tag is what turns "which code is in 1.0.0?" from archaeology into one command. Annotated (`-a`), never lightweight — a lightweight tag carries no date and no author.

## 6. Upload (only when a store upload is actually happening)

Sequence from `docs/deployment.md` §1.1: create or open the dashboard item → upload the ZIP → **the extension ID is visible immediately**, before the listing is complete and before anything is published.

Before submitting for review, walk the checklist at the end of `docs/store-listing.md`. Keep the store summary byte-identical to `description` in `src/manifest.json` — they are shown side by side, and drift between them is the kind of finding that costs a review round.

After a successful upload, update the register row's store item state.

## Out of scope

- **Filling the verification matrix.** It is filled during Rings 0 and 1 and gated before Ring 2 (`docs/verification-matrix.md` §2). A release does not wait on it; Ring 2 does.
- **Rollback.** There is none in the "previous version" sense — the store serves only the current one. A bad release is answered with `installation_mode: blocked` (`docs/deployment.md` §5).
