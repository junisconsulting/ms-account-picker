// The whole configuration UI, rendered into a host element. The single shell that
// imports it is both the action popup and the options page, which is why it holds
// no markup and no logic of its own.
//
// SECURITY RULE FOR THIS FILE: the single innerHTML assignment below writes a
// static template with no interpolation of any kind. Every dynamic value — above
// all a stored domain, which is user-supplied text — reaches the DOM through
// textContent or a form property, never through concatenated markup.
//
// The GitHub mark in the footer is the official octicon `mark-github-16`, inlined
// as an SVG path. Copyright GitHub, Inc., MIT — see NOTICE. Inlined rather than
// linked because the CSP blocks every external origin, and it is the one asset in
// this UI that is not ours.
//
// The sign-out action is a plain <a href> to a fixed ESTS endpoint, deliberately
// not chrome.tabs.create: a link needs no API and no permission, and it keeps the
// URL inside the static template, where the no-interpolation rule already covers
// it. It exists because a site with a live session never asks again, so no rule of
// this extension can reach it (docs/architecture.md 5.1).
//
// isValidUpn and isValidDomain are imported from the rule builder rather than
// reimplemented here. If this file had its own copy and the two drifted, the UI
// would accept a value the builder refuses, and the result is the worst failure
// mode this project has: a profile that reports "saved" and registers no rule.

import { isValidUpn, isValidDomain } from "../lib/rules.js";
import { VENDOR } from "./vendor.js";

const STORAGE_KEYS = ["enabled", "mode", "upn", "sites"];

/** The two modes the status line names by label. "listed" reads as its own sentence. */
const MODE_LABEL = {
  picker: "Account picker",
  hint: "Direct sign-in",
};

// The header carries no subtitle on purpose: "When you sign in to Microsoft" says
// the same thing 40px below it, and the popup has 600px in total to spend.
const TEMPLATE = `
<header class="hdr">
  <img class="logo" src="../icons/icon-48.png" alt="">
  <div class="hdr-text">
    <h1>MS Account Picker</h1>
  </div>
  <span class="ver" id="version"></span>
</header>

<section class="card">
  <label class="row">
    <input type="checkbox" id="enabled">
    <span class="grow">
      <strong>Active in this profile</strong>
      <small>Leave this off in your everyday profile.</small>
    </span>
  </label>
</section>

<section class="card cfg" id="config">
  <h2>When you sign in to Microsoft</h2>
  <label class="row">
    <input type="radio" name="mode" value="picker">
    <span class="grow">
      <strong>Account picker</strong>
      <small>Always show the account chooser. Sends no identity.</small>
    </span>
  </label>
  <label class="row">
    <input type="radio" name="mode" value="hint">
    <span class="grow">
      <strong>Direct sign-in</strong>
      <small>Go straight to one account. No other account stays reachable.</small>
    </span>
  </label>

  <label class="row">
    <input type="radio" name="mode" value="listed">
    <span class="grow">
      <strong>Only the sites I list</strong>
      <small>Every other Microsoft sign-in is left alone.</small>
    </span>
  </label>

  <div class="acct" id="account">
    <label class="fld" for="upn">Account for direct sign-in</label>
    <input type="email" id="upn" autocomplete="off" spellcheck="false"
           placeholder="you@contoso.onmicrosoft.com">
    <small class="hint">In the sign-in URL, so also in history and proxy logs.</small>
  </div>
</section>

<details class="card cfg">
  <summary><span id="site-title"></span><span id="site-count"></span></summary>
  <small class="hint">A site you use with more than one account usually wants the picker,
    even where direct sign-in is set. Enter the exact host, like
    <code>make.powerautomate.com</code> — a parent domain does not cover its subdomains.</small>
  <ul class="sites" id="site-list"></ul>
  <div class="addrow">
    <input type="text" id="site-domain" autocomplete="off" spellcheck="false"
           placeholder="make.powerautomate.com">
    <div class="addrow-2">
      <select id="site-mode">
        <option value="picker">Account picker</option>
        <option value="hint">Direct sign-in</option>
        <option value="off">Leave alone</option>
      </select>
      <button type="button" id="site-add">Add</button>
    </div>
  </div>
</details>

<details class="card cfg">
  <summary>Already signed in to a site?</summary>
  <small class="hint">A site you are already signed in to does not ask again, so nothing above
    can apply to it. Signing out hands the next sign-in back to these settings. A few sites
    keep their own session until the browser is restarted.</small>
  <a class="btn secondary" id="signout"
     href="https://login.microsoftonline.com/common/oauth2/v2.0/logout"
     target="_blank" rel="noopener">Sign out of Microsoft</a>
</details>

<p class="status" id="status" role="status"></p>

<footer class="ftr">
  <span class="rules" id="rules-count"></span>
  <span class="by">
    <strong id="vendor"></strong>
    <a id="repo" class="gh" target="_blank" rel="noopener"
       title="Source code on GitHub" aria-label="Source code on GitHub">
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false"><path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656"/></svg>
    </a>
  </span>
</footer>

<template id="site-row">
  <li class="site">
    <span class="dom"></span>
    <select class="mode">
      <option value="picker">Account picker</option>
      <option value="hint">Direct sign-in</option>
      <option value="off">Leave alone</option>
    </select>
    <button type="button" class="rm" title="Remove">&times;</button>
  </li>
</template>
`;

