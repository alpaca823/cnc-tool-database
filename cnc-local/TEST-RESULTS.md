# v1.16.4 validation

Documentation/release change only. Passed supported-edition build, What’s new browser checks in both editions, README app-workflow structure, relative-link and credential-omission checks, and whitespace checks. No runtime, ownership, account or database changes.

# v1.16.3 validation

Documentation/release change only. Passed: supported-edition build; README relative links and credential-omission checks; What’s new browser checks in both editions; isolated rebuild from the handoff source file set, producing the exact website with active deployment workflows included; whitespace checks. No ownership, permission, credential, production database or server changes were made.

# v1.16.2 validation

Passed in both editions: existing job form checks; measured job-editor/requirements gaps at 1440, 1024 and 390 pixels in light and dark themes (22px desktop, 17px mobile); input spacing and no horizontal overflow; requirements copy excludes SVG and whole-inch rounding. Existing Settings and Dashboard spacing browser checks also passed. No backend or data-rule changes.

# v1.16.1 validation

All 37 verification commands were exercised. Outdated sidebar, public-action and release-version expectations were corrected; affected tests passed on rerun. No unresolved test failures remain. The final generated release also passed the focused checks below.

- Shared backend: 25/25 cases, including required job fields, fraction rejection, material choices, CAD references and inch rounding, metadata retention, backup/import, conflict-safe undo, forged admin rejection and atomic whole-stock completion (including simulated database conflicts).
- Both editions: job form requirements, decimal validation, SVG sizing and unit changes, selected drawing persistence, required editor identity, approval metadata, unsafe SVG rejection without execution, offline example image, dialog keyboard/mobile behavior.
- Both editions: job-only completion drawings, missing-drawing skip, visitor stock requirement, authenticated admin shortcut, placement, stock/completion atomic recording and admin undo.
- Regressions: real DWG conversion and byte preservation, DXF/ARC/complex outline parsing, public placement and stock previews, inventory/materials, mill/feeds editing, password cases, backup/offline HTML, notes, queue ordering, themes/mobile layout, visitor counters and What’s new.
- Release integrity: root Pages entrypoints equal canonical generated builds; highlights meet length/count rules; git diff whitespace check passed.
- Live API v20: workspace readable, forged admin completion rejected, missing required material rejected; public database contents unchanged by validation checks.

Rollback source is preserved on the exact baseline and metadata-compatible backup branches. Production inventory was not modified for testing. CAD scale and the intended view require user verification; non-CAD attachments do not calculate dimensions. Existing storage limits still apply.
