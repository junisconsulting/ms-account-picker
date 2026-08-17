// Service worker: rule sync, and nothing else (constraint A10).
//
// Reads the configuration from chrome.storage.local, hands it to the pure rule
// builder, and writes the result into the dynamic rule set. No fetch, no eval,
// no remote code, no telemetry, no message listeners from web pages — every one
// of those is a finding in the security review.

import { buildRules, RULE_ID } from "../lib/rules.js";

/** The configuration keys the options page writes. Read explicitly, so the shape is visible here. */
const STORAGE_KEYS = ["enabled", "mode", "upn"];

/**
 * Replaces the dynamic rule set with whatever the current configuration yields.
 *
 * Removing RULE_ID unconditionally is what makes this idempotent: an empty or
 * deactivated configuration ends with zero rules registered (A3). Remove and add
 * travel in ONE call — a separate remove followed by an add would leave a window
 * in which the old rule is gone and the new one is not there yet.
 */
async function syncRules() {
  const config = await chrome.storage.local.get(STORAGE_KEYS);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID],
    addRules: buildRules(config),
  });
}

// Covers first install and every extension update — an update may change the
// rule shape, so the old rule must not survive it.
chrome.runtime.onInstalled.addListener(syncRules);

// The options page is the only writer. Dynamic rules persist across browser
// restarts on their own, so there is deliberately no onStartup listener.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") syncRules();
});

// ponytail: no catch. An update that Chromium rejects (bad regex, bad rule
// shape) surfaces as an unhandled rejection in the service worker console,
// which is exactly where the load check looks. A wrapper would only reword it.
