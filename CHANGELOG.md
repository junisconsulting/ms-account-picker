# Changelog

Written for the person who cannot refuse the update. This extension is delivered
through the Chrome Web Store, which auto-updates and cannot be pinned by policy
(`docs/open-questions.md` F9), so a customer administrator receives a new version
whether or not they asked for it. Every entry therefore states up front whether
rules, permissions or hosts changed — that is the part a security review needs and
the reason this file exists.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [0.9.0] — 2026-08-18

First packaged version. Unlisted, for the customer pilot: it exists to produce a
stable extension ID and to run Rings 0 and 1. The first publicly listed release
will be `1.0.0`.

**Rules and permissions:** this is the baseline every later entry is measured
against. `permissions` are `declarativeNetRequest` and `storage`. `host_permissions`
is `https://login.microsoftonline.com/*` and nothing else — in particular no
Microsoft portal domain. Every rule matches only the ESTS authorize endpoints and
only in the main frame.

### Added

- Chooses which Microsoft account you sign in with, by adding one query parameter
  to the sign-in request the portal already makes: `prompt=select_account` for the
  account chooser, or `login_hint` to go straight to a configured account.
- Per-site exceptions. A site used with more than one account can keep the picker
  while everything else goes direct, or be left alone entirely.
- Off by default in every browser profile. The extension registers no rule at all
  until it is switched on in that specific profile, which is what allows a
  browser-wide force-install without affecting the everyday profile.
- Popup as the primary surface; the options page renders the same UI.
- A sign-out link, for the state no rule can reach: a site you are already signed
  in to never asks again, so nothing configured here can apply to it.

### Known limitations

- A live portal session is out of reach by design — see the sign-out link above.
  A few sites, `make.powerautomate.com` among them, hold their own session past
  the sign-out until the browser is restarted.
- Sign-in flows using WS-Federation have no equivalent parameter and are not
  covered.
- A per-site rule identifies the portal by the host inside `redirect_uri`. That
  is a heuristic; its limits are stated in `docs/verification-matrix.md` V5.
- Behaviour across the full portal matrix is not yet measured. That is what the
  pilot is for (`docs/verification-matrix.md` §2).
