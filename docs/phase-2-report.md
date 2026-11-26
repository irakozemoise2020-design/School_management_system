# Phase 2 report

**Built:** admissions workflow (draft → submitted → under review / waitlisted → approved → enrolled / rejected), students and guardians, academic years/terms/classes/subjects/departments, teacher assignments, daily attendance with summary, timetable with clash checks, staff directory, users and invitations, school settings, role-aware menu and pages.

**How it is protected:** the browser only calls an allow-listed Edge Function; every database function checks the caller's permission for the selected school; tables cannot be written directly from the browser.

**Tested here:** PostgreSQL 16 test database, 210 checks passing (permissions, numbering, duplicates, capacity, promotion, admissions workflow, attendance rules, timetable clashes, invitations); Edge Function logic 24 checks passing.

**Not tested here:** the React screens could not be compiled or run in this environment (no package installs). They were type-checked against stand-in library declarations, which found no errors in the new code. The first Vercel build is the real test; report any red error text.
