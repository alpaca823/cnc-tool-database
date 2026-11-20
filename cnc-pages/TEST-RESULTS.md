# v1.14.29 validation

Passed: 21 shared-backend cases, including new tests proving settings cannot create an unknown mill on add or edit, rejected operations leave data unchanged, and existing backups/settings restore correctly. Four standalone migration/inch-backup cases also passed.

The Feeds & Speeds admin browser suite passed in both editions: no new-mill controls in Feeds & Speeds, creation through the Mills tab, dropdown selection, saves/edits for registered mills, API rejection of unknown mills, refresh/cancel, mobile light/dark layouts, preserved lookup results, mentor notice and admin protection. What’s new/version browser checks passed in both editions. Legacy test setup helpers now create missing fixture mills through Mills.

The canonical backend was regenerated for the shared edition. No schema, credentials, stored identifiers or backup formats changed. Production inventory is not edited during deployment. Drawing placement remains pending admin-only beta and is excluded from public highlights. Google Apps Script remains archived. Focused validation is recorded here; a full legacy-suite pass is not claimed.
