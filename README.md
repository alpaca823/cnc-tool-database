# CNC Database — v1.16.1

This workspace maintains two variants of the same CNC tool and material database:

| Variant | Open it with | Data storage | Sharing |
| --- | --- | --- | --- |
| [Local](cnc-local/README.md) | Extracted `CNC-Tool-Database.html` in Chrome, Edge, or Firefox | This browser/profile on this computer | JSON backups or portable HTML snapshots |
| [GitHub Pages / Supabase](cnc-pages/README.md) | Published GitHub Pages website | Shared Supabase database | One online shop database |

Both variants have Dashboard, Feeds & Speeds, Mills, Inventory, one combined Materials tab, Job Queue, Notes, and Settings. They share inches throughout, optional plunge and coolant mist settings, tool/material photos, tool and sheet counts, themes, the mentor notice, and a common release version. Both editions use the shop’s admin login and optional additional admin passwords for editing. Visitors browse without app login.

Google Apps Script is archived for reference and is not rebuilt or released. Use the local HTML or GitHub Pages/Supabase edition.

## Shared development

The interface and data rules have one canonical source:

- `cnc-local/app-shell.html`: shared markup and established UI handlers.
- `cnc-local/workspace-ui.js` and `workspace.css`: shared navigation, library views, inventory UI, and appearance.
- `cnc-local/local-core.js`: local storage/authentication plus canonical record validation and operations.
- `cnc-pages/build.py`: generates the shared frontend and Supabase engine from the canonical source.
- `cnc-pages/supabase/functions/cnc-api/`: shared API, custom admin authentication, and persistence.
- `cnc-local/job-form.js`: CAD sizing and the drawing example dialog.

Run `python build-both.py` after a source change. Run `python verify-both.py` to rebuild and verify the local and shared editions. Tests require Python 3, Node.js, Playwright, and Chromium; install dependencies with `npm ci`. Browser tests use intercepted loopback pages and isolated data, without modifying the live shop database.

After verification, run `python package-both.py --public-release` to create matching local, GitHub Pages, and source ZIPs. Numbered releases cannot be replaced with changed contents. Deploy the generated Supabase API, then publish `cnc-pages/public` with GitHub Actions. Google Apps Script is archived and is not rebuilt or deployed.

Both supported editions share features and backup formats, but their live data is independent. An offline HTML download is a snapshot and does not synchronize after copying. JSON imports replace the current database contents.

See each variant's **TEST-RESULTS.md** for completed validation. Keep numbered release ZIPs unchanged so an earlier release remains available.

## GitHub Pages prototype and shared database

The GitHub Pages edition is built in cnc-pages/. It uses Supabase for shared storage and uses the same admin sign-in workflow, data validation, and backup format. See cnc-pages/README.md for setup. Until connected, the site offers an explicitly browser-only preview. Creating the repository or Pages site alone does not provision the database.

As of v1.14.10, supported editions are GitHub Pages/Supabase and local HTML. Google Apps Script is archived. Admin sign-in is case-insensitive; ask the shop owner for access.








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

Update v1.14.24: What’s new now has its own sidebar tab directly below Settings.

Update v1.14.25: Everyone can preview saved sheet and remnant shapes from Materials. Click a shape thumbnail for a larger view of cutouts, inch bounds, quantity and remaining area. Previews are read-only, update with stock changes, and work in offline copies.

Update v1.14.26: Added spacing between Tool inventory and Material stock on desktop and mobile.

Update v1.14.27: Cut List is now named Job Queue throughout the current app. Existing jobs, quantities, priorities and ordering are preserved.

Update v1.14.28: Removed the extra reminder below Feeds & Speeds results; the mentor notice remains. Admins now select library mills from a standard dropdown, or choose New mill to enter a new number.

Update v1.14.29: Add new mills from the Mills tab. Feeds & Speeds selects registered mills only, and its save API rejects unknown mill numbers. Existing settings and backups are preserved.

Update v1.15.1: Drawing placement is public. In Materials or Inventory, choose Place drawing beside an available piece. Upload DWG/DXF/SVG or reuse a Job Queue drawing, verify inch dimensions, drag/rotate/scale, and record one piece’s cutout. Circular edges are approximated, open outlines close with highlighted edges, and annotations are omitted. Internal details remain reference lines; recording/export uses the outer part footprint. Reports are logged, with conflict-safe admin-only undo. Shaped remnants survive backups and offline copies. Limits: 5,000 vertices per outline, 20,000 per footprint. No toolpath/kerf generation or automatic scrap separation. Job Queue is first on the Dashboard. The admin-only Beta Testing tab is empty.

Update v1.15.2: Mark done opens a dialog to select a DWG/DXF/SVG drawing and an available stock piece. Position the drawing, then Record cut to save the stock change and complete the entire job together. Canceling keeps the job pending. If no supported drawing is listed, attach one to a Job Queue job first; admins can add stock through Materials. Completion and material changes are separate reports saved atomically; admins can undo the reports individually in Settings, newest first, unless later edits conflict.

Update v1.15.4: Drawing attachments allow 5 MB per file and 5 MB combined per job, across at most 3 files. Existing library and browser storage limits still apply; large offline saves may require freeing browser storage.

## CAD job planning

Choose a saved material or **Other**, enter positive decimal thickness in inches, and provide **Added / edited by** and **Approved by** on every save. Fractions are rejected. Names are user-entered records, not verified account approvals. Existing jobs and backups remain readable; editing an older job requires the new fields.

Attach a clean DWG, DXF or SVG and choose the drawing used for sizing. Set its actual units (inches or millimeters). Length and width are calculated from the grouped outer geometry, converted to inches, and rounded upward to whole inches. Manual length and width inputs are removed. Other attachment formats can still be saved, but do not provide automatic dimensions; legacy recorded dimensions are retained when no CAD is attached. The existing drawing limits remain 3 attachments and 5 MB combined per job.

Use part geometry only, one view at 1:1 scale, without dimensions, labels, border or title block. **View example** opens a clean part illustration. The app checks supported geometry; the person preparing the job must verify scale, units and intended view. Approximate curved outlines and automatically closed edges should be checked before cutting.

Mark done shows only that job’s attachments. Visitors select available stock; jobs without drawings skip drawing selection. CAD drawings open placement; no drawing or a non-CAD attachment requires confirmation to use one whole stock piece without a remnant. Only admins can mark done without stock/drawing selections. Reports and conflict-safe admin undo remain available in Settings.
