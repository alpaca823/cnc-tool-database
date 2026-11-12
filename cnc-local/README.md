# CNC Tool Database — v1.14.23

A single HTML file that runs offline in Chrome, Edge, or Firefox. The Materials workspace combines the material library and raw sheet inventory in one **Materials** tab. Select a material on the left to see its sheet quantities, dimensions, locations, notes, and shared photo on the right. Dashboard tool counts still use **Inventory alerts** and **Tools on hand**. The header search field follows Light, Dark, and System appearance. The sidebar, header, search, and workspace follow Light/Dark/System appearance. The workspace includes searchable libraries, a mill details panel, and inventory tracking. All cutting dimensions use inches; feed and plunge rates use inches per minute.

**A mentor must be present for all CNC cutting.** This notice remains visible throughout the workspace. The version appears at the bottom of the page.

## Open the local app

Extract the ZIP and open **CNC-Tool-Database.html** in Chrome. Use the saved file in your browser, rather than ChatGPT's built-in viewer or an email attachment preview. No Google account, installation, internet connection, or server is required.

Your data saves in this browser/profile on this computer. Keep using the same file path and profile. Browser handling of local file storage can vary; moving or renaming the file, switching browsers, or clearing browser data may open a separate store. Keep JSON backups.

## Sidebar pages

- **Dashboard:** counts of mills, materials, cutting settings, and counted units, plus low/out-of-stock tools. Counts come from saved records.
- **Feeds & Speeds:** select a mill and material to see saved RPM, feed, plunge, axial depth, coolant mist, notes, and optional images. No cutting recommendations are calculated. Admins can expand **Manage cutting settings** to add/edit/delete data for a mill/material pair.
- **Mills:** searchable tool table and selected-mill details. Admins can add/edit tool numbers, names, types, diameters, flute counts, coatings, notes, and shared tool photos. Mills can exist before they have cutting settings. Renaming a mill updates its cutting-setting references. Deleting a mill is blocked while cutting settings use it.
- **Inventory:** on-hand quantities, low-stock thresholds, and storage locations. Admins can select **Update stock** or choose a mill in the inventory form. Quantities must be whole numbers of zero or more. Unknown quantities show **Not counted**; they are not assumed to be zero. Zero is **Out of stock**; positive quantities at or below the saved threshold are **Low stock**; other positive quantities are **In stock**. Use **Refresh inventory** to reload counts before another edit. Counts are maintained manually and do not change automatically when a cut is made.
- **Materials:** shared reusable material names, photos, and sheet inventory in one page. Select a material on the left to see its sheet entries, sizes, quantities, locations, and notes on the right. Dimensions are inches; keep separate entries for different sizes or batches. Operators can browse and search. Admins can use **+ Add material** or **Edit material** to open **Manage materials**, and **+ Add sheet entry** to record inventory for the selected material. A material used by cutting settings or raw sheet entries cannot be deleted. The cutting-settings form uses this library as a dropdown.
- **Settings:** appearance for everyone, plus data backups/imports and admin password management after login.

The header search filters the active library. On Feeds & Speeds it narrows matching mill/material choices and saved-setting cards. Press **Ctrl+K** (or **Cmd+K**) to focus search. Small screens use the menu button to open the sidebar.

## Light and dark appearance

Open **Settings → Appearance** and choose **Light**, **Dark**, or **System**. System follows your operating system's preference, including changes while the app is open. In Light mode the navigation sidebar and header are light; Dark mode makes them dark. This also applies to the mobile menu. Appearance is stored separately in this browser; it does not alter cutting data or admin passwords.

## Add tools and cutting data

1. Select **Admin** in the header. Username is **admin**, and the permanent fallback password is **admin**.
2. Open **Materials → + Add material** to create the materials your shop uses and optional shared photos.
3. Open **Mills → Add mill** for tool details and an optional tool image.
4. Open **Feeds & Speeds → Manage cutting settings**. Enter a mill number, choose its material, and enter your approved cutting values. Saving settings for a new mill number also creates a minimal mill record, which you can complete under Mills.
5. Open **Inventory** to record actual tool counts and locations when ready.
6. Open **Materials**, select a material, and choose **+ Add sheet entry** to record sheet counts and sizes.

Leading zeros in mill numbers, such as `001`, are preserved. One cutting-settings entry is allowed per mill/material pair. RPM, feed, and depth must be positive decimal numbers. Plunge is optional; if supplied it must also be positive. Values may not contain commas or unit labels. Imported older metric values convert feed, plunge if present, and depth to inches once. Mill diameters are entered in inches. Records already marked as inches keep their values.

Plunge rates left blank display **Not specified**. New settings save the coolant mist checkbox as Enabled or Disabled. Older records without a mist setting display **Not specified**; their editing checkbox shows a dash until you choose a state. Saving unrelated edits preserves that unspecified state.

