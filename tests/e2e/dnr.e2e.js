// End-to-end check of the loaded extension against a LOCAL fake authorize
// endpoint. No credentials, no contact with Microsoft (open-questions.md F6).
//
// The trick that makes this honest: `--host-resolver-rules` points the real
// hostname `login.microsoftonline.com` at a local HTTPS server. DNR matches on
// the URL, not on DNS, so the rule under test is the production rule — nothing
// is stubbed inside the extension.
//
// What this proves (matrix Z3, V4): Chromium accepts the regexFilter, the rule
// fires on a main_frame navigation, the transform adds exactly the expected
// parameter, and a request that already carries it is NOT redirected again.
// What it cannot prove: anything about real ESTS, the PRT, or the device claim.
//
// Run: node tests/e2e/dnr.e2e.js     (needs a Chrome binary and openssl)

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:https";
import { readFileSync, mkdtempSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../../src");
const PORT = 8443;
const UPN = "admin@contoso.onmicrosoft.com";

// Every request the fake ESTS sees, in order. This list IS the loop detector:
// one navigation must produce exactly two entries, never more.
const seen = [];

/** Locates a Chrome binary — env override first, then the puppeteer cache. */
function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const base = join(process.env.HOME, ".cache/puppeteer/chrome");
  if (!existsSync(base)) throw new Error("no Chrome found; set CHROME_BIN");
  for (const dir of readdirSync(base)) {
    const bin = join(base, dir, "chrome-linux64", "chrome");
    if (existsSync(bin)) return bin;
  }
  throw new Error("no Chrome found; set CHROME_BIN");
}

/** Throwaway TLS material. Generated per run — a test key must never be committed. */
function makeCert(dir) {
  const key = join(dir, "key.pem");
  const cert = join(dir, "cert.pem");
  const r = spawnSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-keyout", key, "-out", cert, "-subj", "/CN=login.microsoftonline.com",
  ], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`openssl failed: ${r.stderr}`);
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minimal Chrome DevTools Protocol client over Node's built-in WebSocket. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
      }
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", rej, { once: true });
    });
    const cdp = new Cdp(ws);
    // A service worker attached this early sits paused at the debugger, and in
    // that state the `chrome` global is not bound yet — evaluating anything
    // fails with "chrome is not defined". Release it, then wait for the
    // extension APIs to appear.
    await cdp.send("Runtime.enable");
    await cdp.send("Runtime.runIfWaitingForDebugger");
    for (let i = 0; i < 50; i++) {
      if ((await cdp.evaluate("typeof chrome")) === "object") return cdp;
      await sleep(100);
    }
    throw new Error("service worker never bound the chrome APIs");
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  /** Evaluates an expression in the service worker and returns its resolved value. */
  async evaluate(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
}

/**
 * Polls the DevTools target list until OUR service worker shows up.
 *
 * Filtering on "any chrome-extension:// service worker" is wrong: Chrome ships
 * component extensions of its own (Hangout Services and friends) that
 * `--disable-extensions-except` does not switch off, and one of them wins the
 * race. Match on our own path instead; the caller verifies the manifest name.
 */
async function serviceWorkerTarget(devtoolsPort) {
  for (let i = 0; i < 100; i++) {
    const targets = await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`).then((r) => r.json());
    const sw = targets.find(
      (t) => t.type === "service_worker" && t.url.endsWith("/background/service-worker.js"),
    );
    if (sw) return sw;
    await sleep(100);
  }
  throw new Error("service worker never appeared — did the extension fail to load?");
}

/** Opens a tab, waits for the navigation to settle, then closes it again. */
async function navigate(devtoolsPort, url) {
  const before = seen.length;
  const tab = await fetch(
    `http://127.0.0.1:${devtoolsPort}/json/new?${encodeURIComponent(url)}`,
    { method: "PUT" },
  ).then((r) => r.json());
  // Settle: stop once no new request arrived for 500 ms, cap at ~5 s.
  let last = seen.length;
  for (let i = 0; i < 10; i++) {
    await sleep(500);
    if (seen.length === last && seen.length > before) break;
    last = seen.length;
  }
  await fetch(`http://127.0.0.1:${devtoolsPort}/json/close/${tab.id}`);
  return seen.slice(before);
}

// --- run --------------------------------------------------------------------

const workdir = mkdtempSync(join(tmpdir(), "msap-e2e-"));
const { key, cert } = makeCert(workdir);

const server = createServer({ key, cert }, (req, res) => {
  seen.push(req.url);
  // The fake "portal": a cross-origin 302 into the authorize endpoint. This is
  // what V4 asks about — does the rule still fire when another origin started
  // the navigation, without host permissions for that origin?
  if (req.url.startsWith("/portal")) {
    res.writeHead(302, {
      location: "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?client_id=test",
    });
    return res.end();
  }
  // The silent-renewal shape: an authorize request inside a hidden iframe. This
  // is what constraint A1 protects — the rule must not touch it, or token
  // renewal breaks in every M365 portal.
  if (req.url.startsWith("/iframe")) {
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(
      `<html><body><iframe src="https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?client_id=test&prompt=none"></iframe></body></html>`,
    );
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<html><body>ok</body></html>`);
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const chrome = spawn(findChrome(), [
  "--headless=new",
  "--no-sandbox",              // test host runs unprivileged containers
  "--disable-gpu",
  `--user-data-dir=${workdir}/profile`,
  `--load-extension=${SRC}`,
  `--disable-extensions-except=${SRC}`,
  // Both hostnames resolve to the fake ESTS. The extension has host permissions
  // for the first one only — that asymmetry is the point of the V4 check.
  `--host-resolver-rules=MAP login.microsoftonline.com 127.0.0.1:${PORT},MAP portal.test 127.0.0.1:${PORT}`,
  "--ignore-certificate-errors",
  "--remote-debugging-port=0",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

let failures = 0;
// Async-aware on purpose: a non-awaited assertion inside a check would report
// green while never having run.
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL ${name}\n       ${e.message.split("\n")[0]}`);
  }
};

