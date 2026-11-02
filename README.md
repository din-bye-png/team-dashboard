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

1. Choose a new Supabase project; apply `supabase/migrations/0001_dashboard.sql` through its SQL editor or migration tooling.
2. Use Supabase Auth to create or invite each approved user. Disable public signups if the project is invite-only. Knowing the site URL or creating an Auth account does not grant membership.
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

Sessions use the official Supabase SDK with in-memory session storage and automatic token refresh; persistent storage and URL-session detection are disabled. Tokens and tasks are not saved in localStorage or IndexedDB. Reloading the page requires signing in again. Sign-out clears displayed tasks, forms, dialogs, cached plan and the selected local backup file. Existing access JWTs can remain valid until expiration; use appropriate token lifetime and administrative revocation practices for the deployment.

JSON export and a user-selected local backup file remain explicit optional features. Selecting a file stores its handle only in memory for that session. These private downloads must stay outside the public repository. Treat them as confidential copies of Supabase data.

## GitHub Pages

The output in `dist/` is static HTML/CSS/JS and works under a repository subpath. There are no Worker routes or old hosting bindings. `pages.yml` has only a manual trigger, so publishing code does not switch an existing website automatically. Configure the three public build settings as repository Actions variables and select GitHub Actions as the Pages source before deploying.

The check workflow runs on pushes to `main` and `dashboard-public`. Publishing code does not deploy the website automatically: the Pages workflow has only a manual trigger. Deploy only after Supabase has been provisioned, data imported and authorization verified.

## Daily private backup

`backup.yml` prepares a daily run at 02:17 UTC (06:17 at UTC+4). Its job remains disabled until the repository Actions variable `BACKUP_ENABLED` is set to `true`; leave this unset until the destination, credentials and a manual backup have been verified. Scheduled triggers require the workflow on the default branch. GitHub schedules may be delayed. No data export runs merely because this source has been published.

Create a **separate private** backup repository and initialize its default branch. Set these Actions secrets in the application repository:

- `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `WORKSPACE_ID` for the trusted admin backup RPC.
- `BACKUP_REPOSITORY` in `owner/name` form.
- `BACKUP_REPO_TOKEN`: a fine-grained GitHub token restricted to that backup repository, with metadata read and contents write.

The script verifies that the destination is private and separate from the application repository before reading the backlog. It checks private visibility again before uploading, validates the export and writes a timestamped JSON snapshot directly to that repository. It never uploads a public Actions artifact or logs the backlog. Limit access to backup repo settings too: making that repo public later would expose its history. The workflow does not impose automatic permanent deletion or a retention policy. Auth password hashes, Auth service secrets and full database disaster recovery are outside the scope of this logical backlog backup.

## Checks

Tests exercise the migration in an isolated Postgres-compatible PGlite instance with Auth roles, anonymous and nonmember denial, membership escalation rejection, direct-write rejection, revision conflicts, invalid state, atomic snapshot failure and admin-only import. They do not substitute for checks against the configured live Supabase project with two real accounts. The public-file audit scans the source and built bundle for recognized credentials, former hosting IDs and disallowed export/media files; it is a safeguard, not a guarantee against every possible disclosure.