## Raw sheet inventory

Open **Materials** and select a material to browse its available sheets. To add inventory, sign in as admin and choose **+ Add sheet entry**. The form starts with the selected material; you can choose another material from the shared library. Then enter:

- **Number of sheets:** a whole number of zero or more.
- **Sheet length and width:** positive decimal dimensions in inches, such as `96` × `48`.
- **Thickness:** an optional positive decimal in inches, such as `0.125`. Leave it blank if unknown.
- **Storage location and notes:** optional rack, batch, condition, or other details.

Use **Save sheet entry**, **Edit**, or **Delete** to maintain the list. Counts are manual and do not change automatically when a cut is made. Zero-sheet entries stay visible until you delete them. Identical material/size entries can represent different storage batches; they are not automatically merged.

For the selected material, the page shows sheet entries, sheets on hand, and saved cutting settings. Search by material, dimensions, location, or notes; matching materials appear in the list and the detail table shows matching entries for the selected material. A material's shared photo appears in its details and beside its sheet entries. Renaming a material updates its sheet records too. A material cannot be deleted while any raw sheet entry refers to it, including a zero-sheet entry.

Raw sheets are tracked separately from cutting-tool inventory. Older data and backups without sheet records start with an empty raw inventory; no quantities are invented. Raw dimensions are always entered/imported in inches; explicit non-inch raw units are rejected rather than reinterpreted.

## Images

JPG, PNG, and WebP files up to 15 MB are accepted. Uploads are resized to at most 800 pixels and compressed for browser storage. Preview or remove an image before saving.

Material photos are shared across all mills using that material. Shared mill photos appear in cutting results when an entry has no separate tool photo. Explicitly changing a shared mill or material photo applies that image (or removal) to all associated cutting settings. Older per-entry photos are retained until that shared image is explicitly saved. Photos stay offline and travel with JSON backups and updated HTML downloads.

## Backups and moving computers

Under **Settings**, sign in as admin to use:

- **Export JSON backup:** settings, the material library, the mill library, tool inventory, raw sheet inventory, notes, and images. Unused mills/materials are included.
- **Import JSON backup:** validates the entire file, asks for confirmation, then replaces cutting data, materials, mills/tool inventory, and raw sheets. Current admin passwords remain unchanged. Older backups automatically gain material and mill libraries. Importing an older backup without raw sheets sets raw inventory to empty because imports replace the whole data snapshot.
- **Download updated HTML:** creates another standalone copy containing the current data and images. A fresh browser initializes its store from that embedded data. An existing browser store for the file takes precedence.

The app cannot silently rewrite the HTML file you opened. Use Download updated HTML when you want a file containing your latest data. Separate computers/copies do not sync automatically. Browser theme preferences and admin passwords are not included in data exports. A fresh browser always has the default admin fallback.

Before upgrading, export a JSON backup. Replace the HTML at the same path and use the same browser/profile, or import your backup into the new copy. Existing records, images, plunge/mist values, materials, passwords, and old cutting settings remain compatible. Raw material entries and their material references are included in data backups and portable HTML copies. Inventory for older tools starts untracked rather than inventing quantities.

## Admin passwords

Open **Settings → Admin passwords**. Every password uses username **admin**.

- The permanent **admin / Feds201** fallback cannot be changed or removed. Anyone who knows it can edit this local database.
- Add up to 20 labeled additional passwords of 8–128 characters. Labels are unique ignoring letter case; duplicate passwords are rejected.
- Edit a label/password, or leave both password fields blank to change only the label.
- Removing or editing a custom password signs out sessions using it; other sessions continue working. The fallback stays enabled.
- Customized passwords from older versions are retained as **Existing admin password** when needed.

Additional passwords are stored as salted hashes in this browser and omitted from JSON and HTML data exports. Sessions expire after one hour or when the page reloads. This local password gate helps prevent accidental edits; operating system accounts and file permissions govern access to the computer and files.

## Developer source and verification

The end-user app needs only **CNC-Tool-Database.html**. Source consists of `app-shell.html`, `local-core.js`, `workspace-ui.js`, `workspace.css`, `VERSION`, and `build.py`. Run `python build.py` to assemble the single HTML file. The unbuilt app shell cannot run on its own and shows startup recovery instructions.

Tests in `tests/` cover authentication, old data, units, materials, images, plunge/mist, tool and raw-sheet inventory, navigation, themes, mobile layouts, data portability, concurrency, and storage failures. See **TEST-RESULTS.md** for completed checks. This environment blocks direct file URL navigation in managed Chromium, so browser verification uses the exact HTML on an intercepted loopback origin with no external server or app network calls.

