import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, GraduationCap } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../components/ui/Button";
import { schoolApi } from "../../lib/api";
import { useSchool } from "./SchoolContext";

const schema = z.object({ organizationName: z.string().min(2, "Enter the organization name"), schoolName: z.string().min(2, "Enter the school name"), schoolCode: z.string().min(2, "Use at least 2 characters").max(16).regex(/^[A-Z0-9-]+$/i, "Use letters, numbers, or hyphens only"), campusName: z.string().min(2, "Enter the first campus name"), country: z.string().min(2, "Enter a country") });
type Values = z.infer<typeof schema>;

export function SchoolOnboardingPage() {
  const { refresh } = useSchool(); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { country: "Rwanda", campusName: "Main Campus" } });
  async function submit(values: Values) {
    setBusy(true); setError(null);
    try { await schoolApi("schools.create", values); await refresh(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unable to create the school workspace."); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-mist p-6 sm:p-10"><div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:pt-14"><section className="rounded-3xl bg-ink p-8 text-white sm:p-10"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-ink"><GraduationCap /></span><p className="mt-10 text-sm font-bold uppercase tracking-[0.16em] text-blue-200">One-time setup</p><h1 className="mt-3 text-4xl font-bold leading-tight">Set up your first school workspace.</h1><p className="mt-5 max-w-sm leading-7 text-blue-100">Your account will become the school owner. You can invite campus teams and tailor roles after setup.</p><ul className="mt-9 space-y-4 text-sm text-blue-100"><Item text="Separate data boundary for your school"/><Item text="Owner access with a recorded audit trail"/><Item text="Ready for configurable academic years"/></ul></section><section className="surface p-7 sm:p-10"><p className="label">School profile</p><h2 className="mt-2 text-2xl font-bold text-ink">Create your workspace</h2><p className="mt-2 text-sm text-slate-500">This creates the organization, school, main campus, and your owner assignment.</p>{error && <p className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}<form className="mt-7 grid gap-5 sm:grid-cols-2" onSubmit={form.handleSubmit(submit)}><FormField label="Organization name" error={form.formState.errors.organizationName?.message}><input className="field" placeholder="Bright Future Education" {...form.register("organizationName")}/></FormField><FormField label="School name" error={form.formState.errors.schoolName?.message}><input className="field" placeholder="Bright Future School" {...form.register("schoolName")}/></FormField><FormField label="School code" error={form.formState.errors.schoolCode?.message}><input className="field" placeholder="BFS-KGL" {...form.register("schoolCode")}/></FormField><FormField label="Country" error={form.formState.errors.country?.message}><input className="field" {...form.register("country")}/></FormField><div className="sm:col-span-2"><FormField label="First campus" error={form.formState.errors.campusName?.message}><input className="field" placeholder="Main Campus" {...form.register("campusName")}/></FormField></div><div className="pt-2 sm:col-span-2"><Button className="w-full" size="lg" disabled={busy}>{busy ? "Creating secure workspace…" : "Create school workspace"}</Button></div></form></section></div></main>;
}
function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { return <label className="block"><span className="text-sm font-semibold text-slate-700">{label}</span>{children}{error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}</label>; }
function Item({ text }: { text: string }) { return <li className="flex items-center gap-3"><CheckCircle2 size={18} className="text-cyan-200" />{text}</li>; }
