# Chrome Web Store listing

> The exact texts to paste into the developer dashboard. Kept in the repository so the published description and the code are reviewed together — a listing that promises something the manifest does not do is a defect, not a marketing choice.

Anything marked 🟡 needs an input that is not in this repository.

## Item metadata

| Field | Value |
| --- | --- |
| Name | `MS Account Picker` |
| Category | Workflow & Planning |
| Language | English |
| Visibility for testing | **Unlisted** until the verification matrix is complete (`deployment.md` §1.1) |

## Summary — the short description

Limit 132 characters. This is byte-identical to `description` in `src/manifest.json`; keep them in sync, they are shown side by side.

```
Choose which Microsoft account you sign in with, per site, instead of being signed in automatically.
```

100 characters.

## Detailed description

```
Signed in to Microsoft with the wrong account, without ever being asked?

On a managed Windows device the browser can carry your Windows identity into
every browser profile. Open a Microsoft site and it signs you in with that
account — no prompt, no choice. If you hold a second Microsoft account, that is
the account you did not want.

MS Account Picker gives the choice back. It adds a single query parameter to
Microsoft's sign-in request, so that you either get the account chooser or land
directly on the account you configured.

WHAT IT DOES

• Account picker — always shows the account chooser, so you pick each time.
  Sends no identity anywhere.
• Direct sign-in — goes straight to the account you entered.
• Per site — a site you use with more than one account can keep the picker
  while everything else goes direct, or the other way round.
• Only the sites you list — for a deliberately narrow setup: nothing changes
  anywhere except on the sites you name yourself.
• Off per profile — it does nothing at all until you switch it on in this
  browser profile. Install it everywhere, arm it where you want it.

HOW IT WORKS

The extension does not build sign-in URLs and does not read pages. It appends
one parameter — prompt=select_account or login_hint — to the authorize request
your Microsoft portal already makes. Everything else about that request is left
exactly as the portal built it.

That single parameter is why it works on any Microsoft portal without a list of
sites to maintain, and it is why the extension needs access to exactly one
address: login.microsoftonline.com.

WHAT IT DOES NOT DO

• No telemetry, no analytics, no error reporting. Nothing leaves your browser.
• No account, no sign-up, no server.
• No remote code and no third-party libraries — the extension has zero
  dependencies.
• No access to the Microsoft portals themselves, only to the sign-in endpoint.
• It never reads the content of any request. The parameter is added by the
  browser's own declarativeNetRequest engine, which the extension only supplies
  a rule to.

WHAT IT CANNOT DO

A site you are already signed in to does not ask again, so no setting can apply
to it. The extension includes a sign-out link for that; a few sites hold their
own session until the browser is restarted.

Sign-in flows that use WS-Federation have no equivalent parameter and are not
covered.

OPEN SOURCE

Source, documentation, security review and threat model:
https://github.com/junisconsulting/ms-account-picker

Licensed under Apache-2.0. Built by junis.
```

## Single purpose

The dashboard requires one purpose in one sentence.

```
The extension has a single purpose: adding one query parameter — prompt=select_account or login_hint — to Microsoft's OAuth authorize request, so the user can choose which Microsoft account they are signed in with.
```

## Permission justifications

One field per permission. Keep these literal: they are the claim the store review is measured against, and they must stay true of the manifest.

**`declarativeNetRequest`**

```
The extension's entire function is one declarative rule that appends a single query parameter to Microsoft's sign-in request. declarativeNetRequest is what performs that append. It was chosen over webRequest deliberately: declarativeNetRequest cannot read request content. The extension supplies a rule to the browser and never observes the requests the rule applies to.
```

**`storage`**

```
Stores the user's own settings: whether the extension is active in this browser profile, which of the three modes to use, the account name for direct sign-in, and the per-site list. chrome.storage.local only. Nothing is synchronised and nothing is transmitted.
```

**Host permission `https://login.microsoftonline.com/*`**

```
This is the sign-in endpoint whose authorize request the extension modifies, and the only address it needs. The extension requests no access to the Microsoft portals the user visits — it never sees an authenticated session, only the sign-in request on its way to Microsoft.
```

## Privacy practices

| Question | Answer |
| --- | --- |
| Does it collect personally identifiable information? | **No.** The account name is typed by the user and stored in `chrome.storage.local` on their own device. It is never transmitted to us or to anyone else |
| Health information | No |
| Financial and payment information | No |
| Authentication information | **No.** The extension never handles passwords, tokens or cookies. It adds a parameter to a request; the sign-in itself happens entirely between the browser and Microsoft |
| Personal communications, location, web history, user activity | No |
| Website content | No |
| Certification: not sold to third parties | Yes |
| Certification: not used for purposes unrelated to the single purpose | Yes |
| Certification: not used to determine creditworthiness | Yes |

**Worth stating in the listing rather than only here:** in direct sign-in mode the configured account name is written into the sign-in URL. That is what makes the mode work, and it means the address appears in browser history and in any proxy log on the path — the same address Microsoft's own sign-in logs already record. It is documented in `security-review.md` §5 and named in the extension's own UI.

**Privacy policy URL** — `https://junis.de/pages/datenschutz.html`

## Assets

| Asset | Requirement | State |
| --- | --- | --- |
| Store icon | 128×128 PNG | ✅ `src/icons/icon-128.png` |
| Screenshots | 1280×800 or 640×400, at least one, at most five | ✅ `assets/store/01-default.png`, `assets/store/02-listed.png` |
| Small promo tile | 440×280 PNG, optional | 🟡 optional, not planned |

The two shipped screenshots are captures of the real popup, composed onto a 1280×800 canvas with a **transparent** ground — the popup is opaque, so it reads as a card whether the store flattens onto white or onto grey (checked both). They show the default state and the *only the sites I list* mode with its account field. The account in them is a fictional person at the vendor's own domain, not a customer's.

Regenerate after a version bump: the version pill in the header is part of the image, so a screenshot taken from an older build advertises a version the store does not serve.

Screenshot suggestions, in the order that explains the product: the popup in its default state (picker, no exceptions) · the popup with two per-site exceptions configured · the account chooser that results. Use placeholder accounts only — `security-review.md` §Data protection and security rule 5 both apply to screenshots.

## Before submitting

- [ ] Verification matrix filled far enough that the listing does not claim unobserved behaviour (`verification-matrix.md` §2 — completeness is the Ring 2 gate, not the submission gate)
- [ ] Version decided and bumped; the artefact hash registered in `deployment.md` §3.1
- [ ] `minimum_chrome_version` (currently `120`) checked against the Edge version of the target fleet — carried as a LOW finding since the first review
- [ ] Summary text identical to `description` in `src/manifest.json`
