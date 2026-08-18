---
name: release
description: Release procedure for the MS Account Picker extension — bump the version, package a reproducible ZIP, record its hash, write the changelog entry, tag the commit. Use when asked to cut a release, prepare a store upload, bump the version, or when a version number in src/manifest.json needs to change for any reason.
---

# Release Procedure

The delivery route auto-updates and cannot be pinned (`CLAUDE.md` security rule 4, `docs/open-questions.md` F9). That acceptance was granted on one condition: **an unwanted version has to be detectable, since it can no longer be prevented.** This procedure is that detectability. A release that skips a step is not a tidier release — it is a version the customer cannot audit.

Six steps, in order. Steps 2 and 3 produce evidence; steps 4–6 publish it.

## 0. Decide the number

The version lives in **exactly one place**: `version` in `src/manifest.json`. The UI reads it at runtime via `chrome.runtime.getManifest().version`, so there is no second copy to bump and no build step where it could drift. Never add a version to `src/ui/vendor.js` — that file says why.

| Change since the last release | Bump |
| --- | --- |
| A rule condition, an action, a permission, a host | **Minor at least.** Anything the security review had to look at is not a patch |
| A new mode, a new configuration surface | Minor |
| UI copy, docs, a fix with no rule change | Patch |
| The first publicly listed version | `1.0.0` — see below |

Two constraints that are not preferences:

- **Versions only ever go up.** The store rejects an upload whose version is not higher than the published one. There is no way back down, so do not spend a range you may want.
- **`0.x` means "no stability promise" in SemVer.** That is the wrong signal for something a customer force-installs into the authentication path of privileged accounts. Pre-1.0 numbers belong to unlisted pilot uploads; the first *listed* release is `1.0.0`.

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
