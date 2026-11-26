# CNC Database — offline edition

Open the extracted `CNC-Tool-Database.html` in Chrome, Edge or Firefox. No installation or server is required. Data stays in that browser/profile on that computer; clearing browser data can remove it.

The sidebar contains Dashboard, Feeds & Speeds, Mills, Inventory, Materials, Job Queue, Notes, Settings and What’s new. Dimensions use inches; feed and plunge rates use inches per minute. A mentor must be present for CNC cutting.

Visitors can browse, manage jobs and report cuts or broken mills. Admins maintain libraries/settings and undo logged changes. Ask your team mentor for access.

## Jobs and drawings

Jobs include an editable revision number (starting at 1), shown in the Job Queue and Dashboard. It does not increase automatically. Jobs require material (a saved entry or Other), decimal thickness, Added / edited by and Approved by. Use clean part geometry at 1:1 scale, one view, without dimensions, labels or borders. Confirm drawing units and the calculated size. View example shows a sample drawing.

DWG/DXF/SVG can supply automatic dimensions. Other supported attachments can be stored without automatic sizing. Each job allows up to 3 files, totaling 5 MB. When completing a job, visitors select stock and that job’s drawing when one exists. No drawing/non-CAD attachments use a confirmed whole stock piece. Only admins may complete without selections.

## Backups and updates

Use Settings to export JSON or download a portable HTML copy. Passwords are excluded from backups. Imports replace existing data. Copies are independent and do not synchronize with the shared website.

Before installing an update, keep a backup. Open the new HTML in the same browser/profile to retain its stored data, or import the backup if moving computers. Keep older numbered ZIPs unchanged. Large offline drawing collections remain subject to browser storage limits.

For development, release commands, Codex/Claude Code instructions and team ownership handoff, see the source repository’s [main README](https://github.com/alpaca823/cnc-tool-database#readme). Release history is in the included [change log](CHANGELOG.md).
