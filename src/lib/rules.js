// Rule building: configuration in, declarativeNetRequest rule objects out.
//
// This module is deliberately PURE — no chrome.* calls, no storage access, no
// side effects. That is what makes it unit-testable without a browser, and it
// is the only place where the shape of a rule is decided.
//
// Constraints enforced here (see CLAUDE.md):
//   A1  resourceTypes is exactly ["main_frame"] on EVERY rule — a rule matching
//       sub_frame breaks silent token renewal in every M365 portal
//   A2  regexFilter must be RE2-compatible — no lookaheads, no backreferences
//   A3  not explicitly activated in THIS profile -> no rule at all (empty
//       array), so the extension is inert in the workforce profile. The
//       activation flag, not the UPN, is the gate — picker mode is the default
//       and needs no UPN at all
//   A8  prompt and login_hint are mutually exclusive, per rule
//
// THE PRIORITY MODEL (docs/architecture.md §4.1)
//
//   p1  base    broad authorize regex        -> the global default parameter
//   p2  guard   per-site regex               -> action "allow"
//   p3  inject  the SAME per-site regex      -> that site's parameter
//
// In the "listed" global mode there is no p1, and then p2 is pointless as well:
// a guard exists only to hold the base rule off a site. That configuration
// therefore emits p3 rules alone — the extension touches the listed sites and
// nothing else.
//
// The guard is what keeps the base rule from also firing on a site that has its
// own mode. It is keyed on the SITE CONDITION, never on the injected parameter —
// that is the whole point. After the p3 rule fires, the URL changes but the p2
// condition still matches it exactly as before. So whether Chromium stops after
// a rule that yields no action, or falls through to the next matching rule, the
// next rule it can reach is the p2 allow — never the p1 base.
//
// Do NOT "simplify" this by having the site rule removeParams the base rule's
// parameter: that oscillates (base adds, site removes, base adds…) and ends in
// ERR_TOO_MANY_REDIRECTS.

/** Rule id of the global base rule. Stable, so sync replaces instead of accumulating. */
export const RULE_ID = 1;

/** Id ranges for the per-site rule pairs. Readable in a getDynamicRules() dump. */
export const SITE_ALLOW_ID_BASE = 1000;
export const SITE_RULE_ID_BASE = 2000;

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
 * Is this string safe to compile into a regexFilter as a hostname?
 *
 * The second trust boundary, and the more dangerous one. Two failure classes:
 *
 *   Invalid pattern -> Chromium rejects the ENTIRE rule batch, base rule
 *   included. The extension then registers nothing at all and fails silently
 *   open: the browser signs the user in with whatever account it already knows,
 *   and nothing says why. One bad character in a text field reaches this.
 *
 *   Over-wide pattern -> an unescaped `.` matches any character, a `|` matches
 *   practically every authorize URL. For a hint site that means the configured
 *   UPN lands in authorize requests of unrelated portals.
 *
 * Deliberately stricter than DNS: lowercase LDH labels, at least two of them,
 * no scheme, no port, no path, no wildcard.
 */
export function isValidDomain(domain) {
  return (
    typeof domain === "string" &&
    domain.length <= 253 &&
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)
  );
}

/**
 * Escapes RE2 metacharacters. The allow-list in isValidDomain already leaves
 * only `.` and `-`, so this is the second layer, not the first.
 * `-` is deliberately not escaped: outside a character class `\-` is an
 * unnecessary escape, and validation already guarantees it is literal.
 */
function escapeForRe2(text) {
  return text.replace(/[.^$|()[\]{}*+?\\]/g, "\\$&");
}

/**
 * Builds the condition that recognises one portal.
 *
 * The portal's own hostname is not part of the authorize request's host — it
 * appears percent-encoded inside the redirect_uri parameter. Matching there is
 * the only mechanism available: condition.initiatorDomains is unusable, because
 * a navigation from a typed URL, a bookmark or an HTTP redirect carries no
 * initiator at all (docs/architecture.md).
 *
 * Piece by piece, because a reviewer has to be able to check each one:
 *   AUTHORIZE_REGEX     reused verbatim — a site rule must never match anything
 *                       the base rule would not match
 *   (?:.*&)?            AUTHORIZE_REGEX already consumed the `?`. Writing
 *                       `.*[?&]redirect_uri=` instead silently fails when
 *                       redirect_uri happens to be the first parameter
 *   the &-boundary      keeps post_logout_redirect_uri= from matching
 *   https(?:%3A|:)…     tolerates the encoded and the raw form
 *   trailing class      host boundary; without it contoso.com also matches
 *                       contoso.com.attacker.example
 */
