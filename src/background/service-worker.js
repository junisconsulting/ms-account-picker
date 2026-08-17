// Service worker: rule sync, and nothing else (constraint A10).
//
// Reads the configuration from chrome.storage.local, hands it to the pure rule
// builder, and writes the result into the dynamic rule set. No fetch, no eval,
// no remote code, no telemetry, no message listeners from web pages — every one
// of those is a finding in the security review.

// PHASE 1 PLACEHOLDER — no productive code yet.

import { buildRules, RULE_ID } from "../lib/rules.js";

/**
 * Replaces the dynamic rule set with whatever the current configuration yields.
 * Removing RULE_ID unconditionally is what makes this idempotent: an empty
 * configuration ends with zero rules registered (A3).
 */
async function syncRules() {
  // TODO Phase 2: implement.
  //   const config = await chrome.storage.local.get(...);
  //   await chrome.declarativeNetRequest.updateDynamicRules({
  //     removeRuleIds: [RULE_ID],
  //     addRules: buildRules(config),
  //   });
  // Both arms in ONE call — a separate remove+add leaves a window in which the
  // old rule is gone and the new one is not there yet.
  void buildRules;
  void RULE_ID;
}

// TODO Phase 2: wire up
//   chrome.runtime.onInstalled  -> syncRules()  (also covers browser start)
//   chrome.storage.onChanged    -> syncRules()  (options page wrote a change)
// No other listeners.
void syncRules;
