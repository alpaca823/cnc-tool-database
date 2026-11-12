# CNC Tool Database — v1.14.17

This workspace maintains two variants of the same CNC tool and material database:

| Variant | Open it with | Data storage | Sharing |
| --- | --- | --- | --- |
| [Local](cnc-local/README.md) | Extracted `CNC-Tool-Database.html` in Chrome, Edge, or Firefox | This browser/profile on this computer | JSON backups or portable HTML snapshots |
| [Google Apps Script](cnc-scripts/README.md) | Deployed web app URL | Shared Google Sheets and private Drive images | One online shop database |

Both variants have Dashboard, Feeds & Speeds, Mills, Inventory, one combined Materials tab, and Settings. They share inches throughout, optional plunge and coolant mist settings, tool/material photos, tool and sheet counts, themes, the mentor notice, and a common release version. Both editions use admin/Feds201 and optional additional admin passwords for editing. Visitors browse without app login.

The Google variant is supplied as a deployable package. It has not been installed or deployed to a Google account in this workspace. See its README for the setup and deployment steps.

## Shared development

The interface and data rules have one canonical source:

- `cnc-local/app-shell.html`: shared markup and established UI handlers.
- `cnc-local/workspace-ui.js` and `workspace.css`: shared navigation, library views, inventory UI, and appearance.
- `cnc-local/local-core.js`: local storage/authentication plus canonical record validation and operations.
- `cnc-scripts/build_engine.py`: generates the server data engine from those canonical record rules and operations.
- `cnc-scripts/`: Google transport, server storage/authentication, deployment manifest, and generated deployment files.

Run `python build-both.py` to build both variants after a source change. Check the local and Google variants before releasing them with the same version. Apps Script deployment files must then be installed in the existing Google project and published as a new deployment version; local users install the matching HTML release.

The common release number is stored in `cnc-local/VERSION`. Run `python verify-both.py` to rebuild and run both test sets. This requires Python 3, Node.js, Playwright, and Chromium. Install the browser test dependency with `npm install`; set `CHROMIUM_PATH` when Chromium is not at `/usr/bin/chromium`. The verification runner uses intercepted loopback pages so it does not require a web server or a Google account. Google-service tests use local mocks; verify the deployed link in Google after installation.

After verification, run `python package-both.py` to create matching local, Google, combined, and source ZIPs. The packager refuses to replace a numbered release with changed contents; use a new version for a changed release.

The variants share features and backup formats, but each has its own live data. JSON import/export moves a snapshot between them. An offline HTML download from the Google app is an independent local copy. They do not automatically synchronize after a snapshot is copied.

The older `cnc-feeds-speeds/` directory is a legacy project. Use a fresh Apps Script project for the current variant, then import a compatible JSON backup through the app.

See each variant's **TEST-RESULTS.md** for completed validation. Keep numbered release ZIPs unchanged so an earlier release remains available.

## GitHub Pages prototype and shared database

The GitHub Pages edition is built in cnc-pages/. It uses Supabase for shared storage and keeps the same admin/Feds201 workflow, data validation, and backup format. See cnc-pages/README.md for setup. Until connected, the site offers an explicitly browser-only preview. Creating the repository or Pages site alone does not provision the database.

As of v1.14.10, supported editions are GitHub Pages/Supabase and local HTML. Google Apps Script is archived. Default username admin and password Feds201 accept any letter case.








Update v1.14.10: Notes provides searchable shop reminders. Admins can add, edit, and delete; visitors can read. Notes are shared on the website and independent in local HTML, and travel with JSON backups and offline snapshots. Imports replace notes along with the rest of the database.

Update v1.14.11: Admins can pin notes, manage the Cut List, and record material cuts. Record cut removes one original piece and optionally creates one smaller leftover of the same material/thickness/location. Cut-list completion is planning only and does not deduct stock. Pins, cuts, and leftovers are included in backups and offline snapshots.

Update v1.14.12: Cut List supports Low/Normal/High/Urgent priorities and Move up/down controls for the pending cutting order. Priority first is an optional view; new cuts append to the plan. Ordering and priorities survive backups and offline snapshots. Reordering requires an unfiltered planned-order view.

Update v1.14.13: Visitors can record material cuts, mark planned cuts done, and report one broken mill from counted inventory. Reports are logged with optional reporter/details. Settings → Report history & undo lets admins reverse unchanged reports safely, newest first. History and undo metadata travel with backups and offline copies; passwords remain excluded.

Update v1.14.14: Inventory shows mills and material stock together. Material stock lists full sheets and leftovers by size, thickness, quantity, and availability. Search covers both lists. Visitors can record cuts or open the material; admins can add/edit stock through the same material records. No duplicate stock is created.

Update v1.14.15: Website visits are counted on page opening and shown publicly in Settings. Today uses America/New_York; total visits start at installation. Same-tab refreshes count at most once every 30 minutes. Only anonymous session hashes (expired hashes are removed on a subsequent visit after one day) and daily totals are stored; no names, account details, or IP addresses are stored by the counter. Offline HTML and the local preview make no counter requests. Visitor counts are separate from inventory and excluded from inventory backups/restores. Existing sites must run cnc-pages/supabase/visitor-counter.sql before deploying the updated API.

Update v1.14.16: Everyone can add, edit, prioritize, reorder, reopen, delete, or complete Cut List items without signing in. Changes are logged, and only admins can undo them under Settings. The Dashboard shows upcoming cuts in planned order with priorities, Add cut, and Mark done. Inventory/material/settings administration remains protected. History and safe undo survive backups and offline snapshots.

Update v1.14.17: Settings → What’s new provides short release highlights for everyone. The latest three releases are shown first; Older updates expands earlier releases. Highlights are embedded in both editions and offline downloads. Future releases must update cnc-local/whats-new.json with 1–3 factual bullets (at most 100 characters each), alongside the root change log.
