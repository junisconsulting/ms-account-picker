// Unit tests for the pure rule builder. These are the checks CLAUDE.md declares
// mandatory, plus the two trust boundaries (UPN and domain) and the structural
// invariants that turn the security-review checklist into executable assertions.
//
// What these tests CANNOT prove: that the rules behave correctly inside ESTS, or
// that Chromium accepts the generated patterns. That is tests/e2e/dnr.e2e.js and
// the verification matrix. Green here means the objects are right.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRules,
  isValidUpn,
  isValidDomain,
  siteRegexFilter,
  RULE_ID,
  SITE_ALLOW_ID_BASE,
  SITE_RULE_ID_BASE,
  AUTHORIZE_REGEX,
} from "../../src/lib/rules.js";

const PICKER = { enabled: true, mode: "picker" };
const HINT = { enabled: true, mode: "hint", upn: "admin@contoso.onmicrosoft.com" };
const SITE = "make.powerautomate.com";

const redirects = (rules) => rules.filter((r) => r.action.type === "redirect");
const paramsOf = (rule) => rule.action.redirect.transform.queryTransform.addOrReplaceParams;

// --- A3: nothing configured, nothing registered -----------------------------

test("no rule unless explicitly activated in this profile", () => {
  assert.deepEqual(buildRules(undefined), []);
  assert.deepEqual(buildRules({}), []);
  assert.deepEqual(buildRules({ mode: "picker" }), []);
  assert.deepEqual(buildRules({ enabled: false, mode: "picker" }), []);
  // Truthy but not true — must not arm the rule.
  assert.deepEqual(buildRules({ enabled: "yes", mode: "picker" }), []);
  // Configured sites must not arm anything either.
  assert.deepEqual(buildRules({ sites: [{ domain: SITE, mode: "hint" }] }), []);
  assert.deepEqual(
    buildRules({ enabled: false, mode: "picker", sites: [{ domain: SITE, mode: "off" }] }),
    [],
  );
});

// --- configuration -> rule object -------------------------------------------
// This exact-object test is also the migration proof: a configuration without a
// `sites` key must keep producing byte-identically what it produced before
// per-site rules existed. It must not be relaxed.

test("picker mode injects prompt=select_account and needs no UPN", () => {
  assert.deepEqual(buildRules(PICKER), [
    {
      id: RULE_ID,
      priority: 1,
      action: {
        type: "redirect",
        redirect: {
          transform: {
            queryTransform: {
              addOrReplaceParams: [{ key: "prompt", value: "select_account" }],
            },
          },
        },
      },
      condition: {
        regexFilter: AUTHORIZE_REGEX,
        resourceTypes: ["main_frame"],
      },
    },
  ]);
});

test("hint mode injects the configured UPN as login_hint", () => {
  const [rule] = buildRules(HINT);
  assert.deepEqual(paramsOf(rule), [{ key: "login_hint", value: HINT.upn }]);
});

test("picker is the default for an unknown or missing mode", () => {
  for (const mode of [undefined, "", "picker", "something-else"]) {
    const [rule] = buildRules({ enabled: true, mode, upn: HINT.upn });
    assert.equal(paramsOf(rule)[0].key, "prompt");
  }
});

test("a missing, empty or malformed sites key changes nothing", () => {
  for (const sites of [undefined, [], "nonsense", 42, {}, null]) {
    assert.deepEqual(buildRules({ ...PICKER, sites }), buildRules(PICKER));
  }
});

// --- A8: never both ---------------------------------------------------------

test("prompt and login_hint are never injected together", () => {
  const configs = [
    PICKER,
    HINT,
    { ...PICKER, sites: [{ domain: SITE, mode: "hint" }], upn: HINT.upn },
    { ...HINT, sites: [{ domain: SITE, mode: "picker" }] },
  ];
  for (const config of configs) {
    for (const rule of redirects(buildRules(config))) {
      assert.equal(paramsOf(rule).length, 1);
    }
  }
});

// --- A1: main_frame only, on every rule -------------------------------------

