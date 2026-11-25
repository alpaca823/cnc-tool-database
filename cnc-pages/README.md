# CNC Database — GitHub Pages + Supabase

GitHub Pages hosts the interface. Supabase stores shared inventory, images, cutting settings, password hashes, and temporary sessions. The browser never receives the database service-role key or credential records. App editing uses the shop’s admin login and optional additional passwords. Visitors can browse without an account.

Until the database is connected, the site shows a setup message and a link to preview.html. That preview uses the offline app: data saves in that browser only. It is not a shared database. No existing Google inventory has been copied automatically.

## Connect a new free Supabase project

1. Create a project at https://supabase.com/dashboard in a region near your shop. Keep its database password in your password manager.
2. Open SQL Editor, paste the complete contents of supabase/schema.sql, and run it. RLS blocks direct browser access to database and session records; the API controls reads and editing.
3. In your GitHub repository Settings → Secrets and variables → Actions, add SUPABASE_PROJECT_REF (the project ref from its URL) and SUPABASE_ACCESS_TOKEN (a token created in your Supabase account settings). Enter the access token directly in GitHub, not in chat or in a code file.
4. In GitHub Actions, run **Deploy shared database API**. It deploys the Edge Function from this repository. Supabase supplies its URL and server credentials automatically to the function. Alternatively, with Supabase CLI installed: `supabase functions deploy cnc-api --project-ref YOUR_PROJECT_REF --workdir cnc-pages --no-verify-jwt`.
5. In public/config.js (or root config.js on GitHub), enter the Project URL and publishable/public key from the Supabase dashboard. These are public connection settings. Never put the service-role key here. The standard project URL ends in .supabase.co.
6. Open the GitHub Pages site. Use the credentials supplied by your shop for editing; additional passwords can be added in Settings. Test saved inventory in a separate browser to verify the live shared database.

The supplied workflow belongs in .github/workflows/deploy-database.yml at the repository root. Its maintained source is workflows/deploy-database.yml. The default allowed browser origin is https://alpaca823.github.io; set the Edge Function secret CNC_ALLOWED_ORIGINS to a comma-separated list if adding another production origin.

## Move existing data

In the old Google app choose Settings → Export JSON backup. In the new shared site choose Settings → Import JSON backup. This copies data and images, preserving sheet entry IDs, while validating the full backup. Passwords do not transfer; add shared passwords again if needed. The old Google Sheet is left intact and does not sync with the new database. You can also download an independent offline HTML snapshot.

## Maintain and publish

The interface is built from cnc-local canonical sources. The shared API uses a generated version of the same validation, CRUD, migration, and password logic. It loads private database state on the server and uses an atomic revision check to prevent overlapping saves from overwriting each other. Tokens are stored by hash; credential/session tables are server-only.

Run python build-both.py from the full source root to build all supported editions. This writes public/index.html, public/preview.html, and the generated server engine. Copy public/ contents into the GitHub repository root for branch-based GitHub Pages. Keep local HTML and Apps Script editions available. A website build does not deploy the Supabase function; run the database workflow after changing its code. Back up data through the app before upgrades.

Tests use a local database-service double and Chromium; live Supabase connection, billing-plan limits, and production deployment must be verified separately. Free hosting/database plans have provider limits. Do not describe the browser-only preview as shared storage.

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
