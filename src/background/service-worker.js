// Service worker: rule sync, and nothing else (constraint A10).
//
// Reads the configuration from chrome.storage.local, hands it to the pure rule
// builder, and writes the result into the dynamic rule set. No fetch, no eval,
// no remote code, no telemetry, no message listeners from web pages — every one
// of those is a finding in the security review.

import { buildRules } from "../lib/rules.js";

/** The configuration keys the UI writes. Read explicitly, so the shape is visible here. */
const STORAGE_KEYS = ["enabled", "mode", "upn", "sites"];

/**
 * Replaces the dynamic rule set with whatever the current configuration yields.
 *
 * The rule count is variable (one base rule plus a pair per configured site), so
 * a fixed removal list no longer suffices. Removing the union of what is
 * currently registered and what is about to be added makes the call idempotent
 * and, more importantly, safe against two saves racing: without the union the
 * second call computes its removal list from a stale snapshot, tries to add an
 * id the first call already added, and Chromium rejects the WHOLE batch — which
 * would leave the profile with no rules at all and no error anywhere.
 *
 * Remove and add travel in ONE call. A separate remove followed by an add would
 * leave a window in which the old rules are gone and the new ones are not there.
 */
async function syncRules() {
  const config = await chrome.storage.local.get(STORAGE_KEYS);
  const addRules = buildRules(config);
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = [
    ...new Set([...existing.map((rule) => rule.id), ...addRules.map((rule) => rule.id)]),
  ];
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

// Covers first install and every extension update — an update may change the
// rule shape, so the old rule must not survive it.
chrome.runtime.onInstalled.addListener(syncRules);

// The configuration UI is the only writer. Dynamic rules persist across browser
// restarts on their own, so there is deliberately no onStartup listener.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") syncRules();
});

// ponytail: no catch. An update that Chromium rejects (bad regex, bad rule
// shape) surfaces as an unhandled rejection in the service worker console,
// which is exactly where the load check looks. A wrapper would only reword it.
