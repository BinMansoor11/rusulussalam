# Human Connection

Human Connection is a peer-listening application built with Next.js and Supabase.

## Local development

1. Install the project's dependencies with `pnpm install`.
2. Start the disposable Supabase stack using the [integration runbook](supabase/README.md).
3. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL` to the local API URL and set the publishable key or legacy anonymous key from the local stack. Set `AUTH_SITE_URL` to the exact origin you use in the browser.
4. Run `pnpm dev` and open `http://localhost:3000`.

`/register` and `/login` lead to the protected `/dashboard`. The navigation language switch remembers the interface language in the current browser. Visitors can also save their preferred conversation language.

## Try the volunteer workflow locally

1. Use two browser profiles or a regular and a private window. Sign in as an approved local test volunteer in one and a visitor in the other. A trusted local administrator can approve a test account through `admin_promote_volunteer`.
2. Leave the volunteer unavailable. As the visitor, request a conversation in a language with no available volunteer and keep the waiting page open.
3. In the volunteer dashboard, select that language, enable availability, and save settings. The waiting request should appear. Use **Refresh queue** to check immediately.
4. Claim the request. Confirm the conversation shows the visitor’s public ID and that the visitor’s waiting page updates. Return to the dashboard to confirm the active conversation is listed, then reopen it and end it.
5. Use **Dashboard language** to switch to Urdu. Check the dashboard and assigned conversation on a narrow screen to verify RTL layout.

## Administration and safeguarding

The [administration and safeguarding runbook](supabase/operations/README.md) covers first-administrator bootstrap, report review, volunteer vetting and approval, and retention operations.

## Staging

See the [staging deployment runbook](docs/staging.md) for Supabase and Vercel setup, the release commands, authentication redirects, and staging acceptance checks.

## Email confirmation

The disposable local configuration disables email confirmation. With confirmation enabled, set the Supabase Auth Site URL to the application origin and allow the exact `<origin>/auth/confirm` redirect URL. Set `AUTH_SITE_URL` to the same application origin. The callback supports the default PKCE confirmation link in the browser that submitted signup.

To support confirmation from another browser, configure the Supabase Confirm signup email template to link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. See the [Supabase Next.js Auth guide](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs).
