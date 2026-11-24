# Stage 31 deployment alignment

The supplied `supabase_stage31.zip` is a hotel application built as a static frontend (`hotel_app/`), a Supabase Edge Function (`index.ts`, deployed as `api`), and SQL schema scripts. EduNexus now follows the same **deployment shape**, while retaining the security requirements appropriate for an international school ERP.

```text
GitHub repository
  ├─ src/                           React frontend source
  ├─ supabase/migrations/           PostgreSQL schema and RLS migration
  └─ supabase/functions/api/        authenticated business API
             │                             │
             └──────── Vercel ─────────────┘
                           │
                  Supabase Auth user JWT
                           │
             Supabase Edge Function: api
                           │
                 PostgreSQL RPCs + RLS
```

## What was adopted

- One clearly named business API Edge Function: `api`.
- A static, independently deployable web frontend.
- Version-controlled SQL in the `supabase/` directory.
- A small client API layer instead of database calls scattered across screens.

## What was intentionally not copied

The hotel reference uses its own username/password hashes in application tables and accesses all data with server credentials. EduNexus preserves its stated requirements instead:

- Supabase Auth owns identities and sessions.
- The `api` function requires a signed-in user JWT.
- Its database client is scoped to the caller's JWT, so existing school-level RLS still applies.
- No service-role key reaches the browser or GitHub source.

## Deploy

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy api
```

Deploy the React frontend from GitHub to Vercel. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` only in the Vercel environment; do not commit `.env.local`.
