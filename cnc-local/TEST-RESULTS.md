# v1.14.11 update

All 20 supported test commands pass via verify-both.py. Seven shared-backend cases cover protected writes, stale edits, backups, legacy imports, pin preservation, cut-plan validation, stock independence, atomic material deductions, smaller and rotated leftovers, zero-stock rejection, and invalid-size rejection without writes.

Local/shared browser tests verify pin/unpin ordering, Cut List creation/completion/reopening, search, whole-piece consumption, leftover creation, read-only visitors, offline snapshots, and mobile forms. Existing authentication stress, mill selection, inventory, materials, image, theme, mentor-notice, and portability checks pass.

Shared API deployment is active. No schema or credential change was required; production material counts were not edited during verification. Google Apps Script remains archived.
