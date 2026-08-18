// The one place vendor-facing strings live. Anything shown in the UI that is not
// configuration comes from here, so there is no second copy to drift.
//
// The version is deliberately NOT in this file — it is read from
// chrome.runtime.getManifest().version, which makes the manifest the single
// source of truth and removes the possibility of shipping a UI that claims a
// different version than the package.

export const VENDOR = {
  // The legal name, because that is what the footer shows — the same name that
  // signs NOTICE. "junis" alone is the brand, not the entity.
  legalName: "junis GmbH",
  name: "junis",
  website: "https://junis.de",
  repository: "https://github.com/junisconsulting/ms-account-picker",
};
