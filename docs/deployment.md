# Deployment

> Status: the procedure is described but has not been carried out. Concrete values (extension ID, `update_url`, hashes) are placeholders.

## 1. Delivery route — under revision 🔴

**The decision recorded below has been reversed and the replacement is not yet written up.** The project now intends to publish through the Chrome Web Store, because the client needs a stable extension ID in order to allowlist and test the extension. Until this section is rewritten, treat the paragraph after it as history, not as the current plan.

Still to be recorded when it is: public code in a T0 authentication path is both a transparency gain and reconnaissance help for an attacker; the moment of delivery moves to Google; security rule 4 (pinned version, no auto-update) remains valid and is enforced on the customer side through `ExtensionSettings`; and Google's review process replaces none of the reviews described in `security-review.md`.

**Superseded decision.** No upload to a store; a self-hosted CRX on internal infrastructure. Reasoning at the time: the store route gives up control over the moment of delivery and over the version, which was judged unacceptable for a T0 influence path; and the code would be publicly readable, including the endpoint rules.

## 2. Distribution

Through the Edge policy `ExtensionSettings`, browser-wide:

- `installation_mode: force_installed`
- `update_url` pointing at the delivery endpoint
- a **pinned version** — no auto-update without approval

The force-install happens **browser-wide**; the functional separation comes from the fact that the workforce profile is never activated (constraint A3 — no activation flag, no rule). That is the central deployment trick: a single policy object, no profile targeting.

`ExtensionSettings` is the **only** policy in the project. The extension's own configuration (activation, mode, UPN) is deliberately not distributed by policy but set manually per profile in the configuration UI (`open-questions.md` F3). Each admin therefore has a one-time setup step — that belongs in onboarding, not in deployment.

### 2.1 Policy skeleton

```json
{
  "<extension-id>": {
    "installation_mode": "force_installed",
    "update_url": "https://<delivery-endpoint>/updates.xml",
    "override_update_url": true,
    "pinned_version": "<x.y.z>"
  }
}
```

<!-- TODO: record the extension ID once the store item exists, align update_url with the
     chosen delivery route (see §1), add the policy path (GPO/Intune). -->

## 3. Build and signing

The requirement from `security-review.md`: a reproducible build, a signing chain at IDemFlow level, artefact hash documented.

The extension has no build step in the sense of transpilation or bundling — `src/` is what runs. "Build" here means packing and signing, nothing else.

```
src/  →  CRX3 (signed)  →  build/ms-account-picker-<version>.crx
```

<!-- TODO: settle the packaging command, clarify key custody (HSM / key vault — the key does
     not belong on a developer machine), demonstrate reproducibility: pack twice, same hash. -->

### 3.1 Artefact register

| Version | Date | SHA-256 | Approved by |
| --- | --- | --- | --- |
| — | — | — | — |

Every delivered version is recorded here. A version without an entry is not approved.

## 4. Rollout

<!-- TODO: settle the rings and the abort criteria with the client. -->

Proposal, to be agreed:

1. **Ring 0** — the project participants, loaded unpacked. Verification matrix complete.
2. **Ring 1** — a small pilot group of admin accounts, by policy. Wait at least one sign-in-frequency period of the admin session baseline.
3. **Ring 2** — all admin accounts.

Before every ring change: verification matrix green, security review recorded, artefact hash registered.

## 5. Rollback

The user-level escape hatch (F2 of the open questions) does not replace a fleet-level rollback path.

Rollback = set `pinned_version` back to the previous version, or set `installation_mode` to `blocked`. Both take effect only at the next policy refresh — the time until then is the actual recovery time and has to be known.

<!-- TODO: measure the policy refresh interval in the target environment and record it here. -->
