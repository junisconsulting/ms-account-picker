// The whole configuration UI, rendered into a host element. Imported unchanged by
// both the popup and the options page, which is why neither of them contains any
// markup or logic of its own.
//
// SECURITY RULE FOR THIS FILE: the single innerHTML assignment below writes a
// static template with no interpolation of any kind. Every dynamic value — above
// all a stored domain, which is user-supplied text — reaches the DOM through
// textContent or a form property, never through concatenated markup.
//
// isValidUpn and isValidDomain are imported from the rule builder rather than
// reimplemented here. If this file had its own copy and the two drifted, the UI
// would accept a value the builder refuses, and the result is the worst failure
// mode this project has: a profile that reports "saved" and registers no rule.

import { isValidUpn, isValidDomain } from "../lib/rules.js";
import { VENDOR } from "./vendor.js";

const STORAGE_KEYS = ["enabled", "mode", "upn", "sites"];

const MODE_LABEL = {
  picker: "Account picker",
  hint: "Direct sign-in",
  off: "Leave alone",
};

const TEMPLATE = `
<header class="hdr">
  <img class="logo" src="../icons/icon-48.png" alt="">
  <div class="hdr-text">
    <h1>MS Account Picker</h1>
    <p class="sub">Choose the Microsoft account you sign in with, instead of being signed in automatically.</p>
  </div>
  <span class="ver" id="version"></span>
</header>

<section class="card">
  <label class="row">
    <input type="checkbox" id="enabled">
    <span class="grow">
      <strong>Active in this profile</strong>
      <small>Leave this off in your everyday profile. While it is off, nothing is changed.</small>
    </span>
  </label>
</section>

<section class="card" id="config">
  <h2>Default for every Microsoft sign-in</h2>
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
      <small>Go straight to the account below. No other account stays reachable.</small>
    </span>
  </label>

  <label class="fld" for="upn">Account to sign in with</label>
  <input type="email" id="upn" autocomplete="off" spellcheck="false"
         placeholder="you@contoso.onmicrosoft.com">
  <small class="hint">Used by direct sign-in. It is written into the sign-in URL, so it also
    appears in browser history and proxy logs.</small>

  <h2>Exceptions per site</h2>
  <small class="hint">Some sites you use with more than one account — those usually want the
    picker even when direct sign-in is the default. Enter the exact host you open,
    like <code>make.powerautomate.com</code>; a parent domain does not cover its
    subdomains.</small>
  <ul class="sites" id="site-list"></ul>
  <div class="addrow">
    <input type="text" id="site-domain" autocomplete="off" spellcheck="false"
           placeholder="make.powerautomate.com">
    <select id="site-mode">
      <option value="picker">Account picker</option>
      <option value="hint">Direct sign-in</option>
      <option value="off">Leave alone</option>
    </select>
    <button type="button" id="site-add">Add</button>
  </div>
</section>

<p class="status" id="status" role="status"></p>

<footer class="ftr">
  <span class="rules" id="rules-count"></span>
  <span>by <strong>junis</strong> · <a id="repo" target="_blank" rel="noopener">GitHub</a></span>
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
  const configCard = $("config");

  // Manifest is the single source of truth for the version.
  $("version").textContent = `v${chrome.runtime.getManifest().version}`;
  $("repo").href = VENDOR.repository;

  // The mark needs its light-ink variant on a dark ground. matchMedia rather than
  // a CSS-only swap, because the popup can be open while the OS theme flips.
  const darkMedia = window.matchMedia("(prefers-color-scheme: dark)");
  const applyScheme = () => host.querySelector(".logo").classList.toggle("dark", darkMedia.matches);
  darkMedia.addEventListener("change", applyScheme);
  applyScheme();

  /** The configuration as last read or edited. Persisted in one write, always whole. */
  let config = { enabled: false, mode: "picker", upn: "", sites: [] };

  const selectedMode = () => host.querySelector('input[name="mode"]:checked').value;

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

  /** One write, always the whole configuration — a partial set() would leave stale keys behind. */
  async function persist() {
    await chrome.storage.local.set(config);
    refreshRuleCount();
  }

  /** Says what the current configuration will actually do, including when that is "nothing". */
  function reportEffect() {
    if (!config.enabled) return report("Inactive in this profile.");
    if (config.mode === "hint" && !isValidUpn(config.upn)) {
      return report("Direct sign-in needs a valid account — no rule is active.", "warn");
    }
    const exceptions = config.sites.length;
    report(
      exceptions === 0
        ? `Saved. Default: ${MODE_LABEL[config.mode].toLowerCase()}.`
        : `Saved. Default: ${MODE_LABEL[config.mode].toLowerCase()}, ${exceptions} exception${exceptions === 1 ? "" : "s"}.`,
    );
  }

  function paintSites() {
    siteList.replaceChildren();
    config.sites.forEach((site, index) => {
      const row = rowTemplate.content.firstElementChild.cloneNode(true);
      // textContent, never markup: the domain is user-supplied text.
      row.querySelector(".dom").textContent = site.domain;
      const mode = row.querySelector(".mode");
      mode.value = site.mode;
      mode.addEventListener("change", async () => {
        config.sites[index].mode = mode.value;
        await persist();
        reportEffect();
      });
      row.querySelector(".rm").addEventListener("click", async () => {
        config.sites.splice(index, 1);
        paintSites();
        await persist();
        reportEffect();
      });
      siteList.append(row);
    });
  }

  function paint() {
    enabled.checked = config.enabled;
    host.querySelector(`input[name="mode"][value="${config.mode}"]`).checked = true;
    upn.value = config.upn;
    upn.classList.toggle("invalid", config.mode === "hint" && !isValidUpn(config.upn));
    configCard.classList.toggle("dim", !config.enabled);
    paintSites();
  }

  async function load() {
    const stored = await chrome.storage.local.get(STORAGE_KEYS);
    config = {
      enabled: stored.enabled === true,
      mode: stored.mode === "hint" ? "hint" : "picker",
      upn: typeof stored.upn === "string" ? stored.upn : "",
      sites: Array.isArray(stored.sites)
        ? stored.sites.filter((s) => isValidDomain(String(s?.domain ?? "").trim().toLowerCase()))
        : [],
    };
    paint();
    reportEffect();
    refreshRuleCount();
  }

  enabled.addEventListener("change", async () => {
    config.enabled = enabled.checked;
    paint();
    await persist();
    reportEffect();
  });

  for (const radio of host.querySelectorAll('input[name="mode"]')) {
    radio.addEventListener("change", async () => {
      config.mode = selectedMode();
      paint();
      await persist();
      reportEffect();
    });
  }

  // `change` on a text input fires on blur and on Enter, not per keystroke, so
  // the UPN is never validated half-typed.
  upn.addEventListener("change", async () => {
    config.upn = upn.value.trim();
    paint();
    await persist();
    reportEffect();
  });

  async function addSite() {
    const domain = siteDomain.value.trim().toLowerCase();
    if (!isValidDomain(domain)) {
      return report("Enter a plain domain, like make.powerautomate.com.", "err");
    }
    if (config.sites.some((site) => site.domain === domain)) {
      return report(`${domain} is already listed.`, "err");
    }
    config.sites.push({ domain, mode: siteMode.value });
    siteDomain.value = "";
    paintSites();
    await persist();
    reportEffect();
  }

  $("site-add").addEventListener("click", addSite);
  siteDomain.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addSite();
  });

  load();
}
