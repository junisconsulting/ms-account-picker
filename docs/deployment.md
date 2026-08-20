# Deployment

> Status: procedure settled. The artefact hashes and the extension ID are real; the store item exists as a draft. The rollout rings and the policy delivery path are still open.

## 1. Delivery route: Chrome Web Store, publicly listed

This reverses the project's original decision. The reasoning, and what the reversal costs, is recorded as a risk acceptance in `security-review.md` §7 — it is a decision, not a detail.

**Why the store.** The customer needs a stable extension ID to allowlist the extension by policy and to test it. An ID exists for a self-hosted CRX too, but self-hosting makes every install depend on internal distribution infrastructure that does not exist yet, and it puts the burden of a signing key and an update endpoint on the customer before the first test can happen.

**Superseded decision.** No store, self-hosted CRX on internal infrastructure. The reasoning at the time was that a store gives up control over the moment of delivery and over the version, which was judged unacceptable for a T0 influence path, and that the code would become publicly readable. The first point has turned out to be **more true than assumed** — see §1.2. The second is now moot: the repository is public by choice.

### 1.1 Sequencing — the ID exists before publication

1. Create the item in the Chrome Web Store developer dashboard
2. Upload a ZIP of `src/`
3. **The extension ID is visible immediately**, before the listing is complete and before anything is published
4. Hand the ID to the customer for the `ExtensionSettings` entry
5. Complete the listing (`store-listing.md`), submit for review, publish

Steps 1–4 are enough for the customer to allowlist and test. Publication is not a prerequisite for the ID, and an item can stay unlisted while testing runs.

### 1.2 Version pinning is not available — decided, accepted

Verified against both vendors' policy schemas on 2026-08-18: **`ExtensionSettings` has no `pinned_version` field.** Earlier revisions of this document used that key. It does not exist and never did, in neither the Edge nor the Chrome schema. What exists is:

| Field | What it actually does |
| --- | --- |
| `minimum_version_required` | Disables the extension if its version is **older** than the value. A floor against downgrades, not a ceiling — it cannot prevent an update |
| `override_update_url` + `update_url` | Fetches the extension and its updates from a URL you control. The only mechanism that yields real version control, and it requires self-hosting the update manifest |

**Decision (2026-08-18): auto-update is accepted.** A store-hosted extension updates when Google releases it, and no policy prevents that. Self-hosting the update manifest would restore control at the cost of an update endpoint, key custody and a second extension ID — a price this project does not pay for a rule set this small.

What follows is binding, not advisory:

- The policy always carries **`minimum_version_required`**. It cannot stop an update, but it stops an *old* version being forced back onto a profile, which is the direction an attacker would want.
- **Rollback is `installation_mode: blocked`, never a previous version.** The store serves the current version only. A bad release is answered by switching the extension off across the fleet, and the recovery path from there is a fixed version going forward. The customer has to know this before the rollout, not during an incident.
- `CLAUDE.md` security rule 4 states this. `pinned_version` is not to be proposed again.

### 1.3 Edge installing a Chrome Web Store item

The target browser is Edge, the store is Google's. Two documented conditions apply:

- **Domain or Entra join is required.** Microsoft: apps and extensions from outside the Edge Add-ons website can only be force-installed on Windows if the instance is joined to Active Directory or to Microsoft Entra ID. The target fleet is hybrid-joined, so this holds — but it is a dependency worth naming, because it means the extension cannot be force-installed on an unmanaged device.
- **The Chrome Web Store may be blocked.** Many environments block third-party stores with `{"update_url:https://clients2.google.com/service/update2/crx": {"installation_mode": "blocked"}}`. A per-ID `force_installed` entry still wins over that block, but the customer has to know it is there.

If neither holds, the fallback is a second listing in the Edge Add-ons store — which produces a **different extension ID** and therefore a second policy entry and a second review.

## 2. Distribution

**Item identity.** Extension ID `bapkfcamfgmaoaedkdljdmgpedpffjen`, assigned by the Chrome Web Store when the item was created on 2026-08-19. It is stable for the life of that item; a second listing, for instance in the Edge Add-ons store, produces a different one (§1.3).

**An ID from *Load unpacked* is not this ID.** Chromium derives that one from the absolute path of the unpacked directory, so it differs per machine and per checkout, and it never matches what the store assigns. Take the ID from the dashboard — it is in the URL of the item page and on the item's overview — not from `edge://extensions` on a development machine. A policy keyed on the wrong ID force-installs nothing and reports no error.

Through the Edge policy `ExtensionSettings`, browser-wide:

```json
{
  "bapkfcamfgmaoaedkdljdmgpedpffjen": {
    "installation_mode": "force_installed",
    "update_url": "https://clients2.google.com/service/update2/crx",
    "minimum_version_required": "0.11.1"
  }
}
```

`update_url` is the Chrome Web Store endpoint. `override_update_url` is deliberately absent — it belongs to option 2 of §1.2 and would point at a self-hosted manifest.

The force-install happens **browser-wide**; the functional separation comes from the workforce profile never being activated (constraint A3 — no activation flag, no rule). That is the central deployment trick: a single policy object, no profile targeting.

