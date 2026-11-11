# v1.14.12 update

All 21 supported test commands pass via verify-both.py. Eight shared-backend cases include planned order, priority defaults and validation, stale/repeated move rejection, completed-cut protection, adjacent pending moves around completed entries, backup order preservation, and older-client priority preservation.

Local/shared browser checks cover Move up/down, priority selection in cards and editor, Priority first versus planned views, disabled movement while searching/sorting, new-cut placement, reloads, offline snapshots, public roles, keyboard focus, and mobile controls. Existing notes, material cuts/leftovers, inventory, backups, auth, mentor notice, and mill-selection checks pass.

The shared API deployment is active. No schema or credential change was required. Production verification uses read-only app requests. Google Apps Script remains archived.
