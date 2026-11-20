import assert from "node:assert/strict";

import { spawn, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";


async function until(check, message, timeout = 15000) {
  const deadline = Date.now() + timeout;
  do {
    try {
      const value = await check();
      if (value) return value;
    } catch {}
    await delay(80);
  } while (Date.now() < deadline);
  throw new Error(message);
}

async function tab(target, origin) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let ref = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const cdp = (method, params) => new Promise((resolve, reject) => {
    const id = ++ref;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error("Browser evaluation failed");
    return result.result.value;
  };
  const expect = (expression, message, timeout) => until(() => evaluate(expression), message, timeout);
  const navigate = path => cdp("Page.navigate", { url: origin + path });
  const button = label => "Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim()===" + JSON.stringify(label) + ")";
  const text = phrase => "document.body.innerText.includes(" + JSON.stringify(phrase) + ")";
  const press = label => evaluate(button(label) + ".click()");
  const resize = (width, height = 900) => cdp("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: width < 768,
  });
  const mobile = () => resize(390, 844);
  async function screenshot(name) {
    if (process.env.HC_UI_SCREENSHOTS !== "1") return;
    assert.match(name, /^[a-z0-9-]+$/);
    const dir = resolve("node_modules/.cache/hc-phase7-screenshots");
    await mkdir(dir, { recursive: true });
    const result = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(resolve(dir, name + ".png"), Buffer.from(result.data, "base64"));
  }
  async function sendMessage(message) {
    await expect("!!document.querySelector('#message')", "Message composer unavailable");
    await evaluate("(" + function (value) {
      const input = document.getElementById("message");
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.form.requestSubmit();
    } + ")(" + JSON.stringify(message) + ")");
  }
  async function signup(email, password, { role = "visitor", language = "en", name = "Browser test user" } = {}) {
    await navigate("/register");
    await expect("!!document.querySelector('#confirmation')", "Signup form unavailable");
    await evaluate("(" + function (email, password, role, language, name) {
      document.querySelector("#fullName").value = name;
      document.querySelector("#language").value = language;
      document.querySelector("#role").value = role;
      document.querySelector("#email").value = email;
      document.querySelector("#password").value = password;
      document.querySelector("#confirmation").value = password;
      document.querySelector("#confirmation").form.requestSubmit();
    } + ")(" + [email, password, role, language, name].map(value => JSON.stringify(value)).join(",") + ")");
    const ready = role === "volunteer"
      ? "location.pathname==='/' && " + text("Your volunteer application is pending review.")
      : "location.pathname==='/dashboard' && " + text("Start conversation");
    await expect(ready, "Synthetic signup failed");
  }
  return { cdp, evaluate, expect, navigate, text, button, press, mobile, resize, screenshot, signup, sendMessage, close: () => socket.close() };
}

export async function withBrowser(run) {
  const app = new URL(process.env.HC_BROWSER_APP_URL ?? "http://localhost:3000");
  assert.ok(app.protocol === "http:" && app.hostname === "localhost" && !!app.port &&
    app.pathname === "/" && !app.username && !app.password && !app.search && !app.hash,
    "Provide an HTTP localhost URL for the disposable application");
  const db = new URL(process.env.DB_URL ?? "postgresql://localhost");
  assert.ok(["postgres:", "postgresql:"].includes(db.protocol) &&
    ["localhost", "127.0.0.1"].includes(db.hostname) &&
    db.port === (process.env.HC_TEST_DB_PORT ?? "54322") && !db.search && !db.hash &&
    !!db.username && !!db.password, "Provide the disposable localhost DB_URL");
  await mkdir("node_modules/.cache", { recursive: true });
  const dir = await mkdtemp(resolve("node_modules/.cache/hc-browser-"));
  const chromePath = process.env.CHROME_PATH ??
    (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : "google-chrome");
  const browserEnvironment = { ...process.env };
  for (const key of ["DB_URL", "ANON_KEY", "SERVICE_ROLE_KEY"]) delete browserEnvironment[key];
  const chrome = spawn(chromePath, [
    "--headless", "--disable-background-networking", "--disable-gpu", "--no-first-run",
    "--remote-debugging-port=0", "--user-data-dir=" + dir, "about:blank",
  ], { windowsHide: true, stdio: "ignore", env: browserEnvironment });
  let browserStartFailed = false;
  chrome.once("error", () => { browserStartFailed = true; });
  const password = decodeURIComponent(db.password);
  db.password = "";
  function sql(queryOrArgs) {
    try {
      const args = typeof queryOrArgs === "string" ? ["-c", queryOrArgs] : queryOrArgs;
      return execFileSync("psql", ["-XwqAt", "-v", "ON_ERROR_STOP=1", "-d", db.href, ...args], {
        env: { ...process.env, PGPASSWORD: password, PGCONNECT_TIMEOUT: "5" },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 15000,
      }).trim();
    } catch {
      throw new Error("Local PostgreSQL fixture command failed");
    }
  }
  try {
    const debugPort = await until(async () => {
      if (browserStartFailed) return "failed";
      const state = await readFile(resolve(dir, "DevToolsActivePort"), "utf8");
      return state.split(/\r?\n/)[0];
    }, "Could not start Chrome");
    assert.match(debugPort, /^\d+$/, "Chrome is unavailable. Set CHROME_PATH to its executable.");
    const debug = "http://127.0.0.1:" + debugPort;
    const target = await until(async () => {
      const pages = await (await fetch(debug + "/json/list")).json();
      return pages.find(page => page.type === "page");
    }, "Could not start Chrome");
    const volunteerTarget = await (await fetch(debug + "/json/new?about:blank", { method: "PUT" })).json();
    const visitor = await tab(target, app.origin);
    const volunteer = await tab(volunteerTarget, "http://127.0.0.1:" + app.port);
    try {
      await run({ visitor, volunteer, sql });
    } finally {
      visitor.close();
      volunteer.close();
    }
  } finally {
    chrome.kill();
  }
}
