# EduNexus School ERP

Phase 1 foundation for a secure, multi-school School ERP / SIS / LMS. The initial release provides authentication, school onboarding, school-level access controls, a responsive administration shell, and a live dashboard that reads only from Supabase database records. Browser domain requests are routed through the authenticated `api` Edge Function, matching the supplied Stage 31 deployment pattern.

Putting it live: see DEPLOY.md. Review of this phase: docs/phase-1-audit.md.

## Start locally

1. Copy `.env.example` to `.env.local` and set the Supabase project URL and browser-safe anon key.
2. Run the SQL migration in `supabase/migrations/202611240001_foundation.sql` using the Supabase CLI or SQL editor.
3. Link the project and deploy the authenticated business API: `supabase link --project-ref <project-ref>` then `supabase functions deploy api`.
4. Install dependencies with `npm install`.
5. Start the app with `npm run dev`.

The client intentionally contains no service-role key. Configure Supabase Authentication email/password and the production redirect URLs before deploying.

## Delivered in Phase 1

- Static frontend plus authenticated `api` Edge Function, multi-school foundation, RLS policies, roles, audit log, and onboarding RPC.
- Dashboard RPC with live enrollment, attendance, finance, and operational data.
- Auth flows with email/password sign-in, registration, and password reset.
- Responsive, accessible dashboard shell and comprehensive navigation map.
- Database, system architecture, UI design tokens, and phased delivery documentation in `docs/`.

See `docs/phase-1-report.md` for scope and verification instructions.
