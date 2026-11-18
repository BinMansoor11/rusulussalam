# Human Connection staging runbook

The release target is a dedicated Vercel project using its **Preview** environment and a new hosted Supabase project. Use synthetic test accounts and conversations. The local Supabase configuration, production settings, and existing databases stay separate. The following remote steps require approval.

## Owner setup

1. In the Supabase dashboard, create a new staging project in the intended region. Prefer PostgreSQL 17 to match local verification. Record the project reference and its canonical `https://<project-ref>.supabase.co` URL. Keep the database password in the owner’s secret store. Wait to create Auth users until after the migration.
2. Create a dedicated Vercel project in the intended scope without connecting Git. An owner can create an empty project with `pnpm dlx vercel project add` once remote setup is approved. Pick the stable HTTPS preview hostname you will use for testers. Use a deployment alias or a team-controlled preview domain. Set Vercel Authentication under **Deployment Protection** and verify the chosen hostname is covered. Use a protected preview alias if the plan cannot protect production domains. [Vercel project management](https://vercel.com/docs/cli/project) · [Deployment protection](https://vercel.com/docs/deployment-protection)
3. In the staging Vercel project, use the repository root, the **Next.js** framework preset, and **Node.js 22.x**. Leave the install command on auto-detect for the pnpm lockfile. Enable Corepack and let the checked-in `packageManager` pin pnpm. Keep system environment variables available to the build. Set the staging project’s Build Command to `pnpm check:staging-env && pnpm build && pnpm audit:browser-env`. [Vercel package managers](https://vercel.com/docs/package-managers) · [Vercel build settings](https://vercel.com/docs/builds/configure-a-build)
4. In **Settings → Environment Variables**, add only the staging values below to **Preview**. The example file contains variable names and no credentials. Enter the actual values directly in the dashboards. [Vercel environment variables](https://vercel.com/docs/environment-variables)

| Name | Staging value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Canonical API origin of the dedicated staging Supabase project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key from that same staging Supabase project |
| `AUTH_SITE_URL` | Exact stable staging HTTPS origin, without a path or trailing slash |
| `STAGING_SUPABASE_PROJECT_REF` | The staging Supabase project reference, independently verified against the dashboard |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` on the staging Vercel project |

`VERCEL` and `VERCEL_ENV` are platform-provided build variables. The staging guard expects Preview. The optional `NEXT_PUBLIC_SUPABASE_ANON_KEY` is for legacy local development. The deployed application needs no service-role key, secret key, database password, SMTP credential, or Supabase access token. Use authenticated CLI sessions and operator prompts for approved setup.

## Supabase Auth and Realtime settings

1. In **Authentication → URL Configuration**, set **Site URL** to the exact value of `AUTH_SITE_URL`. Add just `<AUTH_SITE_URL>/auth/confirm` to the redirect allowlist for staging. Test from that hostname, including the initial signup request. [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
2. Enable the email provider, email signup, and **Confirm email**. Configure staging SMTP in Supabase for external test inboxes and disable link tracking. The built-in mail service is restricted to organization team addresses and has a low quota. [Supabase email testing](https://supabase.com/docs/guides/auth/testing-auth-flows)
3. In **Authentication → Email Templates → Confirm signup**, link the confirmation button to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. Keep the template scoped to the staging project. The callback also accepts a PKCE authorization code from the default link flow, which requires the browser that began signup. Verify the link lands on the protected staging hostname and establishes a session. [Supabase Next.js email confirmation](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs)
4. Enable Realtime. Turn off **Allow public access to channels** in Realtime Settings. Keep the data API enabled with `public` exposed and keep the private helper schema out of the exposed list. The migration creates participant policies on `realtime.messages`. [Supabase Realtime settings](https://supabase.com/docs/guides/realtime/settings)

## Migration preflight and commands after approval

In the confirmed staging SQL Editor, inspect the new project before creating users. Expect the native UUID function, the Realtime functions and table, RLS enabled on `realtime.messages`, and zero Auth users. Expect the application table and private helper schema to be absent. Investigate deviations before applying.

```sql
select
  current_setting('server_version') as postgres_version,
  to_regprocedure('pg_catalog.gen_random_uuid()') is not null as native_uuid,
  to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null as realtime_send,
  to_regprocedure('realtime.topic()') is not null as realtime_topic,
  coalesce((select relrowsecurity from pg_catalog.pg_class
            where oid = to_regclass('realtime.messages')), false) as realtime_rls,
  to_regclass('public.conversations') is null as new_application,
  to_regnamespace('private') is null as private_schema_available,
  (select count(*) from auth.users) as auth_users;
```

Use a clean, reviewed checkout in a staging-only directory. Compare the project reference in the dashboard and the local CLI link. The commands below use the verified v2 CLI, where `--linked` explicitly selects the linked remote project. The dry run should list only `20261118000000_human_connection.sql`. Confirm the target and dry run before approving the write.

```powershell
$stagingRef = 'REPLACE_WITH_STAGING_PROJECT_REF'
if ($stagingRef -cnotmatch '^[a-z]{20}$') { throw 'Enter the approved staging project reference' }
pnpm dlx supabase@2.122.1 login
pnpm dlx supabase@2.122.1 link --project-ref $stagingRef
if ($LASTEXITCODE -ne 0) { throw 'Link failed' }
if ((Get-Content -Raw supabase/.temp/project-ref).Trim() -cne $stagingRef) { throw 'Unexpected linked project' }
pnpm dlx supabase@2.122.1 db push --linked --skip-vault --dry-run
# After approval of the target and plan:
pnpm dlx supabase@2.122.1 db push --linked --skip-vault
pnpm dlx supabase@2.122.1 migration list --linked
```

The app migration does not depend on `pgcrypto`. It expects the standard Supabase Auth, PostgREST, and Realtime objects and installs its own application grants. Local `config.toml` disables confirmations for test fixtures. Configure hosted Auth and Realtime in the staging dashboard and leave that local configuration out of the remote rollout.

After migration and successful email confirmation, bootstrap the first approved administrator separately. Use the [bootstrap runbook](../supabase/operations/README.md) and the **Connect** values for the verified staging project. From a trusted terminal, connect as the database owner using `psql -X -W -d 'host=REPLACE port=REPLACE dbname=postgres user=REPLACE sslmode=require'` and pass the same `-v admin_email=…`, `-v admin_public_id=…`, and `-f supabase/operations/bootstrap-first-admin.sql` arguments. Enter the password at the prompt. Use the session pooler if the direct connection is unavailable.

## Preview deployment commands after approval

Verify the Vercel scope and project interactively. Use the staged environment and the remote Vercel builder so the public Supabase values are embedded at build time. Assign the planned alias only after confirming the returned deployment belongs to the staging project. Keep the Preview environment and protection active on the alias.

```powershell
$project = 'REPLACE_WITH_STAGING_VERCEL_PROJECT'
$scope = 'REPLACE_WITH_VERCEL_SCOPE'
$stagingHost = 'REPLACE_WITH_STAGING_HOSTNAME'
pnpm dlx vercel login
pnpm dlx vercel link --project $project --scope $scope
if ($LASTEXITCODE -ne 0) { throw 'Vercel link failed' }
pnpm dlx vercel project inspect $project --scope $scope
# After confirming the staging project and Preview settings:
pnpm dlx vercel deploy --target=preview --scope $scope
# Copy the verified URL from the preceding command:
$previewUrl = 'REPLACE_WITH_APPROVED_PREVIEW_DEPLOYMENT_URL'
pnpm dlx vercel alias set $previewUrl $stagingHost --scope $scope
```

Open the staging alias in a signed-out browser and verify it requires Vercel access before inviting testers. Confirm the build log reports both environment and browser credential audits passing. Open the returned deployment through the alias for Auth testing. [Vercel project linking](https://vercel.com/docs/cli/project-linking) · [Preview deployments](https://vercel.com/docs/cli/deploy)

## Staging acceptance checklist

- [ ] Deployment access requires permitted Vercel membership. The staging alias, Supabase project reference, and current migration history match the approval.
- [ ] Register with a synthetic test inbox, receive the confirmation email, follow its link on the staging alias, and confirm a visitor public ID. Verify invalid or reused links show the recovery screen. Check sign-in, sign-out, expired sessions, unauthenticated redirects, and secure cookies.
- [ ] Request an English and an Urdu conversation in separate visitor sessions. Verify waiting when unavailable, no duplicate open request, and recovery after refresh.
- [ ] Approve a vetted test volunteer from an authorized administrator session. Check availability and language controls, queue sanitization, claiming, concurrent claims, and capacity. Verify visitor and volunteer sessions cannot load admin reports or approve accounts.
- [ ] Exchange persisted messages in two authorized sessions. Verify ordering, history pagination, offline catch-up, and closed or flagged composer behavior. Confirm an unrelated test account cannot read history, send, or join the private topic, and that client publishing to that topic is denied.
- [ ] Submit a report and use the admin dashboard to review it. Check that reporter notes remain intact, review notes remain separate, and non-admin sessions cannot see the report.
- [ ] Verify English and Urdu, mobile layout, and keyboard navigation using the deployed build. Use synthetic details in screenshots and logs.
- [ ] Confirm the retention job and monitoring in staging if scheduling has separate approval. Record the result and review operational safeguards before broader access.

## Retention and rollout limitations

The existing `purge_expired_data()` RPC and cleanup logs are ready for staging verification. The repository contains no scheduled job. After separate approval, enable Supabase Cron in staging and use the existing daily SQL scheduling and monitoring procedure with an authorized execution role. Use a staging-specific job name such as `human-connection-staging-retention`. Verify the job identity, timezone, first run, and application cleanup status. A job may report SQL success while its JSON result reports cleanup failure. [Retention operations](../supabase/operations/README.md#daily-retention-after-launch-approval)

The browser audit detects Supabase secret keys and legacy service-role JWTs in compiled static assets. Review staging project variables independently and verify the publishable key came from the stated project. Vercel protection gates the app origin. Supabase still enforces its own Auth and database permissions directly. The staging acceptance checklist is a manual smoke test. Keep the automated fixture suites on disposable development databases, since they age, delete, and clean up test data.
