# Human Connection

Human Connection is a peer-listening application built with Next.js and Supabase.

## Local development

1. Install the project's dependencies with `pnpm install`.
2. Start the disposable Supabase stack using the [integration runbook](supabase/README.md).
3. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL` to the local API URL and set the publishable key or legacy anonymous key from the local stack. Set `AUTH_SITE_URL` to the exact origin you use in the browser.
4. Run `pnpm dev` and open `http://localhost:3000`.

`/register` lets visitors and volunteers choose their role and conversation language. Pending volunteers see their application status on the home page. The navigation language switch remembers the interface language in the current browser.

## Try the volunteer workflow locally

1. Use separate browser profiles for the administrator, volunteer, and visitor. Sign up the volunteer and visitor with the same conversation language.
2. In the admin dashboard, accept the volunteer application. As the visitor, request a conversation and keep the waiting page open.
3. In the admin dashboard, find the waiting request and assign the approved volunteer. Confirm that both participants can open the chat and see only each other’s public ID.
4. End the conversation and open its transcript from **Conversation history** in the admin dashboard.

## Administration and safeguarding

The [administration and safeguarding runbook](supabase/operations/README.md) covers first-administrator bootstrap, report review, volunteer vetting and approval, and retention operations.

## Staging

See the [staging deployment runbook](docs/staging.md) for Supabase and Vercel setup, the release commands, authentication redirects, and staging acceptance checks.

## Email confirmation

The disposable local configuration disables email confirmation. With confirmation enabled, set the Supabase Auth Site URL to the application origin and allow the exact `<origin>/auth/confirm` redirect URL. Set `AUTH_SITE_URL` to the same application origin. The callback supports the default PKCE confirmation link in the browser that submitted signup.

To support confirmation from another browser, configure the Supabase Confirm signup email template to link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. See the [Supabase Next.js Auth guide](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs).
