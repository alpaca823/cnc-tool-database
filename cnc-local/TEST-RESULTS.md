# v1.16.0 update

Passed: 19 shared-backend tests and 3 drawing-parser tests. Coverage includes grouped one-sheet cuts, atomic overlap rejection, backup/import and admin undo; shuffled/reversed LINE entities; open legacy POLYLINE closure; omission of IN PROGRESS text/dimensions; and rejection of branches, isolated lines, crossings and unsupported curves.

Passed in both supported editions: the stock-beta browser suite, including an actual AutoCAD 2018 DWG polygon fixture, direct uppercase DWG import, offline DWG decoding in a downloaded HTML copy, invalid DWG rejection, Onshape-style separate line groups, automatic closure, grouped cut recording, text omission, and clean DXF round-trip download. Existing SVG/DXF placement, physical dragging, rotation, bounds rejection, Cut List drawing reuse, admin-only DOM and logout remain covered.

Passed: What’s new, original DWG attachment/download preservation, report/undo, shared-site integration, and combined inventory/material browser suites. All binary conversion is on-device; routed tests allow no third-party conversion requests.

The DWG worker is disposable, limited to 30 seconds, and cancelled on replacement/logout. LibreDWG is pinned to 0.8.8; the build verifies the decompressed WASM SHA256. Its license, upstream source archive and wrapper source are included in supported packages.

No schema or credential changes were needed. Live API verification uses public reads and rejected unauthenticated beta writes without editing production data. Google Apps Script remains archived. This is focused release validation, not a claim that every legacy test passed.

Beta limitations: no curved, branching, self-crossing, overlapping/touching or nested outlines, VCarve parsing, kerf compensation, or automatic scrap separation. Automatically added straight closing edges are highlighted for review before recording. Original attachments are retained; clean DXF contains only placed outline geometry.
