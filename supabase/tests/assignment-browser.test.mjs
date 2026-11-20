import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { withBrowser } from "./browser-fixtures.mjs";

test("signup, approval, manual assignment, removal and admin history", { timeout: 180000 }, () =>
  withBrowser(async ({ visitor: admin, volunteer: participant, sql }) => {
    const adminEmail = `hc-admin-${randomUUID()}@example.com`;
    const volunteerEmail = `hc-daee-${randomUUID()}@example.com`;
    const visitorEmail = `hc-madoo-${randomUUID()}@example.com`;
    const password = `Hc9!${randomUUID()}`;
    const message = "Transcript from the first pairing";
    const adminPath = "/dashboard/admin";
    const historyPath = `${adminPath}/history`;
    const userId = email => sql(`select id from auth.users where email='${email}'`);

    try {
      await admin.signup(adminEmail, password);
      const publicId = await admin.evaluate("document.body.innerText.match(/VIS-[0-9A-F]{12}/)[0]");
      sql(["-v", `admin_email=${adminEmail}`, "-v", `admin_public_id=${publicId}`, "-f", "supabase/operations/bootstrap-first-admin.sql"]);

      await participant.signup(volunteerEmail, password, { role: "volunteer", language: "sd", name: "Sindhi Da’ee" });
      assert.equal(sql(`select application_status from public.profiles where id='${userId(volunteerEmail)}'`), "pending");
      assert.equal(await participant.evaluate("document.querySelectorAll('main a').length"), 0);
      await participant.navigate("/dashboard");
      await participant.expect("location.pathname==='/'", "Pending volunteer accessed the dashboard");

      await admin.cdp("Page.bringToFront");
      await admin.navigate(adminPath);
      await admin.expect("!!document.querySelector('#assignments')", "Admin assignment sections did not load");
      await admin.expect(`document.querySelector('#assignments').textContent.includes(${JSON.stringify(volunteerEmail)})`,
        "Pending application missing from the admin directory");
      await admin.press("Reject");
      await admin.expect(admin.text("Reopen application"), "Rejection was not recorded");
      await participant.navigate("/");
      await participant.expect(participant.text("Your volunteer application was not approved."), "Rejection status missing");
      await admin.press("Reopen application");
      await admin.expect("!!" + admin.button("Accept"), "Application did not reopen");
      await admin.press("Accept");
      await admin.expect(admin.text("0 of 2 in use"), "Approved volunteer missing from capacity list");
      await participant.navigate("/dashboard");
      await participant.expect(participant.text("Volunteer dashboard"), "Approval did not unlock the dashboard");
      await participant.press("Sign out");
      await participant.expect("location.pathname==='/login'", "Sign-out failed");

      await participant.signup(visitorEmail, password, { language: "sd", name: "Sindhi Mad’oo" });
      assert.equal(await participant.evaluate("document.querySelector('#language') === null"), true);
      await participant.press("Start conversation");
      await participant.expect("location.pathname.includes('/conversations/')", "Request was not created");
      const chatPath = await participant.evaluate("location.pathname");
      const chatId = chatPath.split("/").at(-1);
      assert.equal(sql(`select status from public.conversations where id='${chatId}'`), "waiting");
      await admin.navigate(adminPath);
      await admin.expect("!!document.querySelector('[name=volunteerId]')", "Assignment dropdown missing");
      await admin.evaluate("document.querySelector('[name=volunteerId]').selectedIndex=1");
      await admin.press("Assign");
      await admin.expect(admin.text("1 of 2 in use"), "Assignment did not use a slot");
      await participant.cdp("Page.bringToFront");
      await participant.navigate(chatPath);
      await participant.expect(participant.text("No messages yet."), "The active chat did not finish loading");
      await participant.sendMessage(message);
      await participant.expect(participant.text(message), "Message did not appear");
      assert.equal(await participant.evaluate(participant.text(volunteerEmail)), false);
      assert.equal(await participant.evaluate(participant.text("Sindhi Da’ee")), false);

      await admin.cdp("Page.bringToFront");
      await admin.press("Remove Da’ee and requeue");
      await admin.expect(admin.text("0 of 2 in use"), "Removal did not free a slot");
      assert.equal(sql(`select volunteer_id is null from public.conversations where id='${chatId}'`), "t");
      assert.equal(sql(`select count(*) from public.conversations where visitor_id='${userId(visitorEmail)}' and status='waiting'`), "1");
      await admin.navigate(`${historyPath}?conversation=${chatId}`);
      await admin.expect(admin.text(message) + " && " + admin.text("Admin removed the Da’ee"), "Admin history is missing the previous pairing");
      await participant.cdp("Page.bringToFront");
      await participant.navigate(`${historyPath}?conversation=${chatId}`);
      await participant.expect(participant.text("This page could not be found"), "Visitor reached the admin transcript");

      await admin.cdp("Page.bringToFront");
      await admin.navigate(adminPath);
      await admin.expect("!!document.querySelector('[name=volunteerId]')", "Replacement request missing");
      await admin.evaluate("document.querySelector('[name=volunteerId]').selectedIndex=1");
      await admin.press("Assign");
      await admin.expect(admin.text("1 of 2 in use"), "Replacement request was not assigned");
      await participant.cdp("Page.bringToFront");
      await participant.navigate("/dashboard");
      await participant.expect("!!document.querySelector('a[href*=\"/conversations/\"]')", "Replacement conversation unavailable");
      const replacement = await participant.evaluate("document.querySelector('a[href*=\"/conversations/\"]').getAttribute('href')");
      assert.notEqual(replacement, chatPath);
      await participant.navigate(replacement);
      await participant.expect(participant.text("No messages yet."), "Replacement chat contains old messages");
      await admin.cdp("Page.bringToFront");
      await admin.press("Remove Mad’oo and close");
      await admin.expect(admin.text("No active conversations.") + " && " + admin.text("No waiting requests."), "Removing the visitor did not close the request");
      assert.equal(sql(`select count(*) from public.conversations where visitor_id='${userId(visitorEmail)}' and status in ('waiting', 'active')`), "0");
      await participant.cdp("Page.bringToFront");
      await participant.navigate(replacement);
      await participant.expect(participant.text("This page could not be found"), "Removed visitor still has access to the conversation");
    } finally {
      sql(`delete from public.conversations where visitor_public_id in (
        select p.public_id from public.profiles p join auth.users u on u.id=p.id where u.email='${visitorEmail}'
      )`);
      sql(`delete from auth.users where email in ('${adminEmail}', '${volunteerEmail}', '${visitorEmail}')`);
    }
  }));
