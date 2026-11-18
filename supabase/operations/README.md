# Administration and safeguarding operations

## First administrator on a disposable stack

1. A trusted operator creates an account through ordinary signup for the designated administrator. Verify the intended person and their control of the email independently. Have them sign in and read the visitor public ID from their own dashboard. Local signup auto-confirms email for testing, so it cannot establish control of a real mailbox.
2. Confirm the target is the disposable database, the account has no open conversation, and the project has no administrator. From a trusted terminal connected as the database owner, run the following in PowerShell. Supply the connection password through the local PostgreSQL prompt or a private process environment.

```powershell
psql -X -h 127.0.0.1 -p 54322 -U postgres -d postgres `
  -v 'admin_email=approved-operator@example.com' `
  -v 'admin_public_id=VIS-REPLACE-ME' `
  -f supabase/operations/bootstrap-first-admin.sql
```

3. Check that the script returns one `ADM-` public ID. Have the designated operator sign in again, confirm that exact ID on `/dashboard/admin`, and record the authorization in the operator’s access log. The transaction matches the verified email and visitor ID, rejects an existing administrator, and changes at most one account.

The bootstrap is a manual privileged operation outside the migrations and app. The project owner must approve any use in another environment.

## Review a report and approve a volunteer

1. In a disposable stack, submit a report from an assigned visitor or volunteer. Sign in as the administrator in a separate browser profile. Open its report details, read the reporter’s original notes, select a review status, enter administrative notes, confirm, and save. Check that the original notes and reason remain intact. Report statuses are internal. An escalation requires a separate human follow-up through the safeguarding procedure.
2. For a volunteer approval, complete vetting through the organization’s trusted process first. During a verified handover with that applicant, ask them to sign in and read their visitor public ID from their dashboard. Compare it with the approved application through the trusted channel. A forwarded screenshot or public ID by itself is insufficient. Never request the applicant’s password or session token.
3. In **Approve a volunteer**, enter the same verified visitor ID twice, select English and/or Urdu, and confirm vetting before submitting. The database checks eligibility and refuses an account with an open conversation. Have the applicant refresh their dashboard to see their new volunteer ID. Availability starts off. Record the approval and its rationale in the operator’s restricted records.
4. In a visitor or volunteer session, open `/dashboard/admin` and confirm access is denied. On the administrator dashboard, switch to Urdu and check the forms on a narrow screen.

Review status and administrative notes are the current decision. The original report evidence stays separate. The RPC has no review revision history or concurrent-edit check. Coordinate ownership before editing the same report. Use protected operator records for vetting decisions and safeguarding follow-up.

For the automated browser flow, run `pnpm test:admin-browser` after starting the app and loading the local `DB_URL` as shown in the [integration runbook](../README.md). Use a disposable stack with no administrator or existing reports. The test bootstraps and removes its own accounts and report.

## Daily retention after launch approval

The existing cleanup function ends waiting requests older than 60 minutes. It retains ended messages and metadata for 14 and 30 days, flagged messages and metadata for 90 and 180 days, and reports and application cleanup logs for 365 days. The daily job may close stale waiting records later than 60 minutes. Queue eligibility is already enforced in the RPC once the 60 minutes elapse.

- **Development:** Run `pnpm test:supabase` on an empty disposable stack. It uses aged fixtures and the service-role RPC to validate deletions. To inspect results manually, call `select public.purge_expired_data();` as the migration owner against fixtures and query `public.cleanup_logs` from the same trusted connection.
- **Production setup after approval:** Enable [Supabase Cron](https://supabase.com/docs/guides/cron/install) and verify the job’s execution role and scheduler timezone. Use an operator-managed SQL job with permission to execute `public.purge_expired_data()`, such as the migration owner. The existing API grant is limited to `service_role`. Keep that credential in trusted server-side infrastructure. The SQL job requires no API key.
- **Schedule example for an approved environment:** A daily run at 03:30 in the verified scheduler timezone can use `select cron.schedule('human-connection-retention', '30 3 * * *', 'select public.purge_expired_data();');`. Verify the job owner and first run in Cron. [Scheduling and run history](https://supabase.com/docs/guides/cron/quickstart)
- **Monitoring:** Check both [Cron run history](https://supabase.com/docs/guides/cron/quickstart) and `select executed_at, status, details from public.cleanup_logs order by executed_at desc limit 20;`. The function can return a JSON failure with a SQLSTATE after rolling back cleanup, so Cron may record SQL success while cleanup failed. Alert on failure rows or no successful cleanup within the agreed daily monitoring window. Treat `skipped` as an overlapping run and confirm the other run succeeded. Keep findings and logs restricted to operators.

## Before public launch

Assign a safeguarding owner and establish review coverage, response procedures, volunteer vetting, and escalation contacts. Verify locale-specific emergency guidance and publish accessibility, privacy, terms, consent, and retention information. Verify production signup, email delivery, role access, private Realtime, and scheduled cleanup in an approved environment. Reports require human review and do not initiate an emergency response.
