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

## [0.11.0] — 2026-08-19

**Rules and permissions:** `permissions` and `host_permissions` are unchanged —
still `declarativeNetRequest`, `storage`, and `https://login.microsoftonline.com/*`
alone. The **rule builder did change**: the new *only the sites I list* mode
registers no global rule, so a profile using it has the extension touch strictly
fewer requests than any previous version, never more. The manifest is touched on
two lines: the version, and `options_ui.page`, which now names the popup document
instead of a second, identical one.

### Added

- A third global mode: **only the sites I list**. It registers no global rule at
  all — every Microsoft sign-in is left exactly as the portal built it, except on
  the sites named in the list, which keep their own setting. For a deliberately
  narrow deployment; the account picker stays the default.

  **This mode inverts the failure direction and that is worth knowing before you
  choose it:** in every other mode a site the extension fails to recognise falls
  back to the account picker. Here it falls back to nothing, and the sign-in
  proceeds silently on the account the browser already holds. The extension warns
  when the list is empty and the status line names how many sites it reaches, but
  the trade is deliberate — see `docs/architecture.md` §3.1.1.

  No list of Microsoft portals ships with the extension, and none is planned: a
  built-in list goes stale as Microsoft renames its portals, and staleness here
  looks exactly like coverage. The list is yours to fill.

### Changed

- The account name is reachable whenever direct sign-in is in play — as the global
  mode **or** on a single site. It used to appear only while direct sign-in was the
  global choice, so setting one site to direct sign-in meant switching the global
  mode over, typing the account, and switching back. There is one stored account
  name and every direct sign-in uses it; the field now says so and sits below the
  three modes rather than under one of them.
- The options page and the action popup are the same document. `action.default_popup`
  and `options_ui.page` both name `popup/popup.html`, which renders the UI it always
  rendered — the second shell was a byte-identical copy that could only ever drift.
- The header mark follows the operating system's colour scheme through a CSS media
  query instead of a `matchMedia` listener. Same behaviour, a theme change while the
  popup is open included.

### Removed

- `src/options/` — see above.
- The 25 committed logo renders under `assets/logo/preview/` and the four rejected
  logo drafts. The chosen mark stays, as `assets/logo/mark.svg` and `mark-dark.svg`.

### Fixed

- The status line no longer reports "saved" over a per-site direct sign-in that
  was silently dropped for want of a valid account name. It said the site was
  configured while no rule for it existed — pre-existing, and total rather than
  partial in the new mode, which is what brought it to light.
- `assets/logo/render.sh` reproduces `src/icons/icon-48-dark.png`. It used to render
  five sizes of a single variant, which left the dark header icon with no path back
  to its source. All six shipped PNGs verified byte-identical after the change.

## [0.10.0] — 2026-08-18

**Rules and permissions:** no change. The manifest, the rule builder and the service worker are untouched — this is the configuration surface only.

### Changed

- The popup no longer scrolls. Chrome caps an action popup at 600 px tall and the
  content had grown to 848–935 px, so the fix was less on screen at once, not more
  height. Measured: 488 px with the account picker selected, 576 px with direct
  sign-in.
- The account field appears only when direct sign-in is selected. The picker is the
  default, so the first thing a new user saw used to be a field they were not meant
  to fill in, together with its proxy-log notice.
- "Exceptions for specific sites" and "Already signed in to a site?" are now
  collapsed sections, each in its own box. A configured exception still shows as a
  count on the collapsed heading, so folding one away never hides that something is
  set.
- Sign-out is styled as the secondary action it is. It recovers from a state no
  setting can reach; it is not the thing to do first.
- "Default for every Microsoft sign-in" became "When you sign in to Microsoft" —
  "default" only means something once you know exceptions exist.
- Adding a site exception puts the host field on its own line. At the popup's
  minimum width it used to be clipped mid-hostname.

### Internal

- The disclosure marker is the browser's own again; eleven lines of CSS had been
  rebuilding it. No visible change.

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
