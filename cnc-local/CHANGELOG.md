# Change log

Release tracking begins with v1.14.8. Earlier releases remain available in their immutable numbered archives. Every subsequent release must increment the version and add an accurate entry here.

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
