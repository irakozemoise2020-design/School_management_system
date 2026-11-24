# Navigation and workspace map

The Phase 1 shell includes the complete navigation map so information architecture is established before feature implementation. Future modules currently display an explicit design preview rather than inert fake controls.

| Workspace | Primary screens | Delivery phase |
|---|---|---:|
| Dashboard | Live overview, activity, attendance, collections, events | 1 |
| Admissions | Applications, review queue, documents, decision, conversion | 2 |
| Students | Directory, student profile tabs, guardians, transfers, bulk import | 2 |
| Academics | Years, terms, classes, departments, subjects, allocations | 2 |
| Attendance | Daily register, corrections, approvals, trends, absence messages | 2 |
| Timetable | Periods, rooms, planner, conflict checker, substitutions | 2 |
| Examinations | Schedules, marks entry, grades, results, report cards | 3 |
| Fees & Finance | Fee setup, invoices, payments, allocations, receipts, statements | 4 |
| Accounting | Accounts, journals, bank reconciliation, budgets, financial reports | 4 |
| Teachers & Staff | Employee profiles, leave, attendance, contracts, payroll | 6 |
| Learning | Courses, lessons, materials, assignments, quizzes, submissions | 7 |
| Library | Catalogue, copies, circulation desk, overdue/fines, reports | 6 |
| Transport | Fleet, staff, routes/stops, learner allocation, maintenance | 6 |
| Boarding | Buildings, rooms/beds, allocation, inspections, movement | 6 |
| Inventory | Stock, requisitions, POs, receiving, suppliers, valuation | 6 |
| Health & Clinic | Restricted records, visits, medication, incidents, contacts | 6 |
| Cafeteria | Menus, meals, kitchen stock, accounts, reports | 6 |
| Communication | Messages, announcements, templates, delivery tracking | 5 |
| Reports | Report catalogue, filters, scheduled/export jobs | 7 |
| Settings | School profile, access, academic configuration, integration settings | 1 |
| Platform | Super-administrator school registration and safe aggregate comparisons | 1 |

## Top navigation

- **Search:** cross-module search after data indexes and permission-aware results are implemented.
- **Notifications:** in-app notifications are backed by the `notifications` table; realtime subscriptions arrive in Phase 5.
- **School selector:** draws from the authenticated user’s `user_school_assignments` only.
- **Language selector:** English, Kinyarwanda, and French are an established UI contract; translation catalogues land alongside each production module.
- **Account menu:** session-aware sign-out and profile preference management.