/**
 * Renders the configuration UI into `host` and wires it to chrome.storage.local.
 *
 * There is no Save button on purpose. A popup closes on any click outside it, so
 * an explicit save would silently discard whatever was being edited. Checkbox
 * and radios commit immediately; the text fields commit on `change`, which fires
 * on blur and on Enter — exactly the wanted semantics, at no extra cost.
 */
export function renderConfigUi(host) {
  host.innerHTML = TEMPLATE;

  const $ = (id) => host.querySelector(`#${id}`);
  const enabled = $("enabled");
  const upn = $("upn");
  const siteList = $("site-list");
  const siteDomain = $("site-domain");
  const siteMode = $("site-mode");
  const statusEl = $("status");
  const rowTemplate = $("site-row");
  const account = $("account");
  const siteTitle = $("site-title");
  const siteCount = $("site-count");
  const configCards = host.querySelectorAll(".cfg");

  // Manifest is the single source of truth for the version.
  $("version").textContent = `v${chrome.runtime.getManifest().version}`;
  $("repo").href = VENDOR.repository;
  $("vendor").textContent = VENDOR.legalName;

  /** The configuration as last read or edited. Persisted in one write, always whole. */
  let config = { enabled: false, mode: "picker", upn: "", sites: [] };

  /** Is any single site set to direct sign-in? Decides both the warning and the field. */
  const siteUsesHint = () => config.sites.some((site) => site.mode === "hint");

  function report(message, kind = "") {
    statusEl.textContent = message;
    statusEl.className = `status ${kind}`.trim();
  }

  /**
   * Shows how many rules the browser actually registered.
   *
   * This is the one honest answer to this project's dominant failure mode: a rule
   * set Chromium rejected leaves zero rules and says nothing anywhere. The count
   * is read after a short delay because the write travels through
   * storage.onChanged into the service worker before the rules exist.
   */
  function refreshRuleCount() {
    setTimeout(async () => {
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      $("rules-count").textContent =
        rules.length === 1 ? "1 rule active" : `${rules.length} rules active`;
    }, 250);
  }

  /**
   * The end of every edit path: redraw, store, report — in that order, in one
   * place, so no path can quietly skip a step. A write without the redraw leaves
   * the surface claiming something storage no longer says.
   *
   * The write is always the whole configuration; a partial set() would leave
   * stale keys behind.
   */
  async function commit() {
    paint();
    await chrome.storage.local.set(config);
    refreshRuleCount();
    reportEffect();
  }

  /** Says what the current configuration will actually do, including when that is "nothing". */
  function reportEffect() {
    if (!config.enabled) return report("Inactive in this profile.");

    const count = config.sites.length;

    if (config.mode === "hint" && !isValidUpn(config.upn)) {
      return report("Needs a valid account — no rule is active.", "warn");
    }
    // A site set to direct sign-in is dropped exactly as silently when the UPN
    // is unusable. Under "only the sites I list" that can be the entire
    // configuration, which would otherwise report "saved" over nothing at all.
    if (siteUsesHint() && !isValidUpn(config.upn)) {
      return report("Sites set to direct sign-in need a valid account.", "warn");
    }

    // "Only the sites I list" is the one mode that can be fully armed and still
    // do nothing anywhere, so an empty list is a warning, not a saved state.
    if (config.mode === "listed") {
      if (count === 0) return report("No sites listed — nothing is changed.", "warn");
      return report(`Saved. Only the ${count} listed site${count === 1 ? " is" : "s are"} changed.`);
    }
    report(
      count === 0
        ? `Saved. Default: ${MODE_LABEL[config.mode].toLowerCase()}.`
        : `Saved. Default: ${MODE_LABEL[config.mode].toLowerCase()}, ${count} exception${count === 1 ? "" : "s"}.`,
    );
  }

  function paintSites() {
    // The count rides on the collapsed summary, so a configured exception is
    // visible without opening the section — otherwise collapsing it would hide
    // the fact that something is configured at all.
    siteCount.textContent = config.sites.length ? ` (${config.sites.length})` : "";
    siteList.replaceChildren();
    config.sites.forEach((site, index) => {
      const row = rowTemplate.content.firstElementChild.cloneNode(true);
      // textContent, never markup: the domain is user-supplied text.
      row.querySelector(".dom").textContent = site.domain;
      const mode = row.querySelector(".mode");
      mode.value = site.mode;
      mode.addEventListener("change", () => {
        config.sites[index].mode = mode.value;
        commit();
      });
      row.querySelector(".rm").addEventListener("click", () => {
        config.sites.splice(index, 1);
        commit();
      });
      siteList.append(row);
    });
  }

  function paint() {
    enabled.checked = config.enabled;
    host.querySelector(`input[name="mode"][value="${config.mode}"]`).checked = true;
    upn.value = config.upn;
    upn.classList.toggle("invalid", config.mode === "hint" && !isValidUpn(config.upn));
    // The account field exists wherever direct sign-in does — as the global mode
    // or on a single site. It stays hidden otherwise: the picker is the default,
    // so showing it unconditionally would greet every new user with a field they
    // are not meant to fill in, plus its proxy-log warning.
    account.hidden = config.mode !== "hint" && !siteUsesHint();
    // In "listed" mode this section is not a set of exceptions — it is the whole
    // configuration. A heading that still said "Exceptions" would send someone
    // looking for their own list under the wrong word.
    siteTitle.textContent =
      config.mode === "listed" ? "The sites I list" : "Exceptions for specific sites";
    for (const card of configCards) card.classList.toggle("dim", !config.enabled);
    paintSites();
  }

  async function load() {
    const stored = await chrome.storage.local.get(STORAGE_KEYS);
    config = {
      enabled: stored.enabled === true,
      // Picker for anything unrecognised — an old or corrupted value must land
      // on the mandatory baseline, never on the mode that changes nothing.
      mode: stored.mode === "hint" || stored.mode === "listed" ? stored.mode : "picker",
      upn: typeof stored.upn === "string" ? stored.upn : "",
      sites: Array.isArray(stored.sites)
        ? stored.sites.filter((s) => isValidDomain(String(s?.domain ?? "").trim().toLowerCase()))
        : [],
    };
    paint();
    reportEffect();
    refreshRuleCount();
  }

  enabled.addEventListener("change", () => {
    config.enabled = enabled.checked;
    commit();
  });

  // `change` fires on the radio that just became checked, never on the one that
  // lost the selection — so the event's own radio is the newly chosen mode.
  for (const radio of host.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener("change", () => {
      config.mode = radio.value;
      commit();
    });
  }

  // `change` on a text input fires on blur and on Enter, not per keystroke, so
  // the UPN is never validated half-typed.
  upn.addEventListener("change", () => {
    config.upn = upn.value.trim();
    commit();
  });

  function addSite() {
    const domain = siteDomain.value.trim().toLowerCase();
    if (!isValidDomain(domain)) {
      return report("Enter a plain domain, like make.powerautomate.com.", "err");
    }
    if (config.sites.some((site) => site.domain === domain)) {
      return report(`${domain} is already listed.`, "err");
    }
    config.sites.push({ domain, mode: siteMode.value });
    siteDomain.value = "";
    commit();
  }

  $("site-add").addEventListener("click", addSite);
  siteDomain.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addSite();
  });

  load();
}
