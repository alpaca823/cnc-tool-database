# Rollback for CAD job planning

Before v1.16.1, the public release was v1.15.5 at commit `496803dedfe6e5b7225bbcc6d19bec8f1fca487c`. The exact source is preserved on `backup/pre-cad-jobs-1.15.5`.

Use `backup/compatible-pre-cad-jobs-1.15.5` for a functional rollback. That branch restores the old interface while retaining the optional author, approval and CAD sizing metadata in job validation and legacy edits. It includes compatible generated backend and offline templates. No rollback is currently deployed.

1. Check out the compatibility branch in a separate worktree and verify its changes against the baseline.
2. Deploy its generated `cnc-api` files with the existing custom authentication and configuration.
3. Restore its interface files on the active release branch; preserve the current Pages deployment workflow. Record the rollback as a new patch release, rebuild and verify, then publish through GitHub Actions.
4. Verify the live version, job viewing and protected writes without changing real shop inventory for a test.

Preserve the live database, accounts, reports, drawings, stock and jobs. Do not restore an old database snapshot over work entered after the release. Avoid importing older backups just to roll back the interface. If later features add fields, update the compatibility validator before rollback.
