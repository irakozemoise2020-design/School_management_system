# EduNexus system architecture

## Operating model

EduNexus is a multi-tenant school operations platform. A tenant is an **organization** that can own one or more **schools**; each school can own multiple **campuses**. Every operational record is bound to a school, and campus-bound records also carry `campus_id`.

```text
React / Vite client
    │  Supabase Auth session (anon key only)
    ▼
Supabase API ── RLS tenant boundary ── PostgreSQL
    │                                      │
    │                                      ├─ SECURE RPCs / DB transactions
    │                                      ├─ audit_logs
    │                                      └─ Realtime channels (opt-in)
    ├─ private Supabase Storage
    └─ Edge Functions ── payment, SMS, email, WhatsApp, PDF integrations
```

The React client is responsible for rendering and non-sensitive input validation. It does not decide authorization, calculate final financial balances, publish results, or process webhooks. Those operations are handled by database functions or Edge Functions with server-side validation and audit entries.

## Application boundaries

| Layer | Responsibility |
|---|---|
| Client | Responsive user interfaces, React Hook Form + Zod validation, user feedback, translated copy, authenticated Supabase requests. |
| Auth & authorization | Supabase Auth identity, profiles, user-to-school assignments, custom roles, module permissions, RLS. |
| Domain database | Referential integrity, unique references, status transitions, query indexes, scoped reporting. |
| Edge Functions | Payment webhooks and idempotency, external messaging, PDF/export jobs, privileged invitations, batch jobs. |
| Storage | Private documents and media stored below a school UUID prefix, with storage RLS. |
| Observability | `audit_logs`, provider delivery logs, Edge Function logs, database backups, and error monitoring. |

## Phase sequence

1. **Foundation** — delivered: app setup, Auth, multi-school identity, RLS, onboarding, school settings, live dashboard.
2. **Student & academic** — admissions conversion transaction, learner/guardian records, classes, attendance, timetable.
3. **Examinations** — schedule, marks authorization, grading, report-card job, promotion history.
4. **Fees & accounting** — invoice items, allocation transaction, payment webhook, receipts, ledger posting, reports.
5. **Portals & communication** — parent/student/teacher RBAC, messaging, notifications, delivery receipts.
6. **Operations** — HR/payroll, library, transport, boarding, inventory/procurement, clinic, discipline, cafeteria.
7. **Advanced capability** — LMS, assessments, analytics, approved external integrations.
8. **Production readiness** — automated tests, RLS test matrix, backup restoration, performance tests, Vercel deployment.

## Non-negotiable controls

- The browser only receives `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- A service-role key is Edge Function / secure server infrastructure only.
- All school-specific tables include a `school_id`; tenant checks happen in RLS and secure RPCs.
- Monetary data uses `numeric(14,2)`, never JavaScript floating-point arithmetic.
- External payments require an idempotency reference with a unique database constraint and a transaction.
- Medical, payroll, and discipline data receive narrower role-specific policies in their implementation phases.
