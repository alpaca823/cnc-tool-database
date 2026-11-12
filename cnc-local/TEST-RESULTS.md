# v1.15.0 beta update

Passed: 18 shared-backend cases, including admin authorization for shape cuts, malformed/self-crossing/out-of-bounds/overlapping outline rejection, stale-write protection, one-sheet consumption, repeated remnant cuts, backup restoration, ordinary whole-piece reporting, and conflict-safe admin undo.

Passed in both editions: the new stock-beta browser suite (no anonymous beta DOM, SVG/DXF parsing, physical drag/rotation, invalid placement, recording, Cut List drawing reuse, downloaded offline geometry, mobile fit, and removal on logout). Existing shared-site integration, public planning, Settings spacing, report/undo, inventory/material, and What’s new browser checks passed.

The shared function was deployed with its existing authentication model. A live public workspace read and an unauthenticated beta-save rejection passed without changing production records. No schema, credentials, or third-party dependencies changed.

A broad legacy-suite attempt was stopped after older local tests failed on stale home-page/navigation/version expectations. It is not claimed as a full-suite pass. Focused supported-edition checks above passed against this release.

Beta limits: a single closed straight-edged outline; no curves, drawing holes, DWG/VCarve parsing, kerf compensation, or automatic disconnected-scrap separation. Earlier cutouts may not touch or overlap a new cut. Stock bounds remain fixed, with cutouts stored in backups. Google Apps Script remains archived.