test("resourceTypes is exactly [main_frame] for every rule produced", () => {
  const configs = [
    PICKER,
    HINT,
    { ...HINT, sites: [{ domain: SITE, mode: "picker" }, { domain: "other.example", mode: "off" }] },
    { enabled: true, mode: "listed", upn: HINT.upn, sites: [{ domain: SITE, mode: "hint" }] },
  ];
  for (const config of configs) {
    const rules = buildRules(config);
    assert.ok(rules.length > 0);
    for (const rule of rules) {
      assert.deepEqual(rule.condition.resourceTypes, ["main_frame"]);
      assert.equal(rule.condition.excludedResourceTypes, undefined);
    }
  }
});

// --- A2: RE2 compatibility --------------------------------------------------

test("no generated regexFilter uses a construct RE2 lacks", () => {
  // RE2 has no lookaround, no backreferences, no atomic groups. The browser is
  // the real authority (chrome.declarativeNetRequest.isRegexSupported, checked
  // in the e2e run) — this catches the constructs that would be rejected there.
  const rules = buildRules({
    ...HINT,
    sites: [
      { domain: SITE, mode: "picker" },
      { domain: "other.example", mode: "off" },
      { domain: "a-b.sub.example.com", mode: "hint" },
    ],
  });
  assert.ok(rules.length > 0);
  for (const { condition } of rules) {
    for (const forbidden of ["(?=", "(?!", "(?<=", "(?<!", "(?>", "\\1"]) {
      assert.ok(
        !condition.regexFilter.includes(forbidden),
        `regexFilter must not contain ${forbidden}: ${condition.regexFilter}`,
      );
    }
    assert.doesNotThrow(() => new RegExp(condition.regexFilter));
    // Chromium compiles each pattern into at most 2 KB.
    assert.ok(condition.regexFilter.length < 2000);
  }
});

test("regexFilter matches the v1 and v2 authorize endpoints, and nothing else", () => {
  const re = new RegExp(AUTHORIZE_REGEX, "i");

  const shouldMatch = [
    "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?client_id=x",
    "https://login.microsoftonline.com/common/oauth2/authorize?client_id=x",
    "https://login.microsoftonline.com/00000000-0000-0000-0000-000000000000/oauth2/v2.0/authorize?a=b",
    "https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/authorize?a=b",
  ];
  const shouldNotMatch = [
    // Token and logout endpoints are not interactive requests.
    "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
    "https://login.microsoftonline.com/common/oauth2/logout?a=b",
    // Interior ESTS pages of a flow that is already running.
    "https://login.microsoftonline.com/common/kmsi",
    // WS-Federation knows no prompt — documented gap (A9), must not match.
    "https://login.microsoftonline.com/common/wsfed?wa=wsignin1.0",
    // Aliases are out of scope by decision (A7).
    "https://login.windows.net/common/oauth2/v2.0/authorize?a=b",
    // Anchored: no other host may reach the rule.
    "https://evil.example/https://login.microsoftonline.com/common/oauth2/authorize?a=b",
    // An authorize path without a query string cannot carry parameters.
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  ];

  for (const url of shouldMatch) assert.ok(re.test(url), `should match: ${url}`);
  for (const url of shouldNotMatch) assert.ok(!re.test(url), `should not match: ${url}`);
});

// --- the per-site condition -------------------------------------------------

test("siteRegexFilter recognises the portal wherever redirect_uri sits", () => {
  // The `i` flag mirrors DNR's default (isUrlFilterCaseSensitive: false).
  const re = new RegExp(siteRegexFilter(SITE), "i");
  const base = "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?";

  for (const query of [
    // first, middle and last parameter
    `redirect_uri=https%3A%2F%2F${SITE}%2Fauth&client_id=x`,
    `client_id=x&redirect_uri=https%3A%2F%2F${SITE}%2Fauth&scope=y`,
    `client_id=x&redirect_uri=https%3A%2F%2F${SITE}%2F`,
    // lowercase percent escapes
    `client_id=x&redirect_uri=https%3a%2f%2f${SITE}%2fauth`,
    // unencoded form
    `client_id=x&redirect_uri=https://${SITE}/auth`,
    // host followed directly by the parameter boundary
    `client_id=x&redirect_uri=https%3A%2F%2F${SITE}&scope=y`,
  ]) {
    assert.ok(re.test(base + query), `should match: ${query}`);
  }
});

