# Team dashboard

Static team planner with Supabase Auth and Postgres. The public repository contains application code only. There are no bundled tasks, member lists, customer images, database exports or production secrets.

## Development

Requires Node.js 22 or newer.

```sh
npm ci
npm test
npm run build
npm run audit:public
npm run preview
```

The preview binds only to localhost. Without configuration the page shows a locked sign-in screen and makes no backend requests. There is no demo-data fallback and no automatic initialization from browser storage.

## Supabase setup

1. Choose a new Supabase project; apply `supabase/migrations/0001_dashboard.sql`, then `supabase/migrations/0002_revoke_rls_auto_enable_and_fk_indexes.sql`, through its SQL editor or migration tooling. The second migration revokes `EXECUTE` on the hosted `public.rls_auto_enable()` function and adds the missing foreign-key indexes. It does not change membership policies or how saves work.
2. In Authentication → URL Configuration, set Site URL to the published dashboard URL (including its repository subpath and trailing slash) and add that exact URL to Redirect URLs. For this deployment use `https://din-bye-png.github.io/team-dashboard/`; do not leave `localhost:3000` as the production Site URL. Use Supabase Auth to create or invite each approved user. Disable public signups if the project is invite-only. Knowing the site URL or creating an Auth account does not grant membership.
3. In the trusted SQL editor, create a workspace and its empty plan:

```sql
with w as (
  insert into public.dashboard_workspaces(name) values ('Team plan') returning id
)
insert into public.dashboard_plans(workspace_id,revision,content)
select id,0,'{"tasks":[],"trash":[]}'::jsonb from w
returning workspace_id;
```

4. In the SQL editor, add approved users to `dashboard_members` by workspace UUID and Auth user UUID. Never commit the SQL containing real member identities. Membership can only be administered through a trusted privileged environment, not from the website.
5. Set `supabaseUrl`, `supabasePublishableKey` and `workspaceId` in `public/config.js`, or use the corresponding `PUBLIC_…` build environment variables. Only new-style `sb_publishable_…` keys are accepted by this client. All three settings are public identifiers; authorization comes from Auth and RLS.

```sh
PUBLIC_SUPABASE_URL=... PUBLIC_SUPABASE_PUBLISHABLE_KEY=... PUBLIC_WORKSPACE_ID=... npm run build
```

`supabaseUrl` currently supports the standard HTTPS `*.supabase.co` hostname, matching the page's Content Security Policy. A custom backend domain requires an explicit reviewed change to both URL validation and CSP.

Do not put a database password, Supabase secret/service-role key, GitHub token, an account password or working data into public configuration. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys) and [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Import existing data

Keep the original backup outside this checkout. The trusted admin-only RPC imports tasks, trash and retained revisions in one transaction. It refuses to overwrite a nonempty plan. Historical authors remain NULL; new revisions use `auth.uid()`.

Run `node scripts/import-backup.mjs /absolute/path/to/private-backup.json` from a trusted local environment with `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `WORKSPACE_ID` supplied securely as environment variables. The secret must never be supplied to a browser bundle or a public build variable. The script prints only completion status, not task content.

After importing, verify task/trash counts, revision and matching history against the original backup before switching the team to the new site. The old site is independent and is not changed by this project.

## Data and authorization

The application uses an explicitly assigned workspace. `dashboard_members` links that workspace to Supabase Auth users; members can edit the shared plan. `dashboard_plans` stores the current ordered tasks and trash as JSONB. `dashboard_versions` stores snapshots with server-generated timestamps and authenticated authors.

Anonymous visitors have no table access. Authenticated nonmembers have no access to other workspaces. Membership cannot be self-assigned. Browser writes go through a membership-checked RPC with row locking, server-side JSON validation and revision comparison; snapshots and writes are atomic. The browser cannot write tables directly or invoke admin import/backup functions. Cleanup of old history and trash runs during a successful write after 30 days; the latest revision remains.

Invitation and recovery links open a password creation form. Expired or used links show a request for a fresh email. The page removes Auth tokens from the address before contacting Supabase, verifies the session, and accepts a new password only in the invitation/recovery flow. After saving, the user signs in with that password; workspace membership is still assigned separately by an administrator. Reloading before setting the password requires a fresh link.\n\nSessions use the official Supabase SDK with in-memory session storage and automatic token refresh; persistent storage and automatic URL-session detection are disabled. Email-link sessions are handled explicitly. Tokens and tasks are not saved in localStorage or IndexedDB. Reloading the page requires signing in again. Sign-out clears displayed tasks, forms, dialogs, cached plan and the selected local backup file. Existing access JWTs can remain valid until expiration; use appropriate token lifetime and administrative revocation practices for the deployment.

JSON export and a user-selected local backup file remain explicit optional features. Selecting a file stores its handle only in memory for that session. These private downloads must stay outside the public repository. Treat them as confidential copies of Supabase data.

## GitHub Pages

The output in `dist/` is static HTML/CSS/JS and works under a repository subpath such as `/team-dashboard/`. Asset links, including the favicon, are relative to the page so they stay inside that subpath. There are no Worker routes or old hosting bindings. Configure the three public build settings as repository Actions variables and select GitHub Actions as the Pages source.

`pages.yml` (Deploy static dashboard) publishes on every push to `main` and can still be started with `workflow_dispatch`. Its build job runs the tests and `audit:public` before the site is uploaded. The check workflow also runs on pushes to `main` and `dashboard-public`. Publish only after Supabase has been provisioned, data imported and authorization verified; a push to `main` deploys the site.

The favicon is a placeholder: a plain circle in the primary button blue (`#087dff`) on a transparent background. Replace `public/favicon.svg`, `public/favicon.png` and `public/apple-touch-icon.png` to change it.

## Backups

Scheduled backlog backups are not part of this public repository and must not be added here. They run only from the separate private repository `din-bye-png/team-dashboard-backups`, which already has its own workflow. Do not commit backup secrets, service-role keys, database passwords, GitHub tokens, or exported backlog files to this repository.

## Checks

Tests exercise the migrations in an isolated Postgres-compatible PGlite instance with Auth roles, anonymous and nonmember denial, membership escalation rejection, direct-write rejection, revision conflicts, invalid state, atomic snapshot failure and admin-only import. They do not substitute for checks against the configured live Supabase project with two real accounts. The public-file audit scans the source and built bundle for recognized credentials, former hosting IDs and disallowed export/media files; it is a safeguard, not a guarantee against every possible disclosure.
