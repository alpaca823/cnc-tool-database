# CNC Tool Database maintenance

Support the local HTML and GitHub Pages/Supabase editions. The user discontinued Google Apps Script support in v1.14.1. Keep cnc-scripts and old numbered archives for reference, but do not rebuild or release Google editions. Preserve existing data and credentials. The default login is admin/Feds201, case-insensitive, replacing the old admin/admin fallback by explicit user request. Use canonical cnc-local sources and cnc-pages server generation. Run build-both.py and appropriate supported-edition tests. Keep versions synchronized and numbered release ZIPs immutable. Never expose server database keys. Keep the mentor notice. Shared and offline data remain independent; backups exclude passwords.

Every released change must increment the synchronized version and be recorded accurately in the root CHANGELOG.md. Include that log in both supported release packages. Never invent fixes.

Visitors may manage all Cut List actions (add, edit, priority, order, reopen, delete, complete), record material cuts, and report broken mills. These public actions must remain logged and reversible only by admins; mill, material, note, and settings administration stays protected. Undo must never overwrite later changes.

Each release must update cnc-local/whats-new.json with 1–3 short, factual bullets (at most 100 characters each) for the current version. Keep future ideas out of release highlights.

User-authorized admin-only beta exception: keep public VERSION at 1.14.25 and exclude pending beta work from public CHANGELOG/What’s new until public release. Track work in BETA-CHANGELOG.md. Use separate --beta packages; never overwrite numbered release ZIPs.

The user promoted read-only Materials stock previews to the current public edition in v1.14.25. Drawing placement stays admin-only beta; further pending beta work must not bump the public version or enter public highlights.
