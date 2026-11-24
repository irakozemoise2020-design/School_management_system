# Putting EduNexus live (Supabase + GitHub + Vercel)

You need three free accounts: supabase.com, github.com, vercel.com. About 30 minutes.

## 1. Supabase (the database and login)
1. supabase.com > New project. Name it (e.g. edunexus), choose a strong database password (save it), pick the region closest to you. Wait until it is ready.
2. Left menu > SQL Editor > New query. Open `supabase/migrations/202611240001_foundation.sql`, copy ALL of it, paste, press Run. It must say "Success".
3. New query again. Open `supabase/migrations/202611240002_dashboard_school_timezone.sql`, paste, Run. (Always in this order: 0001 then 0002.)
4. Left menu > Edge Functions > Deploy a new function > Via Editor. Name it exactly `api`. Delete the sample code, paste ALL of `supabase/functions/api/index.ts`, Deploy. Open the function's settings and make sure "Verify JWT" is ON.
5. Project Settings > API: copy the Project URL and the `anon` public key (NOT the service_role key; never use that one anywhere in this project).

## 2. GitHub (keeps your code)
1. github.com > New repository > name `edunexus-school-erp` > Private > Create.
2. Click "uploading an existing file", drag in EVERYTHING inside this project folder (the files and folders themselves, not the folder around them: package.json must sit at the top of the repository). Do not upload node_modules or any .env file. Commit.

## 3. Vercel (the website)
1. vercel.com > Add New > Project > import the GitHub repository.
2. Framework should show "Vite". Leave the build settings. Open Environment Variables and add:
   - `VITE_SUPABASE_URL` = the Project URL from step 1.5
   - `VITE_SUPABASE_ANON_KEY` = the anon key from step 1.5
3. Deploy. When it finishes, copy your address (https://something.vercel.app).

## 4. Tell Supabase your website address
Supabase > Authentication > URL Configuration:
- Site URL = your Vercel address.
- Redirect URLs: add the same address followed by /** (for example https://something.vercel.app/**).
Without this, confirmation and password-reset emails send people to the wrong place.

## 5. First sign-in
1. Open your site > Create an account > confirm by the email link > Sign in.
2. Fill in "Create your workspace" (organization, school, code, campus). You become the School Owner.
3. The dashboard opens with zeros. That is correct: the numbers come from real records and there are none yet.

## 6. Before real users
- Authentication > Providers > Email: keep "Confirm email" ON. Supabase's built-in email sender allows only a few emails per hour; for real use add your own SMTP (Authentication > SMTP Settings, e.g. Resend).
- Anyone who can open the site can create an account and their own empty school workspace (they cannot see your data). When you do not want that, turn off Authentication > Sign In / Providers > "Allow new users to sign up" and add staff yourself with Authentication > Users > Add user, until the invitation screen arrives in Phase 2.
- Vercel's free Hobby plan is for non-commercial use; a school business needs the Pro plan.
- Every later phase will come as new numbered SQL files (0003, 0004 ...). Run each once, in order.

## If something goes wrong
- White page after deploy: the two environment variables are missing or misspelled; fix in Vercel > Settings > Environment Variables, then Redeploy.
- "Your session is invalid" or "Edge Function" errors: the function `api` is not deployed under that exact name.
- Dashboard says data unavailable: step 2 or 3 of Supabase was not run.
- A page gives 404 on refresh: make sure `vercel.json` was uploaded to the top of the repository.
