# v1.15.2 validation

Passed: 23 shared-backend cases, including atomic drawing-backed completion. Missing drawings, stale jobs/stock, invalid placement and database revision conflicts leave job/material state unchanged. A successful action writes one database revision with material and completion reports identifying the selected drawing and stock. Backup/import and newest-first admin undo restore both domains; later job edits block unsafe undo.

Passed in both supported editions: the new completion browser suite (Dashboard/Job Queue popup, required choices, cancel, locked drawing/stock choices, placement, invalid bounds, recording, audit and undo); standalone public drawing placement; extensive DWG/DXF/SVG placement; public What’s new/version checks. Existing public planning, report/undo and cut-list browser suites pass with explicit legacy completion-RPC compatibility coverage after popup cancellation. The new UI flow is covered separately end to end.

The job remains pending until the combined cut is recorded. Canceling or navigating away does not save. A supported drawing and available stock are required; no compatible drawings prompts attaching DWG/DXF/SVG to a Job Queue job. Completion finishes the whole job; one stock piece is consumed per recording. Material and completion undo are separate logged reports.

No schema, credentials, default login, backup format or production inventory changes are required. README credentials remain omitted. The Beta Testing tab remains empty and admin-only. Google Apps Script remains archived. Focused validation is recorded; a full legacy-suite pass is not claimed.
