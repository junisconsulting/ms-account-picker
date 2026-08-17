// Options page behaviour: read and write chrome.storage.local. Nothing else —
// no rule building here (that lives in lib/rules.js), no direct DNR access
// (that is the service worker's job, triggered by storage.onChanged).
//
// isValidUpn is imported rather than reimplemented on purpose: the rule builder
// refuses to build a login_hint rule from a value it rejects, so a second,
// drifting copy of that check here would only produce silently inert profiles.

import { isValidUpn } from "../lib/rules.js";

const enabled = document.getElementById("enabled");
const upn = document.getElementById("upn");
const status = document.getElementById("status");

/** The mode currently selected in the radio group. */
const selectedMode = () => document.querySelector('input[name="mode"]:checked').value;

/** The UPN is meaningless in picker mode — grey it out instead of pretending it matters. */
function syncUpnField() {
  upn.disabled = selectedMode() !== "hint";
}

/** Fills the form from what is actually stored, so the page never lies about the current state. */
async function load() {
  const config = await chrome.storage.local.get(["enabled", "mode", "upn"]);
  enabled.checked = config.enabled === true;
  upn.value = config.upn ?? "";
  const mode = config.mode === "hint" ? "hint" : "picker";
  document.querySelector(`input[name="mode"][value="${mode}"]`).checked = true;
  syncUpnField();
}

function report(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

/**
 * Validates, then persists. Writing the configuration is all this does — the
 * service worker picks the change up via storage.onChanged and syncs the rule.
 *
 * The UPN check is a trust boundary, not a convenience: the value ends up
 * verbatim in the query string of a live authentication request.
 */
async function save() {
  const mode = selectedMode();
  const value = upn.value.trim();

  if (mode === "hint" && !isValidUpn(value)) {
    return report("Enter a plain user@domain UPN — it is written into the sign-in URL as typed.", true);
  }

  await chrome.storage.local.set({ enabled: enabled.checked, mode, upn: value });
  report(
    enabled.checked
      ? `Saved. This profile now uses ${mode === "hint" ? "direct sign-in" : "the account picker"}.`
      : "Saved. The extension is inactive in this profile and registers no rule.",
  );
}

for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener("change", syncUpnField);
}
document.getElementById("save").addEventListener("click", save);

load();
