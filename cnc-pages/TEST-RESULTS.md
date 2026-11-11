# v1.14.15 update

All 24 supported test commands pass via verify-both.py. Twelve shared-backend cases include anonymous visitor totals, duplicate submissions, input/origin validation, inventory-independent counting, and counts surviving inventory restore. Browser coverage verifies publicly visible Settings totals, page-load counting, same-session reload deduplication, refresh, offline exclusion, theme/mobile layout, and inventory remaining usable during a pending or failed counter request. Existing inventory, reports/undo, backups, credentials, mentor notice, and planning tests pass.

The visitor SQL checks pass inside a rolled-back transaction: duplicate suppression, cooldown expiry, distinct sessions, expired-hash cleanup, Eastern timezone, and restricted table/function privileges. Security advisor findings are informational only: service-only tables intentionally have RLS and no browser policies (https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). No warning/error findings were returned.

Shared counter schema and API deployment are active. Production API verification reads totals without adding a test visit. Counts contain no names, account details, or IP addresses; expired anonymous hashes are pruned on a subsequent visit after one day. Google Apps Script remains archived.
