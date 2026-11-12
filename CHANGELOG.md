# Change log

Release tracking begins with v1.14.8. Earlier releases remain available in their immutable numbered archives. Every subsequent release must increment the version and add an accurate entry here.

## 1.14.22

- Added consistent spacing between public Settings cards and nested admin backup/password cards on desktop and mobile.
- Preserved Dashboard as the home page and the What’s new subpage/back navigation.
- Included the pending test-only v1.14.21 follow-up in this release; it was not published separately.

## 1.14.21

- Updated the shared setup regression test to check the visible global setup notice instead of the now-hidden Feeds & Speeds panel.
- Dashboard remains the default home page introduced in v1.14.20.

## 1.14.20

- Made Dashboard the initial page on opening and reloading both supported editions.
- Updated initial markup and navigation so Dashboard is shown immediately, before data finishes loading.
- Kept the mentor notice on Feeds & Speeds.

## 1.14.19

- Separated Dashboard summary cards, inventory alerts/quick access, and the Cut List with consistent vertical gaps.
- Removed the duplicate Dashboard stats margin so the new spacing stays consistent across desktop and mobile layouts.

## 1.14.18

- Added optional drawing attachments to cuts: PDF, SVG, DXF, PNG, JPG, and WebP, with upload/removal controls.
- Added image previews and file downloads in the Cut List and existing Dashboard cut queue.
- Added file-type/size validation, metadata-only workspace loading, and on-demand file retrieval.
- Stored each drawing once; undo snapshots reference file IDs, and backups/offline copies retain drawings and attachment undo history.

## 1.14.17

- Added a public What’s new page under Settings in both supported editions.
- Added brief release highlights, with recent versions first and earlier updates collapsed.
- Added build checks requiring current-version highlights and short, factual bullets tied to the change log.

## 1.14.16

- Opened Cut List creation, editing, priorities, reordering, reopening, deletion, and completion to visitors.
- Logged public plan changes with admin-only undo, version checks, dependency checks, and backup/offline history support.
- Added upcoming Cut List items to the Dashboard in planned order, with priorities, quantities, Add cut, Open Cut List, and Mark done controls.
- Kept mill, material, note, and settings administration protected.

## 1.14.15

- Added a built-in website visit counter, with today and total counts visible to everyone in Settings.
- Counts page openings site-wide using anonymous tab sessions, with a 30-minute repeat-count cooldown and Eastern Time daily totals.
- Kept counter requests independent of inventory loading, with isolated failure/retry handling.
- Stored aggregate daily counts and anonymous hashes (expired hashes are pruned on a subsequent visit after one day) in separate protected tables; no ad scripts, names, account details, or IP addresses are collected by this counter.
- Kept local HTML/preview use uncounted and excluded website statistics from inventory backups and restores.

## 1.14.14

- Added Material stock to Inventory, showing full sheets and leftovers with material, dimensions in inches, thickness, quantity, and availability.
- Expanded inventory search and summary totals to include material stock while keeping mill counts clearly labeled.
- Added public Record cut and View material actions plus admin Add material stock and Edit stock actions, using the existing material records.
- Preserved existing stock, reporting/undo permissions, and the prior removal of Location from Inventory.

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
