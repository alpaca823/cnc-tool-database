# CNC Tool Database — Google Apps Script — v1.14.0

This is the shared, online variant of CNC Tool Database. It uses the same interface and cutting-data rules as the standalone local version. Open the deployed web app through its link; saved shop data is shared between computers through Google Sheets and private image files in Google Drive. Internet access is required.

Both variants include Dashboard, Feeds & Speeds, Mills, Inventory, Materials, and Settings. Materials has one tab: select a material to see its sheet sizes, quantities, locations, notes, and optional shared photo. Cutting dimensions use inches; feed and plunge rates use inches per minute. Plunge, coolant mist, optional tool photos, additional admin passwords, and Light/Dark/System appearance are supported.

**A mentor must be present for all CNC cutting.** The notice and release version remain visible in the app.

## Set up a new Google project

Use a new Apps Script project for this variant. Setup creates its own dedicated spreadsheet and image folder, including when the script is attached to an existing spreadsheet. The earlier `cnc-feeds-speeds` project uses a different format; this release does not overwrite or automatically migrate that project.

1. Open **https://script.google.com** and select **New project**.
2. Name the project **CNC Tool Database**.
3. Replace the contents of **Code.gs** with the complete supplied **Code.gs** file.
4. Add an HTML file named **Index** and paste the supplied **Index.html** into it. The editor adds the `.html` extension.
5. In **Project Settings**, enable **Show appsscript.json manifest file in editor**. Replace that file with the supplied **appsscript.json**, then save the project. Developers using `clasp` can upload the same three files instead.
6. In the editor's function selector, choose **setupDatabase** and select **Run**. Approve the requested Google Sheets and Drive access. Setup creates a new dedicated spreadsheet and private image folder; the execution log includes the spreadsheet URL. Rerunning setup preserves the configured database and its saved data.
7. Select **Deploy → New deployment → Web app**. Choose **Execute as: Me** and choose who in your shop may access the app. Availability of sharing choices depends on your Google account or Workspace policy.
8. Deploy, copy the web app URL, and open it in a browser. Share that URL with the intended users.

The app's default username and permanent fallback password are **admin / admin**. Everyone who can open the app and knows this fallback can edit the database, so the deployment's access setting determines who can reach it. Under **Settings → Admin passwords**, add labeled passwords for your shop; the permanent fallback stays available.

This package has not been deployed to your Google account. Automated checks use mocked Apps Script services; the first authorization and a check of the deployed link must be completed in your account.

## Use the shared database

Admins can create materials and mills, save approved cutting settings, count tools, and maintain sheet inventory. Operators can browse the six pages and look up a mill/material pair. Counts are entered manually and do not decrease automatically when someone makes a cut. No machining recommendations are calculated.

Saving a change writes to the shared database. Opening a page or using its refresh control reloads current data; the app does not provide live collaboration cursors or instant updates on every already-open screen. If someone changes a record after another user opened its editor, the stale edit is rejected so they can reload it first.

Appearance remains a preference in each browser. Light, Dark, and System modes apply to the sidebar, header, search field, and mobile menu as well as the main workspace. Admin sessions expire after one hour. Additional password records and session checks are handled on the server, so the same shop passwords work from different computers. Custom passwords are stored separately from the cutting data and are omitted from data exports.

## Move data between variants

To copy your existing local data into the Google variant:

1. Open the local app, sign in, and select **Settings → Export JSON backup**.
2. Open the Google web app, sign in, and select **Settings → Import JSON backup**.
3. Choose the exported file and confirm replacement of the Google app's current data.

JSON backups contain materials, mills, tool inventory, sheet inventory, cutting settings, notes, and embedded photos. Imports validate the complete backup before replacing the current data. Admin passwords and appearance preferences remain with their own variant.

You can also export JSON from the Google app and import it into the local app. **Download offline HTML** in the Google app creates an offline local copy containing the current data and photos. That copy works independently when opened in Chrome, Edge, or Firefox. The local app calls its corresponding button **Download updated HTML**.

