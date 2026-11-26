import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { AuthPage } from "../features/auth/AuthPage";
import { ResetPasswordPage } from "../features/auth/ResetPasswordPage";
import { useAuth } from "../features/auth/AuthProvider";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { PlatformPage } from "../features/platform/PlatformPage";
import { ModulePreviewPage } from "../features/roadmap/ModulePreviewPage";
import { SchoolOnboardingPage } from "../features/schools/SchoolOnboardingPage";
import { SchoolProvider, useSchool } from "../features/schools/SchoolContext";
import { SettingsPage } from "../features/settings/SettingsPage";
import { AcademicsPage } from "../features/academics/AcademicsPage";
import { AdmissionsPage } from "../features/admissions/AdmissionsPage";
import { AttendancePage } from "../features/attendance/AttendancePage";
import { StaffPage } from "../features/staff/StaffPage";
import { StudentProfilePage } from "../features/students/StudentProfilePage";
import { StudentsPage } from "../features/students/StudentsPage";
import { TimetablePage } from "../features/timetable/TimetablePage";
import { Guard } from "../components/layout/Guard";

function Loading() { return <main className="grid min-h-screen place-items-center bg-mist"><div className="text-center"><div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-sky"/><p className="mt-4 text-sm text-slate-500">Opening secure workspace…</p></div></main>; }
function ProtectedApp() { const { schools, loading } = useSchool(); if (loading) return <Loading/>; if (!schools.length) return <SchoolOnboardingPage/>; return <AppShell><Routes><Route path="/dashboard" element={<DashboardPage/>}/><Route path="/admissions" element={<Guard need="admissions.view"><AdmissionsPage/></Guard>}/><Route path="/students" element={<Guard need="students.view"><StudentsPage/></Guard>}/><Route path="/students/:id" element={<Guard need="students.view"><StudentProfilePage/></Guard>}/><Route path="/academics" element={<Guard need="academics.view"><AcademicsPage/></Guard>}/><Route path="/attendance" element={<Guard need="attendance.view"><AttendancePage/></Guard>}/><Route path="/timetable" element={<Guard need="timetable.view"><TimetablePage/></Guard>}/><Route path="/staff" element={<Guard need="staff.view"><StaffPage/></Guard>}/><Route path="/settings" element={<SettingsPage/>}/><Route path="/platform" element={<PlatformPage/>}/><Route path="/:module" element={<ModulePreviewPage/>}/><Route path="*" element={<Navigate to="/dashboard" replace/>}/></Routes></AppShell>; }
function AuthenticatedArea() { return <SchoolProvider><ProtectedApp/></SchoolProvider>; }
export function App() { const { configured, loading, session, recovering } = useAuth(); if (!configured) return <ConfigurationNotice/>; if (loading) return <Loading/>; if (recovering && session) return <ResetPasswordPage/>; return session ? <AuthenticatedArea/> : <AuthPage/>; }
function ConfigurationNotice() { return <main className="grid min-h-screen place-items-center bg-mist p-6"><section className="surface max-w-lg p-8"><p className="label">Configuration required</p><h1 className="mt-2 text-2xl font-bold text-ink">Connect EduNexus to Supabase</h1><p className="mt-3 text-sm leading-6 text-slate-600">Create <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">.env.local</code> from <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">.env.example</code>, add your project URL and anonymous key, then run the Phase 1 migration before starting the app.</p></section></main>; }
