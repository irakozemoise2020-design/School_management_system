# Upgrading from Phase 1 to Phase 2

Phase 2 adds: Admissions, Students & guardians, Academics (years, terms, classes, subjects, teacher assignments), Attendance, Timetable, Teachers & Staff, and Settings (users, invitations, numbering, working days). Menus and pages now follow each person's role.

Do the steps **in this order**.

## 1. Database (Supabase → SQL Editor)
1. Open `supabase/migrations/202611240003_waitlist_status.sql`, paste it, press **Run**. Run it **on its own** (it adds a value to a list type and cannot share a run with other code).
2. Open `supabase/migrations/202611240004_phase2.sql`, paste all of it, press **Run**. It is safe to run again if it is interrupted.
(Phase 1 files 0001 and 0002 must already have been run.)

## 2. Edge Function (Supabase → Edge Functions → your function, named `swift-api`)
Open the function, replace **all** its code with `supabase/functions/api/index.ts` from this zip, press **Deploy**. Keep the function name. Leave "Verify JWT" on.

## 3. Website (Git Bash, inside the project folder)
Copy the files of this zip over your project folder (same names are replaced), then run these as **three separate commands**:
```
git add .
git commit -m "Phase 2"
git push
```
Vercel rebuilds by itself in about a minute. If the build fails, open the failed deployment in Vercel, copy the red error text and send it to me.

## 4. First check
Sign in as the school owner. You should see Admissions, Students, Academics, Attendance, Timetable, Teachers & Staff and Settings in the menu.
Suggested first-time order: Settings (prefixes, working days) → Academics (academic year → terms → subjects → classes → subjects per class) → Staff (add teachers) → Academics (assign teachers) → Timetable (periods, then lessons) → Admissions or Students.

## Giving access to other people (roles)
Settings → Users & access → **Invite someone**: type their email and choose a role. They create an account on the site with **that same email**, confirm the email, and the school appears for them automatically. If they already had an account, they are added straight away.
Roles: School Owner (everything; cannot be invited or changed), plus the roles seeded for your school (for example Administrator, Registrar, Teacher…). What a role can do is decided in the database permission list; teachers can only take attendance for classes they are assigned to, and the person must be linked to their staff record (Staff → Edit → Linked login account).

## Known limits in Phase 2
- No student photo or document upload yet.
- No timetable publishing or substitute teachers; no parent notifications.
- The language choice is stored but screens are English only.
- Examinations, fees, and the other modules are still previews (later phases).
