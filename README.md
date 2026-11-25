# CNC Database — v1.16.3

A robotics shop database for mills, feeds & speeds, tool and material inventory, drawings, jobs and notes. A mentor must be present for CNC cutting.

[Open the website](https://alpaca823.github.io/cnc-tool-database/) · [Change log](CHANGELOG.md) · [Rollback guide](ROLLBACK.md)

## Using it

- **Website:** GitHub Pages hosts the app; Supabase holds the shared shop data.
- **Offline:** open `cnc-local/CNC-Tool-Database.html` in Chrome, Edge or Firefox. Its data stays in that browser. Offline copies do not sync with the website.
- Visitors can manage jobs and report cuts/broken mills. Admins manage libraries/settings and undo logged changes. Ask the team mentor for access; credentials are not documented here.
- Export a JSON backup in Settings before significant updates. Imports replace data. Passwords are excluded from exports; keep access details in the team’s password manager.

Google Apps Script is archived and no longer supported. Detailed use/setup: [offline edition](cnc-local/README.md), [shared edition](cnc-pages/README.md).

## Updating with Codex or Claude Code

1. Get write access to this repository using your own GitHub account.
2. **Codex:** connect GitHub, authorize this repository, and select it as the task workspace. After an ownership transfer, select/authorize its new location. Organization owners may need to approve the app.
3. **Claude Code:** clone the repository, open a terminal in its folder, sign in to Claude Code and start `claude`. GitHub push/PR access uses your Git credentials separately. Install it using the [official instructions](https://code.claude.com/docs/en/setup).
4. Start from the latest `main`, use a feature branch, and give the assistant a small, specific request. Ask it to read `AGENTS.md` first; Claude Code should be told this explicitly.
5. Review the diff and tests, then merge the pull request. UI changes publish automatically from `main`. Server changes also need the database deployment described below.

Example prompt for either assistant:

> Read AGENTS.md and README.md. Add [describe the change] on a new branch. Update both supported editions from the canonical sources. Preserve existing data, permissions, backups and mentor notice. Increment the version, update CHANGELOG.md and add short What’s new notes. Build, run relevant tests, explain the results and open a pull request. Do not change ownership, credentials or production data.

### Build and release

Use Python 3, Node.js, Playwright and Chromium (`/usr/bin/chromium` for these tests). From the repository root:

```sh
npm ci
python build-both.py
python verify-both.py
python package-both.py --public-release
```

For a small change, run the relevant checks; use the full verification for broader changes. Report actual results. The version lives in `cnc-local/VERSION`; every release also updates `CHANGELOG.md` and `cnc-local/whats-new.json` (1–3 short bullets). Never overwrite a numbered ZIP.

Edit `cnc-local/app-shell.html`, `workspace.css`, `workspace-ui.js` and the related JS modules. Data rules live in `cnc-local/local-core.js`. The build generates both editions, the root website files and the shared engine; avoid editing generated HTML or `engine.mjs` directly.

GitHub **Actions → Publish CNC website** deploys the root website files. If server code changed, an authorized maintainer must also run **Deploy shared database API** using the existing project, then check the site. A frontend push alone does not deploy Supabase. That workflow needs repository secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`. Enter secrets directly in GitHub Settings, never in code or chat. Keep `config.js` limited to the public project URL/key.

## Ownership handoff to the robotics team

**Preparation only: ownership has not been changed.** Prefer a team GitHub organization with individual student/mentor accounts and at least two long-term owners. Keep `alpaca823` as a collaborator with write access (or a team member with that role) so the graduating maintainer can continue helping.

When the team is ready:

1. Export a current shop backup and save the repository/source ZIP. Record the current GitHub and Supabase owners, project reference, recovery contacts and deployment access in the team’s private records.
2. In GitHub **repository Settings → General → Danger Zone → Transfer**, transfer the existing repository to the team’s organization/account and complete any acceptance steps. Keep its history and backup branches. Verify that the graduating maintainer and incoming students can still push or open PRs.
3. Check **Settings → Pages → Source: GitHub Actions**, Actions permissions, the `github-pages` environment, repository protections and deployment secrets. Reauthorize Codex/other GitHub apps for the new repository. Update local Git remotes to its new URL.
4. Update the website link above and the environment URLs in `.github/workflows/pages.yml` and the reference copy `cnc-pages/workflows/pages.yml`. The new default site address is `https://TEAM.github.io/cnc-tool-database/` if the repository name stays the same. Confirm the actual URL in Pages settings; do not rely on the old Pages address redirecting.
5. **Supabase is separate from GitHub.** Give team mentors access to its organization, retaining appropriate access for the graduating maintainer. Arrange team ownership of the existing project/organization; do not create an empty replacement database. A project transfer requires a source-organization Owner and membership in the target organization. Review the [transfer requirements and plan limits](https://supabase.com/docs/guides/platform/project-transfer) first.
6. Before using the new website, set the Edge Function secret `CNC_ALLOWED_ORIGINS` to the allowed origins, such as `https://alpaca823.github.io,https://TEAM.github.io` during the move. Origins have no repository path. The fallback is in `cnc-pages/supabase/functions/cnc-api/index.ts`. Replace any personal deployment token with an authorized team maintainer’s token and verify the deployment workflow’s access.
7. Publish, then verify the new link, existing inventory/drawings, admin access and offline download. Use test data or an isolated copy for write tests. Confirm both maintainers can ship a small update before removing old access. Update this README’s owner names and URLs afterward.

GitHub write access, Supabase management access and the app’s admin login are three separate permissions. Transferring the repository alone does not hand over the database. Keep recovery details and tokens with the team, not in this README.

GitHub’s [repository transfer guide](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository) and Supabase’s [access control guide](https://supabase.com/docs/guides/platform/access-control) cover the account-side steps.
