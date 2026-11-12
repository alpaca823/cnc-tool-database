# v1.14.18 update

All 27 supported test commands pass via verify-both.py. Sixteen shared-backend cases include drawing validation, file/combined size limits, duplicate storage avoidance, missing-reference rejection, old-client preservation, metadata-only loading, inactive-file access rejection, backup import, cut deletion/undo, and attachment removal/undo. Undo history stores IDs rather than duplicate file bytes.

Local/shared browser tests verify public uploads, raster previews, document downloads, safe SVG download-only behavior, existing Dashboard drawing links, file removal, size errors, admin undo, and functioning drawing downloads from fresh offline copies. Existing planning, reports, inventory, visitor totals, credentials, concise release notes, themes, and mentor notice pass their checks.

The shared API is deployed and live metadata/missing-file checks pass without editing production cuts. No schema or credential changes were needed. Google Apps Script remains archived.