test("siteRegexFilter does not match neighbouring hosts or other parameters", () => {
  const re = new RegExp(siteRegexFilter(SITE), "i");
  const base = "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?";

  for (const query of [
    // A different parameter that merely ends in redirect_uri.
    `client_id=x&post_logout_redirect_uri=https%3A%2F%2F${SITE}%2F`,
    // Host boundary: a suffix attack and a prefix attack.
    `client_id=x&redirect_uri=https%3A%2F%2F${SITE}.attacker.example%2F`,
    `client_id=x&redirect_uri=https%3A%2F%2Fnot${SITE}%2F`,
    // The dot must be escaped — this would match if it were not.
    "client_id=x&redirect_uri=https%3A%2F%2FmakeXpowerautomateXcom%2F",
    // A different portal entirely.
    "client_id=x&redirect_uri=https%3A%2F%2Fportal.azure.com%2F",
    // No redirect_uri at all.
    "client_id=x&scope=openid",
  ]) {
    assert.ok(!re.test(base + query), `should not match: ${query}`);
  }
});

test("the site condition works on the real shape of the target portals", () => {
  // Captured from live authorize requests on 2026-08-17 (matrix V5) and reduced
  // to placeholders: client ids, state, nonce and code_challenge carry nothing
  // this test needs. What is preserved is the STRUCTURE, and each of these three
  // shapes has caught something:
  //
  //   Azure          a percent-encoded https URL inside `scope`, BEFORE
  //                  redirect_uri — the false-positive trap
  //   Defender       the v1 endpoint and /common/, plus a `state` full of %3D.
  //                  A6 is not theoretical: a real portal in the target
  //                  environment still uses /oauth2/authorize
  //   Power Automate redirect_uri as a bare host plus one path segment
  const PORTALS = {
    "portal.azure.com":
      "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize" +
      "?client_id=00000000-0000-0000-0000-000000000000" +
      "&scope=https%3A%2F%2Fmanagement.core.windows.net%2F%2F.default%20openid%20profile" +
      "&redirect_uri=https%3A%2F%2Fportal.azure.com%2Fauth%2Flogin%2F" +
      "&response_mode=fragment&nonce=n&state=s&response_type=code&code_challenge_method=S256",
    "security.microsoft.com":
      "https://login.microsoftonline.com/common/oauth2/authorize" +
      "?client_id=00000000-0000-0000-0000-000000000000&response_type=code%20id_token" +
      "&scope=openid%20profile&state=OpenIdConnect.AuthenticationProperties%3DAbCdEf" +
      "&response_mode=form_post&nonce=n" +
      "&redirect_uri=https%3A%2F%2Fsecurity.microsoft.com%2F&x-client-SKU=ID_NET472",
    "make.powerautomate.com":
      "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize" +
      "?client_id=00000000-0000-0000-0000-000000000000&scope=openid%20profile%20offline_access" +
      "&redirect_uri=https%3A%2F%2Fmake.powerautomate.com%2Fauth" +
      "&response_mode=fragment&nonce=n&state=s&response_type=code",
  };

  const base = new RegExp(AUTHORIZE_REGEX, "i");
  for (const [domain, url] of Object.entries(PORTALS)) {
    assert.ok(base.test(url), `base rule must match ${domain}`);
  }

  // Each site pattern must hit its own portal and no other.
  for (const [domain, ownUrl] of Object.entries(PORTALS)) {
    const re = new RegExp(siteRegexFilter(domain), "i");
    assert.ok(re.test(ownUrl), `${domain} must match its own authorize URL`);
    for (const [other, otherUrl] of Object.entries(PORTALS)) {
      if (other === domain) continue;
      assert.ok(!re.test(otherUrl), `${domain} must not match ${other}`);
    }
  }

  // A host that appears in `scope` but not in redirect_uri must not match. This
  // is what the redirect_uri= anchor is for.
  assert.ok(
    !new RegExp(siteRegexFilter("management.core.windows.net"), "i").test(PORTALS["portal.azure.com"]),
    "a host inside scope must not be treated as the portal",
  );

  // Configuration is an exact host match, never a suffix: "azure.com" does not
  // stand in for "portal.azure.com". The UI says so, and this pins it down.
  assert.ok(
    !new RegExp(siteRegexFilter("azure.com"), "i").test(PORTALS["portal.azure.com"]),
    "a parent domain must not match a subdomain",
  );
});

