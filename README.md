# CNC Tool Database — v1.14.10

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
