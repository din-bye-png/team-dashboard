# Security boundaries

Public: source code, database schema, Supabase project URL, publishable API key and workspace UUID.

Private: task titles and notes, assignee names, history, Auth identities, database exports, credentials, backup contents and local working screenshots.

Authorization is enforced by Postgres membership checks, RLS and restricted RPC grants. Hiding data in the interface is not an authorization boundary. Authentication alone does not grant workspace membership. No registration or membership-administration endpoint is exposed by this application.

Do not disclose a vulnerability together with real task data, cookies, access tokens or admin secrets in a public issue. Revoke exposed credentials in the relevant provider and use private reporting to the repository owner. Removing a leaked file from the latest commit alone does not remove it from Git history.

The deployment is not ready to protect real data until migrations, Auth configuration, workspace membership and live permission checks have been completed. The default unconfigured build remains locked.
