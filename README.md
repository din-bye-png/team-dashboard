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

The preview binds only to localhost. Without configuration the page shows a locked sign-in screen and makes no backend requests. There is no demo-data fallback and no task data is loaded from browser storage.

## Appearance

The top-right theme button offers Light, Dark and System modes; System is the default and follows live OS appearance changes. The sign-in screen uses the fixed black and pink Figma design with a white form. Only the appearance preference (`team-dashboard-theme`) is saved to localStorage, and changes synchronize between tabs. If browser storage is unavailable, switching still works for the current page. `public/theme.js` resolves the theme before CSS loads. The supplied vector logo is in `public/team-logo.svg`; CSS adapts its colour to each theme.

## Supabase setup

1. Choose a new Supabase project; apply the migrations in `supabase/migrations/` in numeric order through its SQL editor or migration tooling. The second migration revokes `EXECUTE` on the hosted `public.rls_auto_enable()` function and adds the missing foreign-key indexes. It does not change membership policies or how saves work.
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

### Task context and materials

Apply `supabase/migrations/0003_task_context_and_materials.sql` before deploying the task-card update. It adds validation for optional context, links and attachment metadata, and creates the private `task-attachments` bucket. Current workspace members can upload and download files in their workspace folder; anonymous visitors and nonmembers have no access. Files are limited to 20 MiB each, 20 per task; links are limited to 30. The existing plan JSON size limit still applies to text and metadata.

Apply `supabase/migrations/0004_public_task_passports.sql` before deploying public passports. It adds a private share-token table and three narrowly scoped RPCs. A member can create or revoke a random link from a saved task card. The link opens `share.html#token=…` without sign-in and shows only that active task's title, owner, status, dates, context, pinned links, notes and checkpoints. Public callers cannot read the plan, history, trash, members or attachment paths, and cannot write anything. Attached files remain private and are excluded from the passport. Removing a task from the active plan revokes its share automatically; restoring it or an old plan version does not restore the old link. Publishing again creates a new token. A saved task's passport reflects later edits. The fragment keeps the token out of ordinary HTTP request paths and referrers; treat it as a bearer link and share it only with intended readers.

The task card has editable context and materials on the left and settings/checkpoints on the right. Icons distinguish Figma, documents, folders, PDF, images, spreadsheets, archives and other files. Attachments upload when saving, followed by the usual revision-checked plan save. Failed saves retain the draft and uploaded paths for retry. Cancelling before save does not upload files. Unlinking a saved file removes its task reference; the object is retained so history and trash can still restore it. Uploads followed by an abandoned/failed plan save can leave unreferenced objects; cleanup must account for current tasks, trash and retained versions.

JSON backups include context, links and attachment metadata, **not attachment bytes**. File objects need a separate Storage backup; restoring JSON into another project does not transfer those objects. A `#task=…` URL opens the task after sign-in. Existing tasks without the new fields remain compatible.

The application uses an explicitly assigned workspace. `dashboard_members` links that workspace to Supabase Auth users; members can edit the shared plan. `dashboard_plans` stores the current ordered tasks and trash as JSONB. `dashboard_versions` stores snapshots with server-generated timestamps and authenticated authors.

Anonymous visitors have no table access. Authenticated nonmembers have no access to other workspaces. Membership cannot be self-assigned. Browser writes go through a membership-checked RPC with row locking, server-side JSON validation and revision comparison; snapshots and writes are atomic. The browser cannot write tables directly or invoke admin import/backup functions. Cleanup of old history and trash runs during a successful write after 30 days; the latest revision remains.

Invitation and recovery links open a password creation form. Expired or used links show a request for a fresh email. The page removes Auth tokens from the address before contacting Supabase, verifies the session, and accepts a new password only in the invitation/recovery flow. After saving, the user signs in with that password; workspace membership is still assigned separately by an administrator. Reloading before setting the password requires a fresh link.

Sessions use the official Supabase SDK with tab-scoped sessionStorage and automatic token refresh; automatic URL-session detection is disabled. If storage is unavailable, sessions fall back to memory. Email-link sessions are handled explicitly. Tokens and tasks are not saved in localStorage or IndexedDB. Reloading restores and verifies the session before loading the plan. Closing the tab normally clears the session; browser restore/reopen features may restore sessionStorage too. Invitation/recovery credentials remain in memory until password setup is complete. Sign-out clears displayed tasks, forms, dialogs, cached plan and the selected local backup file. Existing access JWTs can remain valid until expiration; use appropriate token lifetime and administrative revocation practices for the deployment.

JSON export and a user-selected local backup file remain explicit optional features. Selecting a file stores its handle only in memory for that session. These private downloads must stay outside the public repository. Treat them as confidential copies of Supabase data.

## GitHub Pages

The output in `dist/` is static HTML/CSS/JS and works under a repository subpath such as `/team-dashboard/`. Asset links, including the favicon, are relative to the page so they stay inside that subpath. There are no Worker routes or old hosting bindings. Configure the three public build settings as repository Actions variables and select GitHub Actions as the Pages source.

`pages.yml` (Deploy static dashboard) publishes on every push to `main` and can still be started with `workflow_dispatch`. Its build job runs the tests and `audit:public` before the site is uploaded. The check workflow also runs on pushes to `main` and `dashboard-public`. Publish only after Supabase has been provisioned, data imported and authorization verified; a push to `main` deploys the site.

The favicon is a placeholder: a plain circle in the primary button blue (`#087dff`) on a transparent background. Replace `public/favicon.svg`, `public/favicon.png` and `public/apple-touch-icon.png` to change it.

## Backups

Scheduled backlog backups are not part of this public repository and must not be added here. They run only from the separate private repository `din-bye-png/team-dashboard-backups`, which already has its own workflow. Do not commit backup secrets, service-role keys, database passwords, GitHub tokens, or exported backlog files to this repository.

## Checks

Tests exercise the migrations in an isolated Postgres-compatible PGlite instance with Auth roles, anonymous and nonmember denial, membership escalation rejection, direct-write rejection, revision conflicts, invalid state, atomic snapshot failure and admin-only import. They do not substitute for checks against the configured live Supabase project with two real accounts. The public-file audit scans the source and built bundle for recognized credentials, former hosting IDs and disallowed export/media files; it is a safeguard, not a guarantee against every possible disclosure.

## Branded sign-in page

The local sign-in design follows Figma frame `31:856`. Supplied graphics and the Lebowski heading font live in `public/assets/` and are copied into `dist/assets/` during build. The Telegram contact opens `https://t.me/nikitagrosu`. Existing Supabase sign-in and password setup remain connected.

Run `npm run build` then `PORT=4175 npm run preview` for a separate local preview. Transfer the contents of `dist/` when ready to release.

## Interface refresh (2026-11-06)

The dashboard loads ui.css after its base styles. It includes the reviewed light/dark palette, compact filters, centered date controls, branded heading, grouped task editor, and custom date/status popovers. The live Supabase backend, configuration, authentication, migrations and task palette are unchanged. Task controls retain native form values for saves and validation. Calendar tests cover leap years and month boundaries; editor guard tests cover discarded changes. SF Symbols are rendered as monochrome masks. Only reviewed assets are permitted by the public-file audit.
