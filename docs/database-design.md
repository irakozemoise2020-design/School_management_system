# Database relationship design

## Tenant and identity relationship

```text
auth.users 1 ── 1 profiles
organizations 1 ── * schools 1 ── * campuses
profiles * ── * roles                    via user_roles
profiles * ── * schools                  via user_school_assignments
roles * ── * permissions                 via role_permissions
```

`user_school_assignments` is the operational authorization anchor. RLS checks the current authenticated user against its active assignments before returning a school-owned record. A role is organizational so a school can define custom roles without colliding with another tenant’s roles.

## Core Phase 1 relationship

```text
schools ──< academic_years ──< terms
schools ──< departments ──< subjects
schools ──< classes
schools ──< students ──< student_enrollments >── academic_years/classes
schools ──< guardians >──< students             via student_guardians
schools ──< admission_applications
schools ──< employees
schools ──< attendance_records >── students
schools ──< student_invoices >── students
schools ──< payments >── students
schools ──< expenses / school_events / notifications / audit_logs
```

## Planned domain extensions

The following groups receive their own versioned migrations, foreign keys, RLS policies, RPCs, and tests as their corresponding phase is delivered. They are deliberately not represented by empty placeholder tables.

| Domain | Planned tables |
|---|---|
| Student records | `student_documents`, `student_transfers`, `student_promotions`, `medical_records`, `disciplinary_records` |
| Academics | `sections`, `streams`, `curricula`, `class_subjects`, `teacher_assignments`, `classrooms` |
| Timetable | `timetable_periods`, `timetables`, `timetable_entries`, `teacher_substitutions` |
| Assessment | `examinations`, `exam_schedules`, `assessments`, `marks`, `grading_scales`, `report_cards` |
| Fees | `fee_structures`, `fee_items`, `invoice_items`, `payment_allocations`, `refunds`, `discounts` |
| Accounting | `accounts`, `journal_entries`, `journal_entry_lines`, `bank_accounts`, `bank_reconciliations`, `budgets`, `financial_periods` |
| HR/payroll | `employee_documents`, `leave_requests`, `salary_structures`, `payroll_runs`, `payslips`, `payroll_items` |
| LMS | `courses`, `lessons`, `learning_materials`, `assignments`, `assignment_submissions`, `quizzes`, `quiz_questions`, `quiz_attempts` |
| Operations | `books`, `book_copies`, `library_transactions`, `vehicles`, `transport_routes`, `dormitories`, `hostel_rooms`, `beds`, `inventory_items`, `stock_movements`, `suppliers`, `purchase_orders` |

## Integrity rules already applied

- UUID primary keys and non-null foreign keys where a relationship is mandatory.
- School-scoped unique references for student number, admission number, application number, employee number, invoice number, receipt number, and external payment reference.
- Indexed school/date/status dimensions for dashboard and reporting queries.
- Typed status fields for application, attendance, invoice, and payment lifecycle validation.
- `updated_at` triggers on mutable core entities.
- `audit_logs` schema ready before sensitive operational workflows are added.

## Required Phase 2–4 transactional RPCs

1. `approve_and_enroll_application(application_id, class_id)` locks the application, validates its approved state, creates student/guardian/enrollment in one transaction, and records an audit event.
2. `record_payment(payment_payload, idempotency_reference)` inserts a payment once, applies allocations, recalculates invoice balances, creates accounting entries, and issues a receipt in one transaction.
3. `publish_exam_results(exam_id)` verifies marks authorization, freezes computed results, queues report cards, and records a publication audit event.
