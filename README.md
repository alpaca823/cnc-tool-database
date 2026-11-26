# CNC Database — v1.16.5

A robotics shop database for mills, feeds & speeds, tool and material inventory, drawings, jobs and notes. A mentor must be present for CNC cutting.

[Open the website](https://alpaca823.github.io/cnc-tool-database/) · [Change log](CHANGELOG.md) · [Rollback guide](ROLLBACK.md)

## Using it

- **Website:** GitHub Pages hosts the app; Supabase holds the shared shop data.
- **Offline:** open `cnc-local/CNC-Tool-Database.html` in Chrome, Edge or Firefox. Its data stays in that browser. Offline copies do not sync with the website.
- Visitors can manage jobs and report cuts/broken mills. Admins manage libraries/settings and undo logged changes. Ask the team mentor for access; credentials are not documented here.
- Export a JSON backup in Settings before significant updates. Imports replace data. Passwords are excluded from exports; keep access details in the team’s password manager.

Google Apps Script is archived and no longer supported. Detailed use/setup: [offline edition](cnc-local/README.md), [shared edition](cnc-pages/README.md).

## Updating from the Codex or Claude app

Use your own GitHub account with write access to this repository. Both apps can work from the connected GitHub repository in a cloud session: you do not need to download a ZIP, upload the files, or use a terminal. The app fetches the repository for you. App features and cloud access depend on your account and organization settings.

### Codex app

1. Open the Codex app and connect GitHub if it is not already connected.
2. Authorize this repository and select it for a **cloud task/workspace**. A team organization owner may need to approve repository access.
3. Start a new task, paste the example request below, and describe the update you want.
4. Read the changes and test results. Ask Codex to open a pull request, then review and merge it in GitHub.

### Claude app — Code

1. Open the Claude app and go to **Code** (Claude Code).
2. Choose a **cloud session**, connect GitHub, and authorize/select this repository. Use the repository selector for a cloud session; a local-folder session is a different workflow.
3. Start a task, paste the same example request below, and describe your update. Claude retrieves the code automatically.
4. Read the changes and test results. Ask Claude to open a pull request, then review and merge it in GitHub.

If a repository is missing in either app, check that the correct GitHub account is connected and that the app has permission to access the team’s repository. After ownership changes, authorize/select the repository at its new location. General chat or a file attachment is not the connected coding workspace.

### Example request for either app

> Read AGENTS.md and README.md. Add [describe the change] on a new branch. Update both supported editions from the canonical sources. Preserve existing data, permissions, backups and mentor notice. Increment the version, update CHANGELOG.md and add short What’s new notes. Build, run relevant tests, explain the results and open a pull request. Do not change ownership, credentials or production data.

### Review and publish

Ask the coding assistant to handle the build, relevant tests and release packages, following `AGENTS.md`. Check its results before merging. Every release needs a version increment, an accurate change log and short What’s new notes; numbered ZIPs must stay unchanged.

Merging into `main` starts **GitHub Actions → Publish CNC website**. Confirm that it succeeds, then open the website and check the version and the changed screen.

If the assistant changed shared server code, an authorized maintainer must also run **Actions → Deploy shared database API** for the existing project. A frontend publish alone does not update Supabase. That workflow uses the repository secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`. Enter secrets directly in GitHub Settings, never in an AI chat or code. Keep `config.js` limited to the public project URL/key.


GitHub write access, Supabase management access and the app’s admin login are three separate permissions. Transferring the repository alone does not hand over the database. Keep recovery details and tokens with the team, not in this README.

GitHub’s [repository transfer guide](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository) and Supabase’s [access control guide](https://supabase.com/docs/guides/platform/access-control) cover the account-side steps.