// --- per-site rule sets -----------------------------------------------------

test("an 'off' site gets a guard and nothing else", () => {
  const rules = buildRules({ ...PICKER, sites: [{ domain: SITE, mode: "off" }] });
  assert.equal(rules.length, 2);

  const [base, guard] = rules;
  assert.equal(base.id, RULE_ID);
  assert.equal(guard.id, SITE_ALLOW_ID_BASE);
  assert.deepEqual(guard.action, { type: "allow" });
  assert.ok(guard.priority > base.priority, "the guard must outrank the base rule");
  assert.equal(guard.condition.regexFilter, siteRegexFilter(SITE));
});

test("a site with its own mode gets guard and injection sharing one condition", () => {
  const rules = buildRules({ ...PICKER, upn: HINT.upn, sites: [{ domain: SITE, mode: "hint" }] });
  assert.equal(rules.length, 3);

  const [base, guard, inject] = rules;
  assert.equal(guard.id, SITE_ALLOW_ID_BASE);
  assert.equal(inject.id, SITE_RULE_ID_BASE);

  // The whole design rests on these two carrying the SAME condition string: the
  // guard must keep matching after the injection has changed the URL.
  assert.equal(guard.condition.regexFilter, inject.condition.regexFilter);

  assert.ok(inject.priority > guard.priority, "injection must outrank its guard");
  assert.ok(guard.priority > base.priority, "the guard must outrank the base rule");
  assert.deepEqual(paramsOf(inject), [{ key: "login_hint", value: HINT.upn }]);
  assert.deepEqual(paramsOf(base), [{ key: "prompt", value: "select_account" }]);
});

test("a hint site with no usable UPN falls back to the global default entirely", () => {
  // Not "the portal loses its protection" — it must land on the base rule, so
  // neither the guard nor the injection may be emitted.
  const rules = buildRules({ ...PICKER, upn: "", sites: [{ domain: SITE, mode: "hint" }] });
  assert.equal(rules.length, 1);
  assert.equal(rules[0].id, RULE_ID);
});

test("with no base rule a site needs no guard", () => {
  // Global hint with an unusable UPN produces no base rule at all.
  const rules = buildRules({
    enabled: true,
    mode: "hint",
    upn: "not-a-upn",
    sites: [{ domain: SITE, mode: "picker" }],
  });
  assert.equal(rules.length, 1);
  assert.equal(rules[0].id, SITE_RULE_ID_BASE);
  assert.deepEqual(paramsOf(rules[0]), [{ key: "prompt", value: "select_account" }]);
});

test("hint mode produces no rule when the UPN is unusable", () => {
  for (const upn of [undefined, "", "   ", "not-a-upn", "admin@contoso.com&x=1"]) {
    assert.deepEqual(buildRules({ enabled: true, mode: "hint", upn }), []);
  }
});

test("an unknown site mode falls back to the picker", () => {
  // "listed" is a GLOBAL mode. Reaching this list as a site mode must not switch
  // that site off — it is narrowed to the picker like any other unknown value.
  for (const mode of [undefined, "", "PICKER", "nonsense", "listed"]) {
    const rules = buildRules({ ...PICKER, sites: [{ domain: SITE, mode }] });
    assert.equal(rules.length, 3, `mode ${String(mode)}`);
    assert.deepEqual(paramsOf(rules[2]), [{ key: "prompt", value: "select_account" }]);
  }
});

