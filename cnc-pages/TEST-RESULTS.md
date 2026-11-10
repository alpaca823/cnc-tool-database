# v1.14.1 bug-fix verification

Default login changed to admin/Feds201, accepting any capitalization. Shared backend unit tests and the Pages browser test verify login, shared data, protected edits, and persistence. Live API checks verify mixed-case default login and rejection of the previous default. The local HTML is generated from the same canonical authentication core. Google Apps Script is archived and excluded from supported builds. Existing data and credential records remain intact.
