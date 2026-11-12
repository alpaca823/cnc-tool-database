# Admin-only stock beta — pending public release

Public version remains 1.14.24 at the user’s request. Beta work does not enter public release notes or increment that version until approved for public release. Existing numbered archives are retained unchanged; these beta changes are packaged separately.

## Current work

- Added DWG/DXF ARC, CIRCLE and curved (bulged) 2D polyline support. Circular edges use segments no larger than 2 degrees for the stock footprint and clean DXF export.
- Retained grouped placement, automatic open-outline closure, annotation removal, offline DWG conversion and admin-only access.
- Removed premature beta version announcements from public What’s new, CHANGELOG and README updates.

## Earlier beta work (formerly announced prematurely)

### DWG and grouped outlines

- Added local, offline-capable DWG decoding to the admin-only stock-placement beta, including reuse of DWG Cut List attachments. Conversion runs in a disposable browser worker with a timeout and cancellation.
- Added automatic joining of matching DXF/DWG line endpoints, support for open and legacy 2D polylines, and grouped placement of separate outlines. Open outlines receive a straight closing edge highlighted in orange and called out before recording.
- Excluded text annotations such as IN PROGRESS and dimension annotations from placement; original drawing attachments are preserved, with an optional clean DXF download of the placed outlines.
- Grouped cuts consume one sheet and save all cutouts together, with atomic geometry validation, backups, and conflict-safe admin undo. Curves, branches, touching/nested outlines, and VCarve remain unsupported.
- Bundled the pinned LibreDWG browser converter, its license, source archive, and real DWG regression fixture. Refreshed release-version expectations in supported tests.

### Initial stock placement

- Added an admin-only Beta Testing tab for placing one closed, straight-edged DXF or SVG outline on stock.
- Added drawing reuse from the Cut List, dragging, inch positioning, proportional width scaling, rotation, and validation against sheet bounds and prior cutouts.
- Recording a beta cut consumes one sheet and creates a shaped remnant; existing report history and conflict-safe admin undo apply. Footprints survive backups and offline snapshots.
- Marked shaped remnants in stock lists and protected their footprint dimensions from rectangular edits. Curves, VCarve/DWG import, kerf, and automatic scrap separation are outside this beta.