// --- the "listed" global mode -----------------------------------------------
//
// The inversion of the normal model: no global default, only the configured
// sites. Its failure direction is the opposite of every other mode's — a site
// that fails to match is left untouched instead of falling back to the picker —
// which is why the boundaries below are pinned rather than assumed.

test("listed mode with no sites registers nothing at all", () => {
  assert.deepEqual(buildRules({ enabled: true, mode: "listed" }), []);
  assert.deepEqual(buildRules({ enabled: true, mode: "listed", sites: [] }), []);
  assert.deepEqual(buildRules({ enabled: true, mode: "listed", upn: HINT.upn, sites: [] }), []);
});

test("listed mode emits the site injections and no base rule", () => {
  const rules = buildRules({
    enabled: true,
    mode: "listed",
    upn: HINT.upn,
    sites: [{ domain: SITE, mode: "picker" }, { domain: "other.example", mode: "hint" }],
  });

  // The id list carries it: no RULE_ID means no base rule, and with no base rule
  // there is nothing for a guard to hold off — so no allow rule either.
  assert.deepEqual(rules.map((rule) => rule.id), [SITE_RULE_ID_BASE, SITE_RULE_ID_BASE + 1]);
  assert.deepEqual(paramsOf(rules[0]), [{ key: "prompt", value: "select_account" }]);
  assert.deepEqual(paramsOf(rules[1]), [{ key: "login_hint", value: HINT.upn }]);
  assert.equal(rules[0].condition.regexFilter, siteRegexFilter(SITE));
});

test("listed mode leaves a site set to 'off' entirely alone", () => {
  // With no global default there is nothing for that site to be exempted from,
  // so it must produce no rule — not an allow rule that does nothing.
  assert.deepEqual(buildRules({ enabled: true, mode: "listed", sites: [{ domain: SITE, mode: "off" }] }), []);
});

test("listed mode drops a hint site with no usable UPN instead of falling back", () => {
  // The one place where the inverted failure direction bites: in picker mode this
  // site would land on the base rule. Here there is no base rule, so the result
  // is genuinely nothing — the UI has to say so, and reportEffect() does.
  const rules = buildRules({
    enabled: true,
    mode: "listed",
    upn: "",
    sites: [{ domain: SITE, mode: "hint" }, { domain: "other.example", mode: "picker" }],
  });
  assert.equal(rules.length, 1);
  assert.equal(rules[0].condition.regexFilter, siteRegexFilter("other.example"));
});

// --- one bad entry must never disarm the extension --------------------------

test("invalid domains are skipped while their valid siblings survive", () => {
  const rules = buildRules({
    ...PICKER,
    sites: [
      { domain: "a|b.com", mode: "off" }, // would make the pattern match everything
      { domain: "make.powerautomate.com/x", mode: "off" }, // path
      { domain: "https://x.com", mode: "off" }, // scheme
      { domain: "x.com:443", mode: "off" }, // port
      { domain: "a b.com", mode: "off" }, // whitespace
      { domain: "-x.com", mode: "off" }, // leading hyphen
      { domain: "x", mode: "off" }, // single label
      { domain: "", mode: "off" },
      { domain: undefined, mode: "off" },
      { domain: 42, mode: "off" },
      { domain: SITE, mode: "off" }, // the only good one
    ],
  });
  assert.equal(rules.length, 2);
  assert.equal(rules[0].id, RULE_ID);
  assert.equal(rules[1].condition.regexFilter, siteRegexFilter(SITE));
});

test("domains are normalised and deduplicated, first occurrence wins", () => {
  const rules = buildRules({
    ...PICKER,
    sites: [
      { domain: `  ${SITE.toUpperCase()}  `, mode: "off" },
      { domain: SITE, mode: "hint" }, // duplicate — must not add a second pair
    ],
  });
  assert.equal(rules.length, 2);
  assert.deepEqual(rules[1].action, { type: "allow" });
});

// --- structural guards: the security-review checklist, executable ------------

