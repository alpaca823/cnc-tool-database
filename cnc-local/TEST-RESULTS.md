# Admin-only beta validation — public version 1.14.24

Public VERSION, CHANGELOG and What’s new stay at the pre-beta release. Pending work is logged in BETA-CHANGELOG.md and packaged with --beta. Numbered archives remain unchanged.

Passed: 20 shared-backend tests and 8 parser/geometry tests. Coverage includes 5,000-vertex outlines, over-limit and self-intersection rejection, complex footprint backup/import and safe undo, curve sampling, reversed/open edges, rounding noise, constant drawing elevation, paper viewports, nonplanar/tilted rejection, closed tab junctions, nested details and duplicate edges.

Passed in both supported editions: stock-beta browser checks including the actual existing shared DWG (read from production, exercised only in isolated fixture databases), reused from a Cut List attachment, internal-reference preview, recording and undo; and a 600-vertex DXF import/record/undo. Original DWG ARC/polygon fixtures, offline conversion, dragging/rotation, footprint DXF export, grouped cuts and admin-only visibility/logout remain covered. The private drawing remains outside tracked source/release assets.

Passed: public What’s new/version rollback, combined inventory/material browsing, and public report/admin undo regression suites. The updated shared engine retains existing credentials and API authorization. No schema change or production inventory write is needed.

Limits are 5,000 vertices per outer outline, 20,000 total per stock footprint, and 10,000 input entities. Curves use short segments. Internal holes/details are preview references; recording and footprint DXF export use the outer part boundary. Loose construction branches, splines, tilted/noncoplanar drawings and VCarve remain unsupported. Google Apps Script remains archived. This is focused beta validation, not a full legacy-suite pass.
