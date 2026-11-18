import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { withBrowser } from "./browser-fixtures.mjs";

test("public and visitor layouts, keyboard focus, and authentication in Chrome", { timeout: 120000 }, () =>
  withBrowser(async ({ visitor, sql }) => {
    const email = `hc-layout-${randomUUID()}@example.com`;
    const password = `Hc9!${randomUUID()}`;
    const fit = "document.documentElement.scrollWidth <= window.innerWidth";
    const key = async (name, code, number) => {
      const input = { key: name, code, windowsVirtualKeyCode: number };
      await visitor.cdp("Input.dispatchKeyEvent", { type: "keyDown", ...input });
      await visitor.cdp("Input.dispatchKeyEvent", { type: "keyUp", ...input });
    };
    const setLanguage = value => visitor.evaluate(
      "document.querySelector('[name=siteLanguage][value=" + JSON.stringify(value) + "]').form.requestSubmit()",
    );
    try {
      await visitor.cdp("Page.bringToFront");
      await visitor.resize(1440, 960);
      await visitor.cdp("Emulation.setEmulatedMedia", { features: [
        { name: "prefers-color-scheme", value: "dark" },
        { name: "prefers-reduced-motion", value: "reduce" },
      ] });
      await visitor.navigate("/");
      await visitor.expect("document.readyState==='complete' && !!document.querySelector('.arch-art')", "Landing unavailable");
      await visitor.expect(`document.title==='Purpose of Life' && !!document.querySelector('main a[href="/register"]') && !!document.querySelector('main a[href="/login"]')`,
        "Guest branding or account actions missing");
      assert.ok(await visitor.evaluate("getComputedStyle(document.body).backgroundColor==='rgb(247, 244, 235)'"),
        "The ivory theme failed under the system dark preference");
      assert.ok(await visitor.evaluate("parseFloat(getComputedStyle(document.querySelector('main .button')).transitionDuration)<0.001"),
        "Reduced motion did not suppress button transitions");
      await visitor.screenshot("landing-desktop");
      await key("Tab", "Tab", 9);
      await visitor.expect("document.activeElement.classList.contains('skip-link') && getComputedStyle(document.activeElement).clipPath==='none'",
        "Skip link was not visible on first keyboard focus");
      assert.ok(await visitor.evaluate("getComputedStyle(document.activeElement).outlineStyle!=='none'"), "Keyboard focus outline missing");
      await key("Enter", "Enter", 13);
      await visitor.expect("document.activeElement.id==='main-content'", "Skip link did not move focus");
      for (const width of [320, 390, 768, 1440]) {
        await visitor.resize(width);
        assert.ok(await visitor.evaluate(fit), `Landing overflow at ${width}px`);
      }
      await visitor.resize(320, 840);
      await setLanguage("ur");
      await visitor.expect("document.documentElement.lang==='ur' && document.documentElement.dir==='rtl'", "Public Urdu did not switch direction");
      assert.ok(await visitor.evaluate(fit), "Urdu landing overflow at 320px");
      await visitor.evaluate("window.scrollTo(0,0)");
      await visitor.screenshot("landing-urdu-mobile");
      await visitor.navigate("/register");
      await visitor.expect("document.documentElement.dir==='rtl' && document.querySelector('main label[for=email]')?.innerText.includes('\u0627\u06cc \u0645\u06cc\u0644')",
        "Urdu registration label or direction missing");
      assert.ok(await visitor.evaluate(fit), "Urdu registration overflow at 320px");
      await setLanguage("en");
      await visitor.expect("document.documentElement.dir==='ltr'", "English direction was not restored");
      await visitor.screenshot("registration-mobile");
      await visitor.signup(email, password);
      await visitor.expect(visitor.text("Welcome to Purpose of Life"), "Visitor dashboard heading missing");
      assert.ok(await visitor.evaluate(fit), "Visitor dashboard overflow at 320px");
      await visitor.resize(1440, 960);
      assert.ok(await visitor.evaluate(fit), "Visitor dashboard overflow on desktop");
      await visitor.screenshot("visitor-desktop");
      await visitor.press("Sign out");
      await visitor.expect("location.pathname==='/login' && !!document.querySelector('#email')", "Sign-out did not return to login");
      await visitor.screenshot("login-desktop");
      const login = value => visitor.evaluate("(" + function (email, password) {
        const input = document.querySelector("#email");
        input.value = email;
        document.querySelector("#password").value = password;
        input.form.requestSubmit();
      } + ")(" + JSON.stringify(email) + "," + JSON.stringify(value) + ")");
      await login(password + "wrong");
      await visitor.expect(visitor.text("Check your email and password"), "Invalid sign-in feedback missing");
      await login(password);
      await visitor.expect("location.pathname==='/dashboard' && /VIS-[0-9A-F]{12}/.test(document.body.innerText)",
        "Valid login did not restore the dashboard");
      await visitor.navigate("/");
      await visitor.expect(`!!document.querySelector('main a[href="/dashboard"]') && !document.querySelector('a[href="/register"], a[href="/login"]')`,
        "Signed-in landing should show the dashboard link and hide guest actions");
      for (const path of ["/login", "/register"]) {
        assert.equal(await visitor.evaluate(`fetch(${JSON.stringify(path)}).then(response => new URL(response.url).pathname)`), "/dashboard",
          `Signed-in visit to ${path} did not return to the dashboard`);
      }
      await visitor.navigate("/dashboard");
      await visitor.expect("location.pathname==='/dashboard' && /VIS-[0-9A-F]{12}/.test(document.body.innerText)", "Dashboard unavailable");
      await visitor.press("Start conversation");
      await visitor.expect(visitor.text("Waiting for a volunteer"), "Visitor waiting card unavailable");
      await visitor.resize(320, 840);
      assert.ok(await visitor.evaluate(fit), "Waiting screen overflow at 320px");
      await visitor.screenshot("waiting-mobile");
      await visitor.press("End conversation");
      await visitor.expect(visitor.text("Conversation ended"), "Closed visitor state unavailable");
      await visitor.navigate("/dashboard");
      await visitor.expect("!!Array.from(document.querySelectorAll('button')).find(button=>button.innerText.trim()==='Sign out')", "Dashboard unavailable");
      await visitor.press("Sign out");
      await visitor.expect("location.pathname==='/login'", "Sign-out failed before confirmation check");
      for (const path of ["/dashboard", "/dashboard/admin", "/dashboard/conversations/00000000-0000-4000-8000-000000000000"]) {
        assert.equal(await visitor.evaluate(`fetch(${JSON.stringify(path)}).then(response => new URL(response.url).pathname)`), "/login",
          `Guest accessed ${path}`);
      }
      await visitor.navigate("/auth/confirm?token_hash=invalid&type=email");
      await visitor.expect(visitor.text("This confirmation link could not be used"), "Confirmation error screen unavailable");
      assert.ok(await visitor.evaluate(fit), "Confirmation screen overflow at 320px");
    } finally {
      sql(`delete from public.conversations where visitor_id=(select id from auth.users where email='${email}');
        delete from auth.users where email='${email}';`);
    }
  }),
);
