# Version 1.14.0 checks

Shared UI loads Google workspace data through one request when supported; the local fallback remains compatible. Google requests queue and retry only explicit pre-execution lock contention. Reports do not rebuild during reads; unchanged inventory does not rewrite spreadsheet tabs.

New shared-database tests check persistent sessions, protected writes, backups, revision conflicts, and origin/action boundaries. Chromium checks verify two browser contexts share data and unconfigured database setup is explicit. New GitHub code uses local service doubles; production Supabase remains to be configured.

Current verification: all 18 test commands passed, including 13 Chromium suites and 54 unit/backend cases. The Pages shared-data browser check uses the real handler with a local database double; production Supabase is not yet configured.

Earlier checks:

# Version 1.13.0 verification

Google inventory now projects into readable Mills and Material Stock tabs in the existing app spreadsheet. The local edition remains compatible and offline. Both use the same release version, interface, and data rules.

Twenty Google server tests pass, including new inventory view checks for separate tool/sheet records, numeric counts and dimensions, literal leading-zero IDs and notes, zero versus uncounted quantities, material renames, stable sheet IDs, deleted entries, existing-data setup, transient view-write failures with visible warnings/retry, and preservation of unrelated existing sheet contents. Committed app saves remain intact if a report refresh fails.

The full local/Google browser suites cover admin/admin, custom passwords, public browsing, data CRUD, photos, inch migration, themes, mobile navigation, JSON transfers, and actual portable offline HTML. Unit checks cover four inch migrations, nineteen local password/storage stress tests, and five shared-engine parity tests.

Google services are mocked locally; no live account deployment was performed. Update the existing Apps Script files, run setupDatabase, and deploy a new version to install. Old numbered releases are preserved.
