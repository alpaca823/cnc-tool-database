# v1.14.19 bug fix

Dashboard layout regression passes in local and shared builds at 2048, 1440, 1024, 768, and 390 px, in both themes, with populated and empty alerts. Checks verify at least 16 px separation between summary cards, the alerts/quick-access row, and the Cut List; no horizontal overflow; hidden Dashboard behavior remains correct. A desktop screenshot was visually inspected.

Public planning/Dashboard/admin undo and What’s new browser suites also pass in both editions. No backend, data, credential, or schema changes were needed. Google Apps Script remains archived.
