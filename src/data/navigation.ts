import {
  Activity, BarChart3, BookOpen, BriefcaseBusiness, Bus, CalendarDays, ClipboardCheck,
  CreditCard, FileBarChart, GraduationCap, HeartPulse, Hotel, LayoutDashboard, Library,
  MessageSquareMore, Package, Settings, ShieldCheck, UsersRound, UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

export type NavigationItem = { label: string; href: string; icon: LucideIcon; phase: number };

export const navigation: NavigationItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, phase: 1 },
  { label: "Admissions", href: "/admissions", icon: ClipboardCheck, phase: 2 },
  { label: "Students", href: "/students", icon: UsersRound, phase: 2 },
  { label: "Academics", href: "/academics", icon: GraduationCap, phase: 2 },
  { label: "Attendance", href: "/attendance", icon: Activity, phase: 2 },
  { label: "Timetable", href: "/timetable", icon: CalendarDays, phase: 2 },
  { label: "Examinations", href: "/examinations", icon: FileBarChart, phase: 3 },
  { label: "Fees & Finance", href: "/finance", icon: CreditCard, phase: 4 },
  { label: "Accounting", href: "/accounting", icon: BarChart3, phase: 4 },
  { label: "Teachers & Staff", href: "/staff", icon: BriefcaseBusiness, phase: 6 },
  { label: "Learning", href: "/learning", icon: BookOpen, phase: 7 },
  { label: "Library", href: "/library", icon: Library, phase: 6 },
  { label: "Transport", href: "/transport", icon: Bus, phase: 6 },
  { label: "Boarding", href: "/boarding", icon: Hotel, phase: 6 },
  { label: "Inventory", href: "/inventory", icon: Package, phase: 6 },
  { label: "Health & Clinic", href: "/clinic", icon: HeartPulse, phase: 6 },
  { label: "Cafeteria", href: "/cafeteria", icon: UtensilsCrossed, phase: 6 },
  { label: "Communication", href: "/communication", icon: MessageSquareMore, phase: 5 },
  { label: "Reports", href: "/reports", icon: FileBarChart, phase: 7 },
  { label: "Settings", href: "/settings", icon: Settings, phase: 1 },
  { label: "Platform", href: "/platform", icon: ShieldCheck, phase: 1 },
];

export const previewContent: Record<string, { eyebrow: string; description: string; focus: string[]; tone: string }> = {
  admissions: { eyebrow: "Enrollment pipeline", description: "Applications, documents, decisions, waiting lists, and a safe handoff into student records.", focus: ["Application review queue", "Document verification", "Approval to enrollment"], tone: "from-cyan-500 to-blue-700" },
  students: { eyebrow: "Student information system", description: "The permanent learner record with academics, guardians, attendance, finance, and confidential health access controls.", focus: ["Unified learner profile", "Family relationships", "Promotion history"], tone: "from-blue-500 to-indigo-700" },
  academics: { eyebrow: "Academic structure", description: "Academic years, terms, classes, subjects, curricula, teaching assignments, and school-specific grading policies.", focus: ["Class and subject setup", "Capacity planning", "Teacher allocations"], tone: "from-violet-500 to-purple-700" },
  attendance: { eyebrow: "Daily presence", description: "Fast class registers with approvals, corrections, attendance patterns, and parent notifications.", focus: ["Class attendance register", "Absence workflow", "Live attendance insights"], tone: "from-emerald-500 to-teal-700" },
  timetable: { eyebrow: "Scheduling engine", description: "Interactive weekly schedules that protect against conflicts between teachers, rooms, periods, and classes.", focus: ["Weekly planner", "Conflict detection", "Substitution management"], tone: "from-orange-400 to-rose-600" },
  examinations: { eyebrow: "Assessment & outcomes", description: "Examinations, controlled marks entry, grading, ranks, report cards, and promotion decisions.", focus: ["Marks-entry workspace", "Grading workflow", "Report cards"], tone: "from-fuchsia-500 to-purple-700" },
  finance: { eyebrow: "Student fees", description: "Fee structures, invoices, payment allocation, receipts, balances, waivers, and parent statements.", focus: ["Collections command centre", "Invoice allocation", "Payment audit trail"], tone: "from-sky-500 to-blue-800" },
  accounting: { eyebrow: "Financial controls", description: "Chart of accounts, ledgers, budgets, reconciliation, and accounting entries generated from operational events.", focus: ["General ledger", "Bank reconciliation", "Financial statements"], tone: "from-slate-600 to-ink" },
  staff: { eyebrow: "People operations", description: "Employee records, contracts, leave, staff attendance, payroll, and secure payslips.", focus: ["Staff directory", "Leave workflow", "Payroll approvals"], tone: "from-amber-400 to-orange-600" },
  learning: { eyebrow: "Learning management", description: "Teacher courses, protected materials, assignments, feedback, quizzes, and learner progress.", focus: ["Course workspace", "Assignment feedback", "Quiz performance"], tone: "from-indigo-500 to-violet-700" },
  library: { eyebrow: "Library circulation", description: "Cataloguing, copies, checkouts, returns, fines, due dates, and reader accounts.", focus: ["Catalog and availability", "Issue and return desk", "Overdue analysis"], tone: "from-rose-500 to-pink-700" },
  transport: { eyebrow: "Safe journeys", description: "Vehicles, routes, stops, driver teams, student allocations, maintenance, and transport fees.", focus: ["Fleet overview", "Route roster", "Vehicle maintenance"], tone: "from-cyan-500 to-sky-700" },
  boarding: { eyebrow: "Residential life", description: "Buildings, rooms, beds, occupancy, wardens, hostel attendance, inspections, and movement records.", focus: ["Bed allocation", "Occupancy board", "Student movement"], tone: "from-purple-500 to-indigo-700" },
  inventory: { eyebrow: "Procurement & stock", description: "Departmental inventory, suppliers, purchase orders, receipts, stock movements, and low-stock alerts.", focus: ["Stock control", "Purchase workflow", "Supplier history"], tone: "from-lime-500 to-emerald-700" },
  clinic: { eyebrow: "Confidential care", description: "Restricted medical records, visits, incidents, medication administration, and approved parent notifications.", focus: ["Clinical visit log", "Restricted records", "Emergency response"], tone: "from-red-500 to-rose-700" },
  cafeteria: { eyebrow: "Meals & nutrition", description: "Menus, meal allocations, kitchen inventory, sales, meal attendance, and food-cost reporting.", focus: ["Meal planning", "Kitchen stock", "Daily service"], tone: "from-yellow-400 to-orange-600" },
  communication: { eyebrow: "Connected community", description: "Role-aware messaging, announcements, templates, delivery status, and provider integrations.", focus: ["Announcement composer", "Message threads", "Delivery monitoring"], tone: "from-blue-500 to-cyan-600" },
  reports: { eyebrow: "Reporting centre", description: "Filterable academic, attendance, financial, HR, and operational reports with controlled exports.", focus: ["Report catalogue", "Saved filters", "Export permissions"], tone: "from-teal-500 to-emerald-700" },
};
