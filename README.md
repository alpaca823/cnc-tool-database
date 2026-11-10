# CNC Tool Database — v1.14.0

Prototype: https://alpaca823.github.io/cnc-tool-database/preview.html

Shared website: https://alpaca823.github.io/cnc-tool-database/

The browser-only prototype is available immediately. Its data stays in that browser; it is clearly labeled. The main website uses Supabase for shared inventory and needs the owner to connect a new project before it can be used by everyone. GitHub Pages hosts the interface; Apps Script is not used by this edition.

## Connect the shared database

Follow [the setup guide](cnc-pages/README.md). Run [schema.sql](cnc-pages/supabase/schema.sql) in Supabase SQL Editor, configure the two repository Actions secrets described in the guide, and run Deploy shared database API from Actions. Fill root config.js with the Supabase Project URL and publishable/public key. Server credentials stay in Supabase; never place a service-role key in config.js.

Editing uses admin/admin or additional saved passwords. Public browsing needs no login. Mills, materials, inventory, photos, plunge/mist, themes, inch units, version footer, and the mentor notice are preserved. Move old Google or local data using JSON export/import. Nothing has been migrated automatically.

## Supported editions

- cnc-local: standalone offline HTML.
- cnc-scripts: Google Apps Script and existing spreadsheet storage.
- cnc-pages: GitHub Pages frontend and Supabase shared database API.

Run python build-both.py to regenerate all editions. For GitHub Pages copy cnc-pages/public/ contents into the repository root. Run python verify-both.py for checks. The new backend tests use local service doubles; verify production after Supabase is configured. Local and Google data remain independent and available.
