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

/** Rule id of the single dynamic rule. Stable, so sync replaces instead of accumulating. */
export const RULE_ID = 1;

/**
 * Matches the ESTS authorize endpoint, v1 and v2, with a variable tenant segment.
 * Non-capturing group on purpose: queryTransform needs no capture (A2, A5, A6).
 *
 * Endpoint aliases (login.windows.net, login.microsoft.com) are out of scope by
 * decision — adding one is a host-permission review, not an edit here (A7).
 *
 * Matching is case-insensitive: DNR defaults `isUrlFilterCaseSensitive` to false,
 * and the manifest requires Chrome/Edge 120+, so that default is guaranteed.
 */
export const AUTHORIZE_REGEX =
  "^https://login\\.microsoftonline\\.com/[^/]+/oauth2/(?:v2\\.0/)?authorize\\?";

/**
 * Is this string safe to place into an authorize URL as a parameter value?
 *
 * This is a trust boundary, not cosmetics: the value is written verbatim into
 * the query string of a live authentication request. A UPN containing `&` or
 * `#` would smuggle additional parameters into that request — the one thing
 * this extension must never do. Anything that is not a plain user@domain is
 * rejected, deliberately stricter than RFC-legal email addresses.
 */
export function isValidUpn(upn) {
  return typeof upn === "string" && /^[^\s@&#?=/\\%]+@[^\s@&#?=/\\%]+\.[^\s@&#?=/\\%]+$/.test(upn);
}

/**
 * Builds the dynamic rule set for a given configuration.
 *
 * Returns an empty array for anything short of a complete, explicitly activated
 * configuration. Empty means the extension is inert — that is the normal, correct
 * state in the workforce profile and the reason force-install is safe (A3).
 *
 * @param {{ enabled?: boolean, mode?: "picker"|"hint", upn?: string }} config
 *        Configuration as persisted in chrome.storage.local.
 * @returns {Array<object>} Zero or one DNR rule.
 */
export function buildRules(config) {
  // The activation flag is the gate. Strict `=== true` so that a truthy leftover
  // from an older storage shape cannot arm the rule by accident.
  if (!config || config.enabled !== true) return [];

  // Picker is the default and the mandatory baseline; anything but an explicit
  // "hint" falls back to it (A8).
  const param =
    config.mode === "hint"
      ? { key: "login_hint", value: String(config.upn ?? "").trim() }
      : { key: "prompt", value: "select_account" };

  // Hint mode without a usable UPN would send `login_hint=` on every authorize
  // request. No rule is the safer outcome.
  if (param.key === "login_hint" && !isValidUpn(param.value)) return [];

  return [
    {
      id: RULE_ID,
      priority: 1,
      action: {
        // queryTransform only — never redirect.url or regexSubstitution, which
        // could move the request to another origin (security-review skill §2).
        type: "redirect",
        redirect: { transform: { queryTransform: { addOrReplaceParams: [param] } } },
      },
      condition: {
        regexFilter: AUTHORIZE_REGEX,
        resourceTypes: ["main_frame"],
      },
    },
  ];
  // ponytail: single rule, relying on Chromium skipping a redirect that would
  // produce an identical URL. That is unverified (matrix Z3). If it turns out to
  // loop, the fix is a second rule with action "allow" matching the already
  // transformed URL — RE2-compatible, no lookahead. Do not build it before Z3
  // has actually failed.
}
