# v1.14.10 update

All 19 supported test commands pass via verify-both.py. Notes checks cover local/shared create, edit, delete, search, read-only visitors, literal text rendering, stale updates, invalid imports, old backups, JSON exports, offline HTML downloads, and mobile layout. Mill-selection regressions pass, including whole-row clicks and filtered results. Authentication stress tests pass (19 cases); case variants cannot duplicate a password, and existing credentials remain valid.

The shared API deployment is active and its live public workspace response includes notes. No schema change was needed. No production inventory records or credentials were edited. Google Apps Script remains archived.
