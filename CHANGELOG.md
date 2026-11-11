# Change log

Release tracking begins with v1.14.8. Earlier releases remain available in their immutable numbered archives. Every subsequent release must increment the version and add an accurate entry here.

## 1.14.13

- Allowed visitors to record material cuts, complete Cut List items, and report one broken mill without signing in.
- Logged reports with timestamps and optional reporter/details, and added admin-only Settings → Report history & undo.
- Added atomic undo for quantities, created leftovers, and completed cuts; newer edits block unsafe undo, and repeated undo cannot apply twice.
- Preserved report history and undo links in JSON backups and offline snapshots, with legacy backups remaining supported.
- Kept planning, inventory editing, and all other administrative actions protected.

## 1.14.12

- Added Low, Normal, High, and Urgent cut priorities, editable in the form or directly on a cut.
- Added Move up/down controls and numbered positions for pending cuts; new cuts append to the existing plan.
- Added a Priority first view without changing the saved cutting order. Reorder controls are disabled while searching or sorting by priority.
- Preserved priorities and order in shared data, JSON backups, imports, and offline snapshots. Older cuts default to Normal priority and keep their existing order.
- Protected priority changes and adjacent moves against stale edits.

## 1.14.11

- Added pin/unpin controls for notes; pinned notes appear first for all viewers.
- Added the Cut List tab with job names, quantities, materials, optional dimensions in inches, notes, completion/reopen controls, search, and status filters.
- Added Record cut to material sheet entries: atomically removes one original piece and optionally creates one smaller leftover, retaining material, thickness, and location.
- Added validation and stale-edit protection for these operations; planning a cut does not automatically deduct inventory.
- Included pin state and cut-list entries in shared loading, JSON backups, imports, and offline snapshots. Older backups remain compatible.

## 1.14.10

- Added a Notes sidebar tab with titles, multiline text, and search.
- Admins can create, edit, and delete notes; visitors have read-only access.
- Included notes in shared workspace loading, local storage, JSON backups, imports, and offline snapshots. Older backups open with an empty notes list.
- Added validation and stale-edit protection for note updates and deletions.
- Fixed duplicate-password checks for case variants and corrected fallback-password messages; existing credentials remain valid.
- Updated outdated authentication and navigation tests for the current password and Notes tab.

## 1.14.9

- Made the entire mill row selectable, including its number, specifications, and thumbnail.
- Kept the details panel matched to a visible mill when filtering; no matches clear the selection.
- Preserved independent Edit and purchase-link actions.

## 1.14.8

- Removed the Location column, storage-location input, and location search from the tool Inventory page. Material sheet locations remain available on Materials.
- Preserved existing tool locations when saving inventory counts and in backups.
- Added version-checked release logging and included the change log in both supported editions and source downloads.
