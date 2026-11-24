# Phase 1 audit (checked against a real PostgreSQL 16)

Database: both migrations apply cleanly to an empty database. Tested with two users and two schools: each sees only their own school, students, payments and dashboard; reading another school's dashboard is refused; direct inserts and updates from the browser role are refused; users cannot give themselves access to a school; anonymous callers are refused.

Fixed in this version: real server error messages were hidden behind a generic message; deep links 404'd on Vercel (vercel.json added); the password-reset email led nowhere (new-password screen added); "today" used UTC instead of Kigali time (migration 0002); fixed greeting; two Tailwind classes that did nothing; language selector made honest (disabled).

Known gaps (Phase 2 must close them before more users are added):
1. Roles exist but are not enforced: any person assigned to a school can read all of its tables and files. Needs permission checks before teachers, parents or students get accounts.
2. No invitation or user-assignment function: a school can only have its owner.
3. No screen or function to add students, classes, years, staff; the dashboard stays empty until Phase 2.
4. Storage policies cast the first folder name to a UUID; a badly named upload errors instead of being denied (still safe).
5. Frontend was not compiled in this check (no package downloads available); the first Vercel build is the real test.
