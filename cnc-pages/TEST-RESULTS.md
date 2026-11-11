# v1.14.13 update

All 22 supported test commands pass (full suite plus the corrected existing-modal selector rerun). Eleven shared-backend cases cover public reporting, positive stock checks, stale/repeated submissions, admin-only history/undo, newest-first undo chains, used-leftover protection, later-edit protection, backup version rebinding, and legacy imports.

Local/shared browser tests verify visitors reporting broken mills, material cuts, and completed jobs; admin undo restores quantities, removes created leftovers, and reopens cut jobs. Downloaded offline copies retain functional undo history. Optional text renders literally, mobile reporting fits, and existing authentication, cut ordering/priorities, notes, materials, backups, and mentor-notice checks pass.

The shared API deployment is active. No schema or credential changes were required. Production verification uses read-only app requests and a rejected unauthenticated history request; it creates no reports. Google Apps Script remains archived.
