import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { withBrowser } from "./browser-fixtures.mjs";

test("volunteer workflow and private chat in Chrome", { timeout: 180000 }, () =>
  withBrowser(async ({ visitor, volunteer, sql }) => {
  const visitorEmail = "hc-phase4-visitor-" + randomUUID() + "@example.com";
  const volunteerEmail = "hc-phase4-volunteer-" + randomUUID() + "@example.com";
    try {
      assert.equal(sql("select count(*) from public.volunteers where is_available and 'en'=any(supported_languages)"), '0',
        "Waiting fixture requires no other English volunteers online");
      const pass = "Hc9!" + randomUUID();
      await visitor.mobile();
      await volunteer.mobile();
      await visitor.signup(visitorEmail, pass);
      const visitorId = await visitor.evaluate("document.body.innerText.match(/VIS-[A-F0-9]{12}/)[0]");
      await visitor.press("Start conversation");
      await visitor.expect(visitor.text("Waiting for a volunteer"), "Visitor did not enter waiting");
      const waitingPath = await visitor.evaluate("location.pathname");
      const conversationId = waitingPath.split('/').at(-1);
      await volunteer.signup(volunteerEmail, pass);
      const volunteerAccount = sql("select id from auth.users where email='" + volunteerEmail + "'");
      assert.match(volunteerAccount, /^[a-f0-9-]{36}$/);
      sql("begin; update public.profiles set role='volunteer', public_id=private.generate_public_id('volunteer') where id='" +
        volunteerAccount + "'; insert into public.volunteers(id,supported_languages,max_active_conversations) values('" +
        volunteerAccount + "',array['en'],1); commit;");
      await volunteer.navigate("/dashboard");
      await volunteer.expect(volunteer.text("Volunteer dashboard") + " && " + volunteer.text("Set yourself to available"),
        "Volunteer dashboard or empty offline queue missing");
      assert.ok(!(await volunteer.evaluate(volunteer.text(visitorId))), "Offline queue showed a visitor identity");
      assert.ok(await volunteer.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Volunteer dashboard overflows at mobile width");
      await volunteer.evaluate("document.querySelector('[name=availability]').checked=true; document.querySelector('[name=supportedLanguages][value=en]').checked=false");
      await volunteer.press("Save settings");
      await volunteer.expect(volunteer.text("Choose at least one supported language"), "Empty languages did not show validation");
      assert.equal(sql("select is_available from public.volunteers where id='" + volunteerAccount + "'"), "f");
      await volunteer.evaluate("document.querySelector('[name=availability]').checked=true; document.querySelector('[name=supportedLanguages][value=en]').checked=true");
      await volunteer.press("Save settings");
      const claimForm = "document.querySelector('input[value=" + JSON.stringify(conversationId) + "]')?.form";
      await volunteer.expect("!!(" + claimForm + ")", "Matching waiting queue did not appear");
      await volunteer.resize(1440);
      assert.ok(await volunteer.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Volunteer desktop queue overflows");
      await volunteer.screenshot("volunteer-desktop");
      await volunteer.resize(320, 840);
      assert.ok(await volunteer.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Volunteer queue overflows at 320px");
      const staleClaim = await volunteer.evaluate(
        "fetch('/dashboard').then(response=>response.text()).then(html=>{" +
        "const page=new DOMParser().parseFromString(html,'text/html');" +
        "return Array.from(new FormData(page.querySelector('input[value=" +
        JSON.stringify(conversationId) + "]').form));})",
      );
      assert.ok(staleClaim.some(([name]) => name.startsWith("$ACTION_")), "Missing rendered claim action");
      assert.ok(!(await volunteer.evaluate(volunteer.text(visitorId))), "Waiting queue showed a visitor identity");
      await volunteer.press("Refresh queue");
      await volunteer.expect("!!(" + claimForm + ")", "Manual refresh lost waiting queue");
      await visitor.cdp("Page.bringToFront");
      await visitor.cdp("Network.enable");
      const network = offline => visitor.cdp("Network.emulateNetworkConditions", {
        offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
      });
      await network(true);
      await visitor.expect("!navigator.onLine", "Browser did not go offline");
      await volunteer.evaluate(claimForm + ".querySelector('button').click()");
      await volunteer.expect("location.pathname===" + JSON.stringify(waitingPath) + " && " + volunteer.text("Visitor public ID"),
        "Claim did not open assigned conversation");
      assert.ok(await volunteer.evaluate(volunteer.text(visitorId)), "Assigned conversation omitted visitor public ID");
      assert.ok(!(await volunteer.evaluate(volunteer.text(visitorEmail))), "Assigned conversation exposed login email");
      assert.ok(await visitor.evaluate(visitor.text("Waiting for a volunteer")), "Offline visitor status unexpectedly changed");
      await network(false);
      await visitor.expect("navigator.onLine && " + visitor.text("A volunteer has joined"),
        "Waiting status did not recover when the browser came back online", 4500);
      await visitor.expect(visitor.text("No messages yet."), "Initial chat history did not finish loading");
      await visitor.expect("!(" + visitor.text("Connecting to live updates") + ")", "Private chat subscription did not connect");
      const literal = 'اردو <img src=x onerror="window.hcChatMarkupRan=true">';
      await volunteer.sendMessage(literal);
      await visitor.expect(visitor.text(literal), "Visitor did not receive the volunteer’s persisted message", 4500);
      assert.ok(await visitor.evaluate("!window.hcChatMarkupRan && !document.querySelector('[role=log] img')"),
        "Message markup was interpreted as HTML");
      assert.equal(await visitor.evaluate("getComputedStyle(document.querySelector('[role=log] [dir=auto]')).direction"),
        "rtl", "Mixed-language text did not follow its first strong character");
      await volunteer.cdp("Page.bringToFront");
      await visitor.sendMessage("Visitor browser reply");
      await volunteer.expect(volunteer.text("Visitor browser reply"), "Volunteer did not receive visitor reply", 4500);

      await visitor.cdp("Page.bringToFront");
      await network(true);
      await visitor.expect("!navigator.onLine", "Chat browser did not go offline");
      assert.ok(await visitor.evaluate(visitor.button("Send") + ".disabled"), "Offline composer still accepts send");
      sql("begin; select set_config('request.jwt.claim.sub','" + volunteerAccount + "',true);" +
        "select public.send_message('" + conversationId + "','History fixture ' || n) from generate_series(1,35) n; commit;");
      await network(false);
      await visitor.expect(visitor.text("History fixture 35") + " && " + visitor.text("History fixture 1"),
        "Reconnection did not recover the full multi-page gap");
      const messageCount = await visitor.evaluate("document.querySelectorAll('[role=log] li').length");
      assert.equal(messageCount, 37, "Live reconciliation lost or duplicated messages");
      await visitor.navigate(waitingPath);
      await visitor.expect("!!(" + visitor.button("Load older messages") + ")", "History pagination not offered");
      assert.equal(await visitor.evaluate("document.querySelectorAll('[role=log] li').length"), 30);
      await visitor.press("Load older messages");
      await visitor.expect("document.querySelectorAll('[role=log] li').length===37", "Older history did not merge without duplicates");
      assert.ok(await visitor.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Message log overflows mobile width");
      await visitor.resize(320, 840);
      assert.ok(await visitor.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Message log overflows at 320px");
      await visitor.screenshot("chat-mobile");
      await visitor.evaluate("document.querySelector('a[href=\"#message\"]').click()");
      await visitor.expect("document.activeElement.id==='message'", "Mobile composer shortcut did not focus the message field");
      await visitor.screenshot("chat-composer-mobile");
      await visitor.evaluate("document.activeElement.blur(); window.scrollTo(0,0)");
      await visitor.resize(1440, 960);
      assert.ok(await visitor.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Desktop chat overflows");
      await visitor.screenshot("chat-desktop");
      await volunteer.navigate("/dashboard");
      await volunteer.expect(volunteer.text(visitorId) + " && " + volunteer.text("Active conversations"),
        "Assigned conversation was not recovered on the dashboard");
      await volunteer.evaluate("document.getElementById('interface-language').value='ur'");
      await volunteer.press("Apply");
      await volunteer.expect("!!document.querySelector('main[lang=ur][dir=rtl]')", "Volunteer dashboard did not switch to Urdu RTL");
      assert.ok(await volunteer.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Urdu dashboard overflows mobile width");
      await volunteer.navigate(waitingPath);
      await volunteer.expect("!!document.querySelector('main[lang=ur][dir=rtl]') && " + volunteer.text(visitorId),
        "Assigned conversation did not retain volunteer locale");
      await volunteer.evaluate("document.querySelector('form input[name=conversationId]').form.querySelector('button').click()");
      await volunteer.expect("!document.querySelector('form input[name=conversationId]') && " + volunteer.text(visitorId),
        "Volunteer end action did not render terminal conversation");
      await visitor.navigate(waitingPath);
      await visitor.expect(visitor.text("Conversation ended"), "Visitor did not recover the ended conversation");
      await visitor.expect(visitor.text("History fixture 35") + " && !document.querySelector('#message')",
        "Ended conversation did not preserve history and hide the composer");
      await visitor.evaluate("document.querySelector('details').open=true; document.querySelector('[name=reason]').value='harassment';" +
        "document.querySelector('details form').requestSubmit()");
      await visitor.expect(visitor.text("Your report was submitted.") + " && " + visitor.text("Conversation closed"),
        "Reporting did not persist and flag the conversation");
      await volunteer.evaluate("(() => {const form=document.createElement('form');" +
        "form.method='post';form.enctype='multipart/form-data';form.action='/dashboard';" +
        "for(const [name,value] of " + JSON.stringify(staleClaim) + "){" +
        "const input=document.createElement('input');input.type='hidden';input.name=name;" +
        "input.value=value;form.append(input);}document.body.append(form);form.submit();})()");
      await volunteer.expect("location.search.includes('notice=claim-unavailable')",
        "Stale claim did not return a recoverable notice");
      console.log("Browser smoke passed: volunteer workflow, private chat, pagination, reconnect, safe text rendering, closing, and reporting.");
    } finally {
      sql("delete from public.reports where reporter_id=(select id from auth.users where email='" + visitorEmail +
        "'); delete from public.conversations where visitor_id=(select id from auth.users where email='" +
        visitorEmail + "'); delete from auth.users where email in ('" + visitorEmail + "','" + volunteerEmail + "')");
    }
  }),
);
