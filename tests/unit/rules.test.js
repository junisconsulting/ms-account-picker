// Unit tests for the pure rule builder. These are the four checks CLAUDE.md
// declares mandatory, plus the injection guard on the UPN.
//
// What these tests CANNOT prove: that the rule behaves correctly inside ESTS.
// That is the verification matrix. Green here means the object is right, not
// that the flow works.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRules, isValidUpn, RULE_ID, AUTHORIZE_REGEX } from "../../src/lib/rules.js";

const PICKER = { enabled: true, mode: "picker" };
const HINT = { enabled: true, mode: "hint", upn: "admin@contoso.onmicrosoft.com" };

// --- A3: nothing configured, nothing registered -----------------------------

test("no rule unless explicitly activated in this profile", () => {
  assert.deepEqual(buildRules(undefined), []);
  assert.deepEqual(buildRules({}), []);
  assert.deepEqual(buildRules({ mode: "picker" }), []);
  assert.deepEqual(buildRules({ enabled: false, mode: "picker" }), []);
  // Truthy but not true — must not arm the rule.
  assert.deepEqual(buildRules({ enabled: "yes", mode: "picker" }), []);
});

// --- configuration -> rule object -------------------------------------------

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
  assert.deepEqual(rule.action.redirect.transform.queryTransform.addOrReplaceParams, [
    { key: "login_hint", value: "admin@contoso.onmicrosoft.com" },
  ]);
});

test("picker is the default for an unknown or missing mode", () => {
  for (const mode of [undefined, "", "picker", "something-else"]) {
    const [rule] = buildRules({ enabled: true, mode, upn: HINT.upn });
    assert.equal(
      rule.action.redirect.transform.queryTransform.addOrReplaceParams[0].key,
      "prompt",
    );
  }
});

// --- A8: never both ---------------------------------------------------------

test("prompt and login_hint are never injected together", () => {
  for (const config of [PICKER, HINT]) {
    const [rule] = buildRules(config);
    const params = rule.action.redirect.transform.queryTransform.addOrReplaceParams;
    assert.equal(params.length, 1);
  }
});

// --- A1: main_frame only ----------------------------------------------------

test("resourceTypes is exactly [main_frame] for every rule produced", () => {
  for (const config of [PICKER, HINT]) {
    for (const rule of buildRules(config)) {
      assert.deepEqual(rule.condition.resourceTypes, ["main_frame"]);
      assert.equal(rule.condition.excludedResourceTypes, undefined);
    }
  }
});

// --- A2: RE2 compatibility --------------------------------------------------

test("regexFilter uses no construct RE2 lacks", () => {
  // RE2 has no lookaround, no backreferences, no atomic groups. The browser is
  // the real authority (chrome.declarativeNetRequest.isRegexSupported) — this
  // catches the constructs that would be rejected there.
  for (const forbidden of ["(?=", "(?!", "(?<=", "(?<!", "(?>", "\\1"]) {
    assert.ok(
      !AUTHORIZE_REGEX.includes(forbidden),
      `regexFilter must not contain ${forbidden}`,
    );
  }
  assert.doesNotThrow(() => new RegExp(AUTHORIZE_REGEX));
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

// --- trust boundary: the UPN goes into a live authorize URL -----------------

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

test("hint mode produces no rule when the UPN is unusable", () => {
  for (const upn of [undefined, "", "   ", "not-a-upn", "admin@contoso.com&x=1"]) {
    assert.deepEqual(buildRules({ enabled: true, mode: "hint", upn }), []);
  }
});
