# GitHub Pages v1.14.0 verification

All three new shared-backend tests passed using the generated canonical data/auth engine and a local database-service double: persistent records and session login across fresh requests, protected writes/custom passwords, exports without credentials, optimistic revision conflict protection, origin checks, and action allowlists.

The exact Pages HTML passed Chromium integration: two separate browsers see the same material saved by admin, public controls remain read-only, browser database storage is not used, workspace reads are batched, and missing configuration reports a clear setup message. The separately labelled browser-only preview loads and accepts admin/admin. No sample inventory is published.

All 18 project test commands passed (13 Chromium suites, 54 unit/backend cases). Local and Google editions remain available. Production Supabase provisioning, SQL execution, Edge Function deployment, and connection settings are still required; no live shared-database performance benchmark or data migration is claimed.
