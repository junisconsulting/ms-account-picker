// Rule building: configuration in, declarativeNetRequest rule objects out.
//
// This module is deliberately PURE — no chrome.* calls, no storage access, no
// side effects. That is what makes it unit-testable without a browser, and it
// is the only place where the shape of a rule is decided.
//
// Constraints enforced here (see CLAUDE.md):
//   A1  resourceTypes is exactly ["main_frame"] — a rule matching sub_frame
//       breaks silent token renewal in every M365 portal
//   A2  regexFilter must be RE2-compatible — no lookaheads, no backreferences
//   A3  not explicitly activated in THIS profile -> no rule at all (empty
//       array), so the extension is inert in the workforce profile. The
//       activation flag, not the UPN, is the gate — picker mode is the default
//       and needs no UPN at all
//   A8  prompt and login_hint are mutually exclusive

// PHASE 1 PLACEHOLDER — no productive code yet.

/** Rule id of the single dynamic rule. Stable, so sync replaces instead of accumulating. */
export const RULE_ID = 1;

/**
 * Matches the ESTS authorize endpoint, v1 and v2, with a variable tenant segment.
 * Non-capturing group on purpose: queryTransform needs no capture (A2, A5, A6).
 * TODO Phase 2: decide whether login.windows.net / login.microsoft.com are
 * covered here or left out — see docs/open-questions.md F7.
 */
export const AUTHORIZE_REGEX =
  "^https://login\\.microsoftonline\\.com/[^/]+/oauth2/(?:v2\\.0/)?authorize\\?";

/**
 * Builds the dynamic rule set for a given configuration.
 *
 * @param {{ mode?: "picker"|"hint", upn?: string, enabled?: boolean }} config
 *        Configuration as persisted in chrome.storage.local.
 * @returns {Array<object>} Zero or one DNR rule. Empty means: extension inert.
 */
export function buildRules(config) {
  // TODO Phase 2: implement.
  //   1. return [] unless config.enabled is explicitly true (A3), and — in
  //      "hint" mode only — a UPN is present. Picker mode needs no UPN.
  //   2. mode "picker" (DEFAULT) -> addOrReplaceParams [{ key: "prompt", value: "select_account" }]
  //      mode "hint"   (opt-in)  -> addOrReplaceParams [{ key: "login_hint", value: config.upn }]
  //      never both (A8)
  //   3. action.type "redirect" with redirect.transform.queryTransform —
  //      never a redirect.url or regexSubstitution (security-review skill §2)
  //   4. condition: { regexFilter: AUTHORIZE_REGEX, resourceTypes: ["main_frame"] } (A1)
  // Verify with the dnr-rule-check skill before wiring this into the worker.
  void config;
  return [];
}
