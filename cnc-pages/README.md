# CNC Tool Database — GitHub Pages + Supabase

GitHub Pages hosts the interface. Supabase stores shared inventory, images, cutting settings, password hashes, and temporary sessions. The browser never receives the database service-role key or credential records. App editing uses admin/admin and optional additional passwords. Visitors can browse without an account.

Until the database is connected, the site shows a setup message and a link to preview.html. That preview uses the offline app: data saves in that browser only. It is not a shared database. No existing Google inventory has been copied automatically.

## Connect a new free Supabase project

1. Create a project at https://supabase.com/dashboard in a region near your shop. Keep its database password in your password manager.
2. Open SQL Editor, paste the complete contents of supabase/schema.sql, and run it. RLS blocks direct browser access to database and session records; the API controls reads and editing.
3. In your GitHub repository Settings → Secrets and variables → Actions, add SUPABASE_PROJECT_REF (the project ref from its URL) and SUPABASE_ACCESS_TOKEN (a token created in your Supabase account settings). Enter the access token directly in GitHub, not in chat or in a code file.
4. In GitHub Actions, run **Deploy shared database API**. It deploys the Edge Function from this repository. Supabase supplies its URL and server credentials automatically to the function. Alternatively, with Supabase CLI installed: `supabase functions deploy cnc-api --project-ref YOUR_PROJECT_REF --workdir cnc-pages --no-verify-jwt`.
5. In public/config.js (or root config.js on GitHub), enter the Project URL and publishable/public key from the Supabase dashboard. These are public connection settings. Never put the service-role key here. The standard project URL ends in .supabase.co.
6. Open the GitHub Pages site. Login for editing is admin/admin; additional passwords can be added in Settings. Test saved inventory in a separate browser to verify the live shared database.

The supplied workflow belongs in .github/workflows/deploy-database.yml at the repository root. Its maintained source is workflows/deploy-database.yml. The default allowed browser origin is https://alpaca823.github.io; set the Edge Function secret CNC_ALLOWED_ORIGINS to a comma-separated list if adding another production origin.

## Move existing data

In the old Google app choose Settings → Export JSON backup. In the new shared site choose Settings → Import JSON backup. This copies data and images, preserving sheet entry IDs, while validating the full backup. Passwords do not transfer; add shared passwords again if needed. The old Google Sheet is left intact and does not sync with the new database. You can also download an independent offline HTML snapshot.

## Maintain and publish

The interface is built from cnc-local canonical sources. The shared API uses a generated version of the same validation, CRUD, migration, and password logic. It loads private database state on the server and uses an atomic revision check to prevent overlapping saves from overwriting each other. Tokens are stored by hash; credential/session tables are server-only.

Run python build-both.py from the full source root to build all supported editions. This writes public/index.html, public/preview.html, and the generated server engine. Copy public/ contents into the GitHub repository root for branch-based GitHub Pages. Keep local HTML and Apps Script editions available. A website build does not deploy the Supabase function; run the database workflow after changing its code. Back up data through the app before upgrades.

Tests use a local database-service double and Chromium; live Supabase connection, billing-plan limits, and production deployment must be verified separately. Free hosting/database plans have provider limits. Do not describe the browser-only preview as shared storage.
