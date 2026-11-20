import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { withBrowser } from "./browser-fixtures.mjs";

const path = "/dashboard/admin";

test("administrator dashboard and report review in Chrome", { timeout: 120000 }, () =>
  withBrowser(async ({ visitor: admin, volunteer: applicant, sql }) => {
    assert.equal(sql("select count(*) from public.profiles where role='admin'"), "0",
      "Use a disposable stack without an existing administrator");
    const adminEmail = `hc-admin-browser-${randomUUID()}@example.com`;
    const applicantEmail = `hc-applicant-browser-${randomUUID()}@example.com`;
    const password = `Hc9!${randomUUID()}`;
    const evidence = "Original safeguarding details";
    const operatorNotes = "Operator follow-up recorded";
    try {
      await admin.mobile();
      await applicant.mobile();
      await admin.signup(adminEmail, password);
      const adminId = await admin.evaluate("document.body.innerText.match(/VIS-[0-9A-F]{12}/)[0]");
      const publicId = sql(["-v", `admin_email=${adminEmail}`, "-v", `admin_public_id=${adminId}`,
        "-f", "supabase/operations/bootstrap-first-admin.sql"]);
      assert.match(publicId, /^ADM-[0-9A-F]{12}$/);
      await admin.cdp("Page.bringToFront");
      await admin.navigate("/dashboard");
      await admin.expect("location.pathname==='/dashboard/admin'", "Bootstrapped administrator did not reach the admin route");
      try {
        await admin.expect(admin.text("No reports in this view."), "Administrator report list did not render its empty state", 5000);
      } catch (error) {
        const visible = await admin.evaluate("JSON.stringify({heading:document.querySelector('h1')?.innerText," +
          "alert:document.querySelector('[role=alert]')?.innerText,status:document.querySelector('[role=status]')?.innerText})");
        throw new Error(`${error.message} ${visible}`);
      }
      assert.ok(await admin.evaluate(admin.text(publicId)), "Administrator public ID missing");

      await applicant.signup(applicantEmail, password);
      const target = await applicant.evaluate("document.body.innerText.match(/VIS-[0-9A-F]{12}/)[0]");
      assert.match(target, /^VIS-[0-9A-F]{12}$/);
      const userId = sql(`select id from auth.users where email='${applicantEmail}'`);
      assert.match(userId, /^[0-9a-f-]{36}$/);
      sql(`begin;
        do $$ declare chat uuid; begin
          perform set_config('request.jwt.claim.sub', '${userId}', true);
          chat := (public.request_conversation()->>'id')::uuid;
          perform public.submit_safeguarding_report(chat, 'other', '${evidence}');
          perform public.end_conversation(chat);
        end $$;
        commit;`);
      await applicant.cdp("Page.bringToFront");
      await applicant.navigate(path);
      await applicant.expect(applicant.text("This page could not be found"), "Visitor reached admin route");
      assert.ok(!(await applicant.evaluate(applicant.text(evidence))), "Visitor received report details");
      await admin.cdp("Page.bringToFront");
      await admin.navigate(path);
      const reportStatus = status => "Array.from(document.querySelectorAll('summary')).some(row => " +
        "row.innerText.includes('Other') && row.innerText.includes(" + JSON.stringify(status) + "))";
      await admin.expect(reportStatus("Pending"), "Pending report missing");
      await admin.evaluate("document.querySelector('details').open=true");
      await admin.expect(admin.text(evidence), "Reporter evidence missing");
      await admin.resize(1440);
      assert.ok(await admin.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Admin desktop page overflows");
      await admin.screenshot("admin-desktop");
      await admin.resize(320, 840);
      assert.ok(await admin.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Admin report detail overflows at 320px");
      assert.ok(await admin.evaluate(admin.text(target)), "Reporter public ID missing");
      assert.ok(!(await admin.evaluate("document.querySelector('#reports-heading').closest('section').innerText.includes(" + JSON.stringify(applicantEmail) + ")")) && !(await admin.evaluate(admin.text(userId))),
        "Review page exposed a private account identifier");
      await admin.evaluate("document.querySelector('details select').value='escalated';" +
        "document.querySelector('[name=adminNotes]').value=" + JSON.stringify(operatorNotes) + ";" +
        "document.querySelector('[name=confirmReview]').checked=true");
      await admin.press("Save review");
      await admin.expect(admin.text("Review saved.") + " && " + reportStatus("Escalated"),
        "Administrator review did not save");
      assert.ok(await admin.evaluate(admin.text(evidence)), "Original evidence disappeared after review");
      assert.equal(sql(`select admin_notes from public.reports where reporter_id='${userId}'`), operatorNotes);

      await admin.cdp("Page.bringToFront");
      await admin.evaluate("document.querySelector('[name=interfaceLanguage]').value='ur';" +
        "document.querySelector('[name=interfaceLanguage]').form.requestSubmit()");
      await admin.expect("!!document.querySelector('main[lang=ur][dir=rtl]')", "Administrator Urdu RTL did not load");
      assert.ok(await admin.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "Urdu admin page overflows at 320px");
      await admin.screenshot("admin-urdu-mobile");
    } finally {
      const records = `select id from auth.users where email in ('${adminEmail}','${applicantEmail}')`;
      sql(`delete from public.reports where reporter_id in (${records});
        delete from public.conversations where visitor_id in (${records});
        delete from auth.users where id in (${records});`);
    }
  }),
);