Run `node tests/raw-materials.browser.cjs` for sheet CRUD, validation, material links, search, photos, persistence, backup/HTML portability, migration, and dark/mobile layouts. Run `node tests/materials-unified.browser.cjs` for the combined Materials page, material selection, scoped inventory, editing controls, search, portability, and responsive appearance.

## Local and Google editions

The Google Apps Script edition uses the same interface and data rules. Both editions use admin/Feds201 and optional additional admin passwords for editing; visitors browse without app login. Both editions are built from the canonical source files, with a common version in `VERSION`. Run `python build-both.py` from the full source bundle root to regenerate both; `python build.py` inside this directory builds only the local edition. Future product changes should be checked in both editions.

The local edition continues to work offline with its existing browser storage. The Google edition uses a shared Google database and private Drive images. Its setup instructions are in the separate Google package. You can move data and photos between the editions using JSON exports/imports, and the Google edition can download an offline HTML snapshot. Their live databases remain independent. Admin passwords and appearance preferences are not transferred.

As of v1.14.10, supported editions are GitHub Pages/Supabase and local HTML. Google Apps Script is archived. Default username admin and password Feds201 accept any letter case.








Update v1.14.10: Notes provides searchable shop reminders. Admins can add, edit, and delete; visitors can read. Notes are shared on the website and independent in local HTML, and travel with JSON backups and offline snapshots. Imports replace notes along with the rest of the database.

Update v1.14.11: Admins can pin notes, manage the Cut List, and record material cuts. Record cut removes one original piece and optionally creates one smaller leftover of the same material/thickness/location. Cut-list completion is planning only and does not deduct stock. Pins, cuts, and leftovers are included in backups and offline snapshots.

Update v1.14.12: Cut List supports Low/Normal/High/Urgent priorities and Move up/down controls for the pending cutting order. Priority first is an optional view; new cuts append to the plan. Ordering and priorities survive backups and offline snapshots. Reordering requires an unfiltered planned-order view.

Update v1.14.13: Visitors can record material cuts, mark planned cuts done, and report one broken mill from counted inventory. Reports are logged with optional reporter/details. Settings → Report history & undo lets admins reverse unchanged reports safely, newest first. History and undo metadata travel with backups and offline copies; passwords remain excluded.

Update v1.14.14: Inventory shows mills and material stock together. Material stock lists full sheets and leftovers by size, thickness, quantity, and availability. Search covers both lists. Visitors can record cuts or open the material; admins can add/edit stock through the same material records. No duplicate stock is created.

Update v1.14.15: Website visits are counted on page opening and shown publicly in Settings. Today uses America/New_York; total visits start at installation. Same-tab refreshes count at most once every 30 minutes. Only anonymous session hashes (expired hashes are removed on a subsequent visit after one day) and daily totals are stored; no names, account details, or IP addresses are stored by the counter. Offline HTML and the local preview make no counter requests. Visitor counts are separate from inventory and excluded from inventory backups/restores. Existing sites must run cnc-pages/supabase/visitor-counter.sql before deploying the updated API.

Update v1.14.16: Everyone can add, edit, prioritize, reorder, reopen, delete, or complete Cut List items without signing in. Changes are logged, and only admins can undo them under Settings. The Dashboard shows upcoming cuts in planned order with priorities, Add cut, and Mark done. Inventory/material/settings administration remains protected. History and safe undo survive backups and offline snapshots.

Update v1.14.17: Settings → What’s new provides short release highlights for everyone. The latest three releases are shown first; Older updates expands earlier releases. Highlights are embedded in both editions and offline downloads. Future releases must update cnc-local/whats-new.json with 1–3 factual bullets (at most 100 characters each), alongside the root change log.

Update v1.14.18: Cut List items accept up to 3 drawings (1 MB each, 2 MB combined). PNG/JPG/WebP preview in the app; PDF/SVG/DXF and images download. The existing Dashboard cut queue also shows attachments. File contents load only when opened, and shared data stores each file once while undo history references its ID. Drawings are preserved in backups and offline copies; attachment edits are logged and admin-reversible.

Bug fix v1.14.19: Dashboard sections now have consistent spacing, keeping Inventory alerts and the Cut List clearly separated on desktop and mobile.

Update v1.14.20: Dashboard is the home page when opening or refreshing the website or local HTML. Feeds & Speeds remains available in the sidebar with its mentor notice.

Follow-up v1.14.21: Shared setup verification now checks the global notice while Dashboard remains the home page.

Bug fix v1.14.22: Settings cards, including admin backup/password sections, now have consistent desktop/mobile spacing. Dashboard remains the home page.

Update v1.14.23: DWG drawings can be attached and downloaded from the Cut List and Dashboard. Open them in CAD software; DWG is not previewed in the app. Existing limits remain: 1 MB per file, up to 3 files and 2 MB total per cut. DWG files are retained in backups and attachment undo history.