`ExtensionSettings` is the **only** policy in the project. The extension's own configuration (activation, mode, account, per-site exceptions) is deliberately not distributed by policy but set per profile in the extension UI (`open-questions.md` F3). Each admin therefore has a one-time setup step — that belongs in onboarding, not in deployment.

### 2.1 `minimum_chrome_version` — why it stays at 120 (decided 2026-08-19)

The manifest declares `120`. A browser below that refuses to install the extension, so the field only ever **excludes**. Three inputs settled the value:

- **The target fleet runs Edge 151.** `120` is far below it, so no realistically managed device is excluded.
- **The oldest platform feature the code needs is newer than nothing.** The shipped CSS uses unprefixed `image-set()` for the header mark and `accent-color` on the form controls. Going much below `113` would start breaking rendering rather than merely being generous. *(Those per-feature minimums are from memory, not measured — the decision has margin on both sides, so the precision is not load-bearing.)*
- **The failure directions are not symmetric.** Set too high, a device silently does not receive the extension — visible, because the extension is missing. Set too low, it installs on a browser where something may not work, and this project's dominant failure mode is exactly that: a rule that never registers looks identical to "nothing happened", and the admin is signed in with the wrong account with no signal anywhere.

**Honest limit:** the extension has been exercised on exactly one engine, Chrome for Testing 152, plus whatever the manual matrix runs on. Every value of this field is therefore a claim beyond what has been tested — including `120`. Raising it to the tested version would exclude the fleet it is built for, which is why the field is set for reach and the matrix, not the manifest, carries the evidence.

<!-- TODO: add the policy delivery path (GPO or Intune) once the customer has chosen it. -->

## 3. Build and signing

The requirement from `security-review.md`: a reproducible build, artefact hash documented.

The extension has no build step in the sense of transpilation or bundling — `src/` is what runs. "Build" here means packaging, and for the store route it means producing a deterministic ZIP:

```
src/  →  ms-account-picker-<version>.zip  →  Chrome Web Store  →  Google signs the CRX
```

**Signing moves to Google.** That is part of the reversal: the CRX is signed with a key Google holds, so there is no private key in this project's custody and no key to protect — and equally no signature the customer can verify against a junis key. Named in `security-review.md` §7.

What stays verifiable is the **uploaded artefact**. Packaging is a script, not a command to retype:

```bash
python3 tools/package.py --check     # packs, and packs again to prove the bytes match
```

It exists because a plain `zip` is **not** reproducible, which was measured rather than assumed (2026-08-18). ZIP stores each file's mtime, so a fresh clone — where every file carries its checkout time — produces a different hash for identical content. The property would have looked present and been absent. The script pins entry order, timestamp, permissions and compression, and uses only Python's standard library, so it adds no dependency to a project that deliberately has none.

Demonstrated on 2026-08-18: two packs byte-identical, and identical again after the working tree's mtimes were changed.

### 3.1 Artefact register

| Version | Date | SHA-256 of the ZIP | Store item state | Approved by |
| --- | --- | --- | --- | --- |
| 0.11.1 | 2026-08-19 | `0e58f6e12113b7b7921e22abb53da186100f345c2f9cddfe2b95bfda59267b69` | packaged, not uploaded | Claude + D. H. |
| 0.11.0 | 2026-08-19 | `67234c46219da7f86efca953b2b40436d7241f04be7551a177a8a7fe8a947b4d` | **published 2026-08-20** — the version the store serves | Claude + D. H. |
| 0.10.0 | 2026-08-18 | `2615f8061ae40c758e1e8a18f11a68e0ee0d5901bb055cfc41f79248d5dd3bc6` | packaged, not uploaded | Claude + D. H. |
| 0.9.0 | 2026-08-18 | `cfa69712a45708f6f0cc0fb3d0cd200281eee9847cdfb937f24d16b0386b4e69` | packaged, not uploaded | Claude + D. H. |

Every uploaded version is recorded here. A version without an entry is not approved.

## 4. Rollout

<!-- TODO: settle the rings and the abort criteria with the customer. -->

Proposal, to be agreed:

1. **Ring 0** — the project participants, loaded unpacked. Verification matrix complete.
2. **Ring 1** — a small pilot group, by policy against the unlisted store item. Wait at least one sign-in-frequency period of the admin session baseline.
3. **Ring 2** — everyone in scope.

The matrix is **filled during Rings 0 and 1**, not before them — most of its cells need portals, accounts and sign-in logs that only the customer's environment has (`verification-matrix.md` §2). The gate is therefore: before **Ring 2**, the matrix complete and green. Before every ring change: security review recorded, artefact hash registered, and no open abort criterion from the previous ring.

## 5. Rollback

The user-level escape hatch (F2) does not replace a fleet-level rollback path.

Rollback is `installation_mode: blocked` or `removed`. Per §1.2 that is the **only** rollback: the store serves the current version, and `minimum_version_required` can only forbid older ones. The path is "off", not "back" — accepted 2026-08-18.

For an extension in an authentication path, "off" is a complete recovery: with no rule registered the profile behaves exactly as it did before installation (constraint A3, proven by Z2's mechanism in the e2e). Nothing is left half-applied.

Both take effect at the next policy refresh. The time until then is the actual recovery time and has to be known.

<!-- TODO: measure the policy refresh interval in the target environment and record it here. -->
