# v1.15.1 public-release validation

Passed: 22 shared-backend and 8 parser/geometry tests. Public drawing cuts are validated and atomic, decrement one source piece, create a shaped remnant, persist history/backups and reject stale edits. Only admins can read report history or undo; undo refuses to overwrite later changes. Legacy admin drawing-cut calls remain protected.

Browser suites passed for both supported editions: public drawing placement (including signed-out DWG ARC conversion, SVG recording, footprint DXF download, Materials preview, admin undo, and anonymous placement in downloaded offline snapshots); extensive drawing/complex-outline checks; read-only stock previews; existing-mill Feeds & Speeds workflows; public What’s new; and Dashboard spacing/order at five widths in both themes. Job Queue is the first Dashboard section. The reserved Beta Testing tab has no content and remains admin-only.

Current root/local/Pages README files were checked to omit literal sign-in credentials; actual credentials and login behavior remain unchanged. Private diagnostic files remain outside source/release assets. No schema change or production inventory edits are required. Google Apps Script remains archived. This is focused release validation, not a full legacy-suite pass.

Drawing limits and geometry approximations remain documented: 5,000 vertices per outline, 20,000 per footprint, sampled circular edges, outer-footprint stock removal, no toolpath/kerf generation or automatic scrap separation.
