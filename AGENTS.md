# CNC Tool Database maintenance

The user wants both the local HTML and Google Apps Script variants maintained. Treat them as two supported outputs of one product.

- Apply interface and feature changes through the canonical sources in `cnc-local/` and the source templates in `cnc-scripts/`. Do not patch only a generated HTML or Apps Script deployment output.
- Preserve shared validation and data-operation parity. `cnc-scripts/build_engine.py` generates the server data engine from the canonical local core; extend the extraction contract when new operations are added.
- Run `python /workspace/build-both.py` after relevant changes so both outputs receive the update. If a platform-specific change affects only one variant, still verify the other variant remains compatible.
- Use the same release version in both variants. Update their documentation and completed test results, and test the affected behavior in both local and Google builds before packaging.
- Keep numbered release ZIPs immutable. Publish a new numbered release and update unnumbered aliases when appropriate.
- Preserve existing records, photos, raw sheet IDs, unit conversions, additional passwords, and the permanent admin/admin fallback in both editions. The user reverted Google-account invitations in v1.12.1 and explicitly requested password access again. Keep prior Google owner/editor properties intact but inactive. Keep the mentor-required notice visible.
- JSON backups and portable offline HTML must continue to carry data and images without exporting custom password records. Local and Google live databases remain independent; do not imply automatic data synchronization.
- For Google updates, preserve the configured spreadsheet, image folder, and Script Properties. Do not clear or replace a configured database during setup or deployment updates. Distinguish mocked Google-service checks from a live deployed-account check.
- The legacy `cnc-feeds-speeds/` project is separate from the current Apps Script variant. Do not silently overwrite its spreadsheet or assume its schema is compatible.
- A source build does not update an already deployed Apps Script web app. Document the required new deployment version and do not claim a Google deployment occurred unless it actually did.
- Google uses server-validated password sessions. Public browsing requires no app login; editing requires admin/admin or an additional saved admin password. Deploy as Me with visitor access chosen by the owner.

- Also maintain the GitHub Pages/Supabase edition in cnc-pages. Reuse the canonical interface and server data/auth core. Keep Supabase credential/session tables private with RLS and access only through the server API. The browser config may contain only the project URL and publishable/public key. Never silently replace shared storage with browser-only storage: prototype preview must remain clearly labelled. Deploying GitHub Pages does not provision or deploy Supabase.
