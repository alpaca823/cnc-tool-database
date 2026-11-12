# Admin-only beta validation — public version 1.14.24

The public version and What’s new/CHANGELOG are restored to the pre-beta release. Pending stock-beta work is tracked separately in BETA-CHANGELOG.md and packaged with --beta; immutable numbered archives remain unchanged.

Passed: 5 drawing-parser tests covering joined/reversed edges, open legacy polyline closure, annotation removal, malformed geometry rejection, semicircular ARC plus LINE joins, wrapped arc angles, CIRCLE area, and positive/negative bulges in both modern and legacy 2D polylines. Circular edges use segments no larger than 2 degrees.

Passed: 19 shared-backend regression tests. The stock-beta browser suite passes for local/shared editions, including a real AutoCAD 2018 DWG ARC fixture, curved-outline preview, clean DXF export, recording a curved cut and admin undo, original polygon DWG conversion, offline DWG import, grouped Onshape-style edges, annotation omission, dragging/rotation, and admin-only access/logout. Public What’s new rollback checks pass for both editions.

Circular geometry is represented by short straight segments for stock tracking, not machine toolpaths. Splines, nested/touching/overlapping outlines, branching edges and VCarve remain unsupported. This records focused beta validation, not a full legacy-suite pass. No schema, credentials or production inventory data changed. Google Apps Script remains archived.
