import { zodResolver } from "@hookform/resolvers/zod";
import { GraduationCap, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../components/ui/Button";
import { supabase } from "../../lib/supabase";

const signInSchema = z.object({ email: z.email("Enter a valid email address"), password: z.string().min(8, "Use at least 8 characters") });
const signUpSchema = signInSchema.extend({ fullName: z.string().min(2, "Enter your full name") });
type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;

export function AuthPage() {
  const [mode, setMode] = useState<"sign-in" | "sign-up" | "reset">("sign-in");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signInForm = useForm<SignInValues>({ resolver: zodResolver(signInSchema) });
  const signUpForm = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema) });
  const resetForm = useForm<Pick<SignInValues, "email">>({ resolver: zodResolver(signInSchema.pick({ email: true })) });

  async function signIn(values: SignInValues) {
    setBusy(true); setNotice(null);
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) setNotice(error.message);
    setBusy(false);
  }
  async function signUp(values: SignUpValues) {
    setBusy(true); setNotice(null);
    const { error } = await supabase.auth.signUp({ email: values.email, password: values.password, options: { data: { full_name: values.fullName } } });
    setNotice(error ? error.message : "Check your email to confirm your account, then sign in.");
    setBusy(false);
  }
  async function resetPassword(values: Pick<SignInValues, "email">) {
    setBusy(true); setNotice(null);
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, { redirectTo: `${window.location.origin}/` });
    setNotice(error ? error.message : "Password-reset instructions have been sent if this account exists.");
    setBusy(false);
  }
  const title = mode === "sign-in" ? "Welcome back" : mode === "sign-up" ? "Create your account" : "Reset your password";

  return (
    <main className="grid min-h-screen bg-mist lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden bg-ink p-14 text-white lg:block">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sky/25 blur-3xl" />
        <div className="absolute -bottom-28 left-10 h-80 w-80 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="relative flex h-full max-w-xl flex-col justify-between">
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-ink"><GraduationCap /></span><span className="text-lg font-bold tracking-tight">EduNexus</span></div>
          <div>
            <p className="mb-4 text-sm font-bold uppercase tracking-[0.17em] text-blue-200">School operations, unified</p>
            <h1 className="max-w-lg text-5xl font-bold leading-[1.08] tracking-tight">Every learner. Every operation. One trusted platform.</h1>
            <p className="mt-6 max-w-md text-base leading-7 text-blue-100">A secure multi-school foundation for administration, learning, families, finance, and operational teams.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm text-blue-100"><Feature icon={ShieldCheck} text="School-level data isolation" /><Feature icon={KeyRound} text="Role-based access" /><Feature icon={Mail} text="Family-ready communication" /></div>
        </div>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden"><span className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-white"><GraduationCap /></span><span className="font-bold text-ink">EduNexus</span></div>
          <p className="label">Secure school workspace</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-ink">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{mode === "sign-in" ? "Sign in to access the schools assigned to you." : mode === "sign-up" ? "Start by creating your administrator account." : "We’ll email you a secure reset link."}</p>
          {notice && <p className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800" role="status">{notice}</p>}
          {mode === "sign-in" && <form className="mt-7 space-y-5" onSubmit={signInForm.handleSubmit(signIn)}><Field label="Email address" error={signInForm.formState.errors.email?.message} input={signInForm.register("email")} type="email" autoComplete="email" /><Field label="Password" error={signInForm.formState.errors.password?.message} input={signInForm.register("password")} type="password" autoComplete="current-password" /><div className="flex justify-end"><button type="button" className="text-sm font-semibold text-sky hover:text-ink" onClick={() => { setMode("reset"); setNotice(null); }}>Forgot password?</button></div><Button className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button></form>}
          {mode === "sign-up" && <form className="mt-7 space-y-5" onSubmit={signUpForm.handleSubmit(signUp)}><Field label="Full name" error={signUpForm.formState.errors.fullName?.message} input={signUpForm.register("fullName")} autoComplete="name" /><Field label="Work email" error={signUpForm.formState.errors.email?.message} input={signUpForm.register("email")} type="email" autoComplete="email" /><Field label="Password" hint="At least 8 characters" error={signUpForm.formState.errors.password?.message} input={signUpForm.register("password")} type="password" autoComplete="new-password" /><Button className="w-full" disabled={busy}>{busy ? "Creating account…" : "Create account"}</Button></form>}
          {mode === "reset" && <form className="mt-7 space-y-5" onSubmit={resetForm.handleSubmit(resetPassword)}><Field label="Email address" error={resetForm.formState.errors.email?.message} input={resetForm.register("email")} type="email" autoComplete="email" /><Button className="w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button></form>}
          <p className="mt-7 text-center text-sm text-slate-500">{mode === "sign-in" ? <>New to EduNexus? <button className="font-semibold text-sky hover:text-ink" onClick={() => { setMode("sign-up"); setNotice(null); }}>Create an account</button></> : <button className="font-semibold text-sky hover:text-ink" onClick={() => { setMode("sign-in"); setNotice(null); }}>Back to sign in</button>}</p>
        </div>
      </section>
    </main>
  );
}

function Field({ label, hint, error, input, type = "text", autoComplete }: { label: string; hint?: string; error?: string; input: UseFormRegisterReturn; type?: string; autoComplete?: string }) {
  return <label className="block"><span className="flex justify-between text-sm font-semibold text-slate-700">{label}{hint && <span className="font-normal text-slate-400">{hint}</span>}</span><input className="field" type={type} autoComplete={autoComplete} {...input} />{error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}</label>;
}

function Feature({ icon: Icon, text }: { icon: typeof ShieldCheck; text: string }) { return <div className="rounded-xl border border-white/10 bg-white/5 p-3"><Icon size={18} className="mb-3 text-blue-200" /><p className="leading-5">{text}</p></div>; }