test("every rule is either an allow or a queryTransform redirect", () => {
  const sites = [
    { domain: SITE, mode: "picker" },
    { domain: "other.example", mode: "off" },
    { domain: "third.example.com", mode: "hint" },
  ];
  const rules = [
    ...buildRules({ ...HINT, sites }),
    ...buildRules({ enabled: true, mode: "listed", upn: HINT.upn, sites }),
  ];
  assert.ok(rules.length >= 6);

  for (const rule of rules) {
    if (rule.action.type === "allow") {
      assert.deepEqual(rule.action, { type: "allow" });
      continue;
    }
    assert.equal(rule.action.type, "redirect");
    // Never a redirect.url and never a regexSubstitution — either could move the
    // request to another origin, which is the token-theft path this repo exists
    // to keep closed.
    assert.equal(rule.action.redirect.url, undefined);
    assert.equal(rule.action.redirect.regexSubstitution, undefined);
    assert.ok(rule.action.redirect.transform.queryTransform);

    const params = paramsOf(rule);
    assert.equal(params.length, 1);
    assert.ok(["prompt", "login_hint"].includes(params[0].key), `unexpected param ${params[0].key}`);
  }
});

test("every generated pattern is anchored on the ESTS authorize endpoint", () => {
  // A site rule must never be able to match anything the base rule would not
  // match. Prefixing with AUTHORIZE_REGEX is what bounds the `.*` inside the
  // site condition to a single ESTS authorize URL.
  const rules = buildRules({
    ...HINT,
    sites: [{ domain: SITE, mode: "picker" }, { domain: "other.example", mode: "off" }],
  });
  for (const { condition } of rules) {
    assert.ok(
      condition.regexFilter.startsWith(AUTHORIZE_REGEX),
      `not anchored: ${condition.regexFilter}`,
    );
  }
});

test("rule ids are unique across a rich configuration", () => {
  const rules = buildRules({
    ...HINT,
    sites: [
      { domain: SITE, mode: "picker" },
      { domain: "other.example", mode: "off" },
      { domain: "third.example.com", mode: "hint" },
    ],
  });
  const ids = rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.join(",")}`);
});

// --- trust boundaries -------------------------------------------------------

test("isValidUpn rejects anything that could smuggle a query parameter", () => {
  assert.ok(isValidUpn("admin@contoso.onmicrosoft.com"));
  assert.ok(isValidUpn("adm-user_1@sub.contoso.com"));

  for (const bad of [
    "admin@contoso.com&redirect_uri=https://evil.example",
    "admin@contoso.com#fragment",
    "admin@contoso.com?x=1",
    "admin@contoso.com/../path",
    "admin@contoso.com%26x=1",
    "admin @contoso.com",
    "admin@contoso.com\nx",
    "admin@contoso", // no dot in the domain
    "contoso.com", // no local part
    "",
    undefined,
    null,
    42,
  ]) {
    assert.ok(!isValidUpn(bad), `must reject: ${String(bad)}`);
  }
});

test("isValidDomain rejects anything that could widen or break the pattern", () => {
  for (const good of [
    "make.powerautomate.com",
    "portal.azure.com",
    "a-b.sub.example.co.uk",
    "x1.y2.example",
  ]) {
    assert.ok(isValidDomain(good), `must accept: ${good}`);
  }

  for (const bad of [
    "a|b.com", // alternation — would match nearly every authorize URL
    "a.*.com", // quantifier
    "a(b).com", // group — invalid pattern, rejects the whole batch
    "a[b].com",
    "a\\.com",
    "example", // single label
    "-x.com", // leading hyphen
    "x-.com", // trailing hyphen
    ".x.com", // empty leading label
    "x..com",
    "x.com.", // trailing dot
    "X.COM", // uppercase — the builder lowercases first, this is the raw check
    "x .com",
    "https://x.com",
    "x.com/path",
    "x.com:443",
    "*.example.com",
    `${"a".repeat(250)}.example.com`, // over 253 characters
    "",
    undefined,
    null,
    42,
  ]) {
    assert.ok(!isValidDomain(bad), `must reject: ${String(bad)}`);
  }
});
