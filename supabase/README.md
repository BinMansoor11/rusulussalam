# Human Connection Supabase integration

The suite uses real Supabase Auth, PostgREST, PostgreSQL, and private Realtime WebSockets. It needs Node.js 22 or newer, pnpm, and PostgreSQL's `psql` client on PATH. For local runs, start Docker Desktop in Linux container mode.

The database must be disposable and empty after migrations. The suite checks this before creating fixtures. It creates six test accounts, deletes one through the Auth Admin API, ages test records with PostgreSQL, and invokes the real retention RPC. The remaining fixtures stay in the database for inspection until the next reset.

## Run locally

From the repository root in PowerShell, start the isolated stack and capture the local credentials without displaying them:

```powershell
docker version --format '{{.Server.Version}}'
pnpm dlx supabase@2.122.1 start --exclude studio,storage-api,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Local Supabase failed to start' }
$supabaseStatus = pnpm dlx supabase@2.122.1 status -o env
if ($LASTEXITCODE -ne 0) { throw 'Local Supabase status failed' }
foreach ($line in $supabaseStatus) {
    if ($line -match '^(API_URL|DB_URL|ANON_KEY|SERVICE_ROLE_KEY)="([^"]*)"$') {
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
    }
}
Remove-Variable supabaseStatus
Remove-Item Env:HC_DISPOSABLE_PROJECT_REF -ErrorAction SilentlyContinue
pnpm test:supabase
```

For subsequent runs, reset only this disposable local database. Restart its API gateway to refresh Realtime routing after the database reset, then run the suite with the same process environment. To shut down the stack, use the stop command.

```powershell
pnpm dlx supabase@2.122.1 db reset --local
if ($LASTEXITCODE -ne 0) { throw 'Local Supabase reset failed' }
docker restart supabase_kong_human-connection-integration | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Local Supabase gateway restart failed' }
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $gatewayHealth = docker inspect --format '{{.State.Health.Status}}' supabase_kong_human-connection-integration
    if ($gatewayHealth -eq 'healthy') { break }
    Start-Sleep -Seconds 1
}
if ($gatewayHealth -ne 'healthy') { throw 'Local Supabase gateway is not healthy' }
pnpm test:supabase
pnpm dlx supabase@2.122.1 stop
```

The runner keeps admin credentials in the Node process. Its tests cover signup metadata, role and RPC grants, concurrent claims and capacity, message identity and the send/end race, private Broadcast and client publish denial, Auth account deletion, and cleanup.

## Volunteer browser test

With the local Next.js app and disposable Supabase stack running, use the same `DB_URL` loaded above and run `pnpm test:volunteer-browser`. The test uses Chrome, 390-pixel viewports, and two separate login sessions. Set `CHROME_PATH` if Chrome is outside its usual location. Set `HC_BROWSER_APP_URL` if the app is on a different localhost port. Keep English volunteers unavailable at the start so the synthetic visitor enters the waiting queue.

The test provisions a synthetic volunteer in local PostgreSQL, checks settings and queue privacy, claims the request through the app, simulates the visitor’s offline-to-online recovery, and checks volunteer ending and Urdu RTL. It removes its own synthetic accounts and conversation when finished.

## Layout and authentication browser test

With the same local setup, run `pnpm test:layout-browser` to check the landing page, registration, login, visitor dashboard, and confirmation error screen. It also checks keyboard skip navigation, the light palette under a dark system preference, Urdu RTL, and horizontal overflow from 320px to 1440px. Set `HC_UI_SCREENSHOTS=1` when running the browser suites to save local screenshots under `node_modules/.cache/hc-phase7-screenshots`.

## Disposable hosted fallback

Use a new Supabase project dedicated to this suite if Docker is unavailable. Obtain approval before connecting to it or applying the migration. In that dedicated project, apply the reviewed migration once, enable email signup with confirmation disabled, and configure the Realtime project to require private channels. Use the legacy anonymous and service-role JWT keys for this runner. Use the direct PostgreSQL connection for the same project, with `sslmode=require` and reachable IPv6 or a Supabase IPv4 add-on.

After approval and migration, set `HC_DISPOSABLE_PROJECT_REF` to that project's reference and supply `API_URL`, `DB_URL`, `ANON_KEY`, and `SERVICE_ROLE_KEY` through a private process environment. Run `pnpm test:supabase`. The runner checks that both URLs match the declared project reference and that the database is empty. Dispose of the hosted test project when the approved work is complete.
