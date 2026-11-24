import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { supabase } from "../../lib/supabase";
import { useAuth } from "./AuthProvider";

export function ResetPasswordPage() {
  const { finishRecovery } = useAuth();
  const [password, setPassword] = useState(""); const [again, setAgain] = useState("");
  const [notice, setNotice] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setNotice(null);
    if (password.length < 8) { setNotice("Use at least 8 characters."); return; }
    if (password !== again) { setNotice("The two passwords are not the same."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setNotice(error.message); return; }
    finishRecovery();
  }
  return <main className="grid min-h-screen place-items-center bg-mist p-6"><form className="surface w-full max-w-md space-y-5 p-8" onSubmit={(event) => void submit(event)}>
    <div><p className="label">Secure school workspace</p><h1 className="mt-2 text-2xl font-bold text-ink">Choose a new password</h1><p className="mt-2 text-sm text-slate-500">Enter a new password for your account.</p></div>
    {notice && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{notice}</p>}
    <label className="block"><span className="text-sm font-semibold text-slate-700">New password</span><input className="field" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)}/></label>
    <label className="block"><span className="text-sm font-semibold text-slate-700">Repeat the password</span><input className="field" type="password" autoComplete="new-password" value={again} onChange={(event) => setAgain(event.target.value)}/></label>
    <Button className="w-full" disabled={busy}>{busy ? "Saving…" : "Save password"}</Button>
  </form></main>;
}
