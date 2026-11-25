# CNC Database — shared website

GitHub Pages hosts the interface. Supabase stores the shared inventory, jobs, drawings, settings and protected admin records. Visitors browse without an account; use the shop’s admin access for protected actions. The browser receives only a public connection key, never the server’s service-role key.

The offline HTML and `preview.html` use browser-only storage and do not sync with the shared database. The main website already has an existing project: retain it for routine updates and ownership handoff.

## Maintaining the existing site

Read the repository’s [main README](../README.md) for Codex/Claude Code instructions, build/release commands and the team transfer checklist. Edit canonical files in `cnc-local`, then run `python build-both.py` from the repository root.

The active workflows are `.github/workflows/pages.yml` and `.github/workflows/deploy-database.yml` at the repository root. Copies in this folder’s `workflows/` are reference templates; do not overwrite the active Pages workflow with an older template. The build also refreshes the root HTML files used by Pages.

Push reviewed frontend changes to `main` to publish. If shared backend code changed, also run **Actions → Deploy shared database API**. Its repository secrets are `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`. Supabase supplies the Edge Function’s server credentials. The existing API uses custom admin authentication with platform JWT verification disabled; preserve that design when deploying.

Root `config.js` contains the public Project URL/key and is copied into the shared build. `CNC_ALLOWED_ORIGINS` is the Edge Function secret for allowed browser origins (comma-separated, without a repository path). Update it when moving to a team GitHub Pages address. A GitHub transfer does not transfer the Supabase project or its management access.

## Setting up a separate installation

Use these steps only for a new, independent database—not to update or hand over the current shop.

1. Create a Supabase project. In its SQL Editor, run `supabase/schema.sql` and `supabase/visitor-counter.sql` after reviewing their contents.
2. Set the two GitHub deployment secrets above using an authorized maintainer’s credentials. Keep tokens out of code and chat.
3. Put the new public Project URL/key in root `config.js`; configure `CNC_ALLOWED_ORIGINS` for the new website.
4. Build, deploy the API with the database workflow, and publish with Pages set to GitHub Actions. Check both workflows succeed and test the site with isolated data.

JSON imports replace shared shop data; export a backup first. Offline downloads are independent snapshots and exclude passwords. Billing, project access and recovery contacts belong in the team’s private records. See the [Supabase transfer guide](https://supabase.com/docs/guides/platform/project-transfer) before changing project ownership.
