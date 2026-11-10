# v1.14.2 small update

Four shared-backend tests pass, including valid purchase URL persistence across inventory edits, backup export/import, and removal, plus atomic rejection of script/data URLs, credentials in URLs, invalid types, and oversized URLs.

The purchase browser suite passes against both local HTML and the shared Pages build: mill-form save, public mill details, low-inventory dashboard and table links, safe new tabs, reload persistence, and 390 px layout. Existing Pages and local workspace integration checks also pass.

No database schema change is needed. The canonical mill validator supplies the same behavior to local and shared editions. Existing mills without links remain valid. Google Apps Script remains archived.
