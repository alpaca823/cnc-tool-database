# v1.14.16 update

All 25 supported test commands pass via verify-both.py. Fourteen shared-backend cases cover public cut creation, editing, priorities, moves, deletion, reopening/completion, logged snapshots, stale writes, deletion anchors/dependencies, and admin undo of complete planning histories after backup import. Mill, material, note, and settings administration remain protected.

Local/shared browser coverage verifies full Cut List use without login, Dashboard upcoming cuts in planned order, priorities/quantities, Add cut, Mark done, updates after completion, admin-only undo, and working undo chains in downloaded offline copies. Existing inventory, reports, visit totals, themes, credentials, images, mentor notice, and portability tests pass.

The shared API deployment is active; production checks read the workspace and reject an unauthenticated undo request without editing shop records. No schema changes were needed. Google Apps Script remains archived.