The local and Google variants have separate databases. Copying a backup or downloading HTML creates a snapshot; subsequent changes do not automatically synchronize between the variants.

## Storage and backups

Google Sheets stores the database in two snapshot slots. A save writes a complete new snapshot into the inactive slot and switches the active reference only after the write succeeds. Private Drive files hold the images; they are returned to the app as embedded images. The app does not make those files publicly shared. Server credentials and the active storage reference live in the project's Script Properties.

Use the app to edit records. Snapshot sheets are application storage and should not be manually rearranged or edited. A spreadsheet copy alone is not a full copy of its linked Drive images and Script Properties. Export a JSON backup from the app when you want a portable data backup.

## Install future updates

The local and Google variants share a release version and source files. A source change is built and checked for both variants.

For an existing Google deployment:

1. Export a JSON backup from the running app.
2. Replace **Code.gs**, **Index.html**, and **appsscript.json** in the existing Apps Script project with the new release files. Keep the same spreadsheet, Drive files, and Script Properties.
3. Save the project. If setup needs to be run, rerun **setupDatabase** in the existing project; it preserves the configured store.
4. Open **Deploy → Manage deployments**, edit the web app deployment, choose **New version**, and deploy. Using the existing deployment keeps its web app URL.
5. Reload the app and verify its version, saved records, and admin login.

Updating the source files alone does not replace an already deployed Apps Script version. For the local variant, install the matching standalone HTML release and keep a JSON backup as described in its README.

## Developer source

Run `python build-both.py` from the source workspace root to rebuild both variants. Their common release version comes from `cnc-local/VERSION`. The shared interface is in `cnc-local/app-shell.html`, `workspace-ui.js`, and `workspace.css`. The canonical data validation and record operations are in `cnc-local/local-core.js`; `cnc-scripts/build_engine.py` extracts the synchronous server data engine from that source. Apps Script adds its own server storage/authentication layer and browser transport.

Generated **Code.gs** and **Index.html** are deployment outputs. Make changes to their source templates and rebuild both variants. Run the local regression suites and the Apps Script server/browser checks before packaging a release. See **TEST-RESULTS.md** for the checks completed for this package and their limits.

## Switching back from Google-account access

Replace all three project files in the same project. Run setupDatabase once to initialize password access without replacing existing records or photos. Update the public deployment to New version with Execute as: Me. Choose Anyone for anonymous visitors if your Google account permits it. Use that public exec URL for everyone; editor controls use admin/admin or a saved additional password. Archive the separate editor deployment created for v1.12.0, or change it to execute as Me with the new version. Existing Google owner/editor properties remain stored but no longer grant app access. Existing Drive shares are not automatically removed.

## Readable inventory tabs (v1.14.0)

The app-managed spreadsheet now includes **Mills** for tool inventory and **Material Stock** for raw sheet inventory. Mills shows tool numbers, names, types, inch diameters, flutes, quantities, reorder thresholds, locations, inventory status, coatings, and notes. Material Stock shows materials, stable sheet entry IDs, inch dimensions/thickness, sheet counts, locations, and notes. Counts and dimensions are numeric cells; leading-zero tool numbers and literal notes are preserved. Uncounted tools remain blank, while counted zero is zero.

These tabs are readable views of the saved app database. Maintain inventory in the app; manual edits to these tabs do not update the app and are replaced on refresh. Internal snapshot tabs are hidden. Data backups and photos remain unchanged. If a readable view cannot refresh, the app reports a warning while preserving its saved data and retries when the dashboard data reloads. A pre-existing tab with unrelated headers is not overwritten; rename it and retry setup.

For an existing installation, replace the three project files, run **setupDatabase**, and publish **New version** of the existing deployment. Setup fills the tabs from existing records without resetting quantities. The execution log gives the spreadsheet URL; setup opens it on Mills. The local edition remains offline and does not connect to Google Sheets.
