# Deployment

> Status: procedure settled, not yet carried out. Concrete values (extension ID, hashes, Edge version) are placeholders until the first upload.

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

### 1.2 🔴 Version pinning is not available — open decision

`CLAUDE.md` security rule 4 says: *pinned version in the deployment policy, never auto-update.* **That rule cannot be satisfied for a store-hosted extension.**

Verified against both vendors' policy schemas (2026-08-18): `ExtensionSettings` has no `pinned_version` field. Earlier revisions of this document used that key; it does not exist and never did. What exists is:

| Field | What it actually does |
| --- | --- |
| `minimum_version_required` | Disables the extension if its version is **older** than the value. A floor, not a ceiling — it blocks downgrades, it cannot prevent an update |
| `override_update_url` + `update_url` | Fetches the extension and its updates from a URL you control. This is the only mechanism that yields real version control, and it requires self-hosting the update manifest |

So a store-hosted extension auto-updates, and no policy prevents it. Three ways forward, none of them free:

1. **Accept auto-update.** Set `minimum_version_required` as a floor against downgrade attacks and accept that Google controls when a new version reaches the fleet. Security rule 4 is then rewritten to say what is actually enforceable.
2. **Store for the ID and the review, self-hosting for the delivery.** Keeps real pinning through `override_update_url`. Costs an update endpoint and key custody, and the self-hosted build carries a **different extension ID** than the store item unless the signing key is controlled from the first upload.
3. **Publish only unlisted, deliver by policy.** Reduces exposure but does not change the update mechanism — it is cosmetic against this problem.

**Not decided.** Rule 4 is a security rule; it does not get rewritten to fit a constraint without an explicit decision.

### 1.3 Edge installing a Chrome Web Store item

The target browser is Edge, the store is Google's. Two documented conditions apply:

- **Domain or Entra join is required.** Microsoft: apps and extensions from outside the Edge Add-ons website can only be force-installed on Windows if the instance is joined to Active Directory or to Microsoft Entra ID. The target fleet is hybrid-joined, so this holds — but it is a dependency worth naming, because it means the extension cannot be force-installed on an unmanaged device.
- **The Chrome Web Store may be blocked.** Many environments block third-party stores with `{"update_url:https://clients2.google.com/service/update2/crx": {"installation_mode": "blocked"}}`. A per-ID `force_installed` entry still wins over that block, but the customer has to know it is there.

If neither holds, the fallback is a second listing in the Edge Add-ons store — which produces a **different extension ID** and therefore a second policy entry and a second review.

## 2. Distribution

Through the Edge policy `ExtensionSettings`, browser-wide:

```json
{
  "<extension-id>": {
    "installation_mode": "force_installed",
    "update_url": "https://clients2.google.com/service/update2/crx",
    "minimum_version_required": "<x.y.z>"
  }
}
```

`update_url` is the Chrome Web Store endpoint. `override_update_url` is deliberately absent — it belongs to option 2 of §1.2 and would point at a self-hosted manifest.

The force-install happens **browser-wide**; the functional separation comes from the workforce profile never being activated (constraint A3 — no activation flag, no rule). That is the central deployment trick: a single policy object, no profile targeting.

`ExtensionSettings` is the **only** policy in the project. The extension's own configuration (activation, mode, account, per-site exceptions) is deliberately not distributed by policy but set per profile in the extension UI (`open-questions.md` F3). Each admin therefore has a one-time setup step — that belongs in onboarding, not in deployment.

<!-- TODO: record the extension ID after the first upload; add the policy delivery path
     (GPO or Intune) once the customer has chosen it. -->

## 3. Build and signing

The requirement from `security-review.md`: a reproducible build, artefact hash documented.

The extension has no build step in the sense of transpilation or bundling — `src/` is what runs. "Build" here means packaging, and for the store route it means producing a deterministic ZIP:

```
src/  →  ms-account-picker-<version>.zip  →  Chrome Web Store  →  Google signs the CRX
```

**Signing moves to Google.** That is part of the reversal: the CRX is signed with a key Google holds, so there is no private key in this project's custody and no key to protect — and equally no signature the customer can verify against a junis key. Named in `security-review.md` §7.

What stays verifiable is the **uploaded artefact**. The ZIP must be reproducible so that the hash in §3.1 identifies exactly one set of bytes:

```bash
# Deterministic: fixed timestamps, sorted entries, no extra attributes.
cd src && find . -type f | LC_ALL=C sort | \
  zip -X -q ../build/ms-account-picker-<version>.zip -@ && \
  cd .. && sha256sum build/ms-account-picker-<version>.zip
```

<!-- TODO: run this twice on different machines and confirm the hash matches before the
     first upload. Reproducibility that has not been demonstrated is a claim, not a property. -->

### 3.1 Artefact register

| Version | Date | SHA-256 of the uploaded ZIP | Store item state | Approved by |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

Every uploaded version is recorded here. A version without an entry is not approved.

## 4. Rollout

<!-- TODO: settle the rings and the abort criteria with the customer. -->

Proposal, to be agreed:

1. **Ring 0** — the project participants, loaded unpacked. Verification matrix complete.
2. **Ring 1** — a small pilot group, by policy against the unlisted store item. Wait at least one sign-in-frequency period of the admin session baseline.
3. **Ring 2** — everyone in scope.

Before every ring change: verification matrix green, security review recorded, artefact hash registered.

## 5. Rollback

The user-level escape hatch (F2) does not replace a fleet-level rollback path.

Rollback is `installation_mode: blocked` or `removed`. Note what §1.2 implies: **rolling back to a previous version is not available on the store route** — `minimum_version_required` can only forbid older versions, and the store serves only the current one. The rollback path is therefore "off", not "back".

Both take effect at the next policy refresh. The time until then is the actual recovery time and has to be known.

<!-- TODO: measure the policy refresh interval in the target environment and record it here. -->