try {
  // Chrome writes the chosen debugging port here once it is ready.
  let devtoolsPort;
  for (let i = 0; i < 100; i++) {
    const f = join(workdir, "profile", "DevToolsActivePort");
    if (existsSync(f)) {
      devtoolsPort = readFileSync(f, "utf8").split("\n")[0].trim();
      break;
    }
    await sleep(100);
  }
  if (!devtoolsPort) throw new Error("Chrome never opened a DevTools port");

  const sw = await serviceWorkerTarget(devtoolsPort);
  const cdp = await Cdp.connect(sw.webSocketDebuggerUrl);
  const rules = () => cdp.evaluate("chrome.declarativeNetRequest.getDynamicRules()");

  const name = await cdp.evaluate("chrome.runtime.getManifest().name");
  assert.equal(name, "MS Account Picker", `attached to the wrong extension: ${name}`);

  console.log("A3 — inert until activated");
  await check("no dynamic rule in a fresh profile", async () => {
    assert.deepEqual(await rules(), []);
  });

  console.log("\nRule registration");
  await cdp.evaluate("chrome.storage.local.set({ enabled: true, mode: 'picker' })");
  await sleep(300);
  const registered = await rules();
  await check("Chromium accepts the rule (regexFilter is valid RE2)", () => {
    assert.equal(registered.length, 1);
  });
  await check("resourceTypes is exactly [main_frame]", () => {
    assert.deepEqual(registered[0].condition.resourceTypes, ["main_frame"]);
  });

  // DNR redirects BEFORE the request leaves the browser, so the fake ESTS never
  // sees the untransformed URL. Exactly one authorize request per navigation is
  // therefore the correct expectation — and the loop detector: a redirect loop
  // would produce a long run of them, ending in ERR_TOO_MANY_REDIRECTS.
  const authorizeOnly = (list) => list.filter((u) => u.includes("/authorize"));

  console.log("\nZ3 — transform fires, and fires only once");
  const picker = authorizeOnly(
    await navigate(devtoolsPort, "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?client_id=test"),
  );
  await check("exactly one authorize request reaches the endpoint (no loop)", () => {
    assert.equal(picker.length, 1, `saw ${picker.length}: ${picker.join(" | ")}`);
  });
  await check("it carries prompt=select_account", () => {
    assert.match(picker[0] ?? "", /[?&]prompt=select_account(&|$)/);
  });
  await check("the portal's own parameters survive untouched", () => {
    assert.match(picker[0] ?? "", /[?&]client_id=test(&|$)/);
  });

  console.log("\nZ3 — a request that already carries the parameter is left alone");
  const preset = authorizeOnly(
    await navigate(devtoolsPort, "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?client_id=test&prompt=select_account"),
  );
  await check("still exactly one request — the identical-URL redirect is skipped", () => {
    assert.equal(preset.length, 1, `saw ${preset.length}: ${preset.join(" | ")}`);
  });

  console.log("\nHint mode, v1 endpoint");
  await cdp.evaluate(`chrome.storage.local.set({ enabled: true, mode: 'hint', upn: '${UPN}' })`);
  await sleep(300);
  const hint = authorizeOnly(
    await navigate(devtoolsPort, "https://login.microsoftonline.com/common/oauth2/authorize?client_id=test"),
  );
  await check("v1 endpoint is covered and login_hint is injected", () => {
    assert.equal(hint.length, 1, `saw ${hint.length}: ${hint.join(" | ")}`);
    assert.ok(
      hint[0].includes(`login_hint=${encodeURIComponent(UPN)}`) || hint[0].includes(`login_hint=${UPN}`),
      `unexpected: ${hint[0]}`,
    );
  });

  console.log("\nV4 — cross-origin navigation into the authorize endpoint");
  await cdp.evaluate("chrome.storage.local.set({ enabled: true, mode: 'picker' })");
  await sleep(300);
  const crossOrigin = authorizeOnly(await navigate(devtoolsPort, "https://portal.test/portal"));
  await check("rule fires although the initiator origin has no host permission", () => {
    assert.ok(
      crossOrigin.some((u) => /[?&]prompt=select_account(&|$)/.test(u)),
      `no transformed request: ${crossOrigin.join(" | ")}`,
    );
  });

  console.log("\nA1 — a sub_frame authorize request must NOT be touched");
  const beforeFrame = seen.length;
  await navigate(devtoolsPort, "https://portal.test/iframe");
  const framed = authorizeOnly(seen.slice(beforeFrame));
  await check("silent-renewal shape (iframe, prompt=none) passes through unchanged", () => {
    assert.equal(framed.length, 1, `saw ${framed.length}: ${framed.join(" | ")}`);
    assert.match(framed[0], /[?&]prompt=none(&|$)/);
    assert.doesNotMatch(framed[0], /select_account/);
  });

  console.log("\nA3 — deactivating removes the rule again");
  await cdp.evaluate("chrome.storage.local.clear()");
  await sleep(300);
  await check("getDynamicRules() is empty again", async () => {
    assert.deepEqual(await rules(), []);
  });
} finally {
  chrome.kill();
  server.close();
}

console.log(failures === 0 ? "\ne2e: green" : `\ne2e: ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