export function siteRegexFilter(domain) {
  return (
    AUTHORIZE_REGEX +
    "(?:.*&)?redirect_uri=https(?:%3A|:)(?:%2F%2F|//)" +
    escapeForRe2(domain) +
    "(?:%|/|:|\\?|&|$)"
  );
}

/**
 * The one parameter a given mode injects, or null when it injects none.
 *
 * Two different reasons for null, and the difference matters to a reviewer:
 *
 *   "listed"  the global mode that deliberately has NO default. Only the
 *             configured sites get a rule; every other authorize request is
 *             left exactly as the portal built it. Chosen, not a failure.
 *
 *   "hint" with an unusable UPN — a failure. Sending `login_hint=` with no
 *             value on every authorize request would be worse than doing
 *             nothing, so nothing is what happens.
 *
 * Site modes never reach the "listed" branch: buildRules narrows an entry's
 * mode to picker/hint/off before calling this.
 */
function paramFor(mode, upn) {
  if (mode === "listed") return null;
  if (mode !== "hint") return { key: "prompt", value: "select_account" };
  const value = String(upn ?? "").trim();
  return isValidUpn(value) ? { key: "login_hint", value } : null;
}

/** queryTransform only — never redirect.url or regexSubstitution, which could move the request to another origin. */
function redirectAction(param) {
  return {
    type: "redirect",
    redirect: { transform: { queryTransform: { addOrReplaceParams: [param] } } },
  };
}

const condition = (regexFilter) => ({ regexFilter, resourceTypes: ["main_frame"] });

/**
 * Builds the dynamic rule set for a given configuration.
 *
 * Returns an empty array for anything short of an explicitly activated
 * configuration. Empty means the extension is inert — that is the normal,
 * correct state in the workforce profile and the reason force-install is safe.
 *
 * A configuration without a `sites` key produces exactly the rule this function
 * produced before per-site rules existed, with the same id and priority. That
 * is the migration guarantee: there is no migration code that could get it wrong.
 *
 * @param {{ enabled?: boolean, mode?: "picker"|"hint"|"listed", upn?: string,
 *           sites?: Array<{domain: string, mode: "picker"|"hint"|"off"}> }} config
 * @returns {Array<object>} Zero or more DNR rules.
 */
export function buildRules(config) {
  // The activation flag is the gate. Strict `=== true` so that a truthy leftover
  // from an older storage shape cannot arm the rule by accident.
  if (!config || config.enabled !== true) return [];

  const rules = [];

  // Picker is the mandatory baseline (A8): anything that is neither an explicit
  // "hint" nor the explicit "listed" mode falls back to it.
  const baseParam = paramFor(config.mode, config.upn);
  if (baseParam) {
    rules.push({
      id: RULE_ID,
      priority: 1,
      action: redirectAction(baseParam),
      condition: condition(AUTHORIZE_REGEX),
    });
  }
  const hasBase = rules.length > 0;

  const seen = new Set();
  let index = 0;

  for (const entry of Array.isArray(config.sites) ? config.sites : []) {
    const domain = String(entry?.domain ?? "").trim().toLowerCase();
    // One bad entry must never disarm the whole extension — skip it, keep going.
    if (!isValidDomain(domain) || seen.has(domain)) continue;
    seen.add(domain);

    const mode = entry?.mode === "hint" || entry?.mode === "off" ? entry.mode : "picker";
    const param = mode === "off" ? null : paramFor(mode, config.upn);

    // A site that asks for a hint while the UPN is unusable falls back to the
    // global default. Emitting only its guard would leave that portal with no
    // intervention at all, which is the outcome this extension exists to prevent.
    if (mode !== "off" && !param) continue;

    const regexFilter = siteRegexFilter(domain);

    // The guard exists only to keep the base rule off this site. With no base
    // rule there is nothing to suppress.
    if (hasBase) {
      rules.push({
        id: SITE_ALLOW_ID_BASE + index,
        priority: 2,
        action: { type: "allow" },
        condition: condition(regexFilter),
      });
    }
    if (param) {
      rules.push({
        id: SITE_RULE_ID_BASE + index,
        priority: 3,
        action: redirectAction(param),
        condition: condition(regexFilter),
      });
    }
    index++;
  }

  return rules;
}
