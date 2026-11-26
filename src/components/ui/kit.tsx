import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { STATUS_LABEL, type Option } from "../../lib/types";
import { Button } from "./Button";

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: string; actions?: ReactNode }) {
  return <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end print:mb-2"><div>{eyebrow && <p className="label">{eyebrow}</p>}<h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>{subtitle && <p className="mt-2 max-w-2xl text-sm text-slate-500">{subtitle}</p>}</div>{actions && <div className="flex flex-wrap gap-2 print:hidden">{actions}</div>}</section>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={cn("max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-float sm:rounded-3xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
      <div className="mb-5 flex items-start justify-between gap-4"><h2 className="text-lg font-bold text-ink">{title}</h2><button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      {children}
    </div>
  </div>;
}

export function ConfirmModal({ title, text, confirmLabel, danger, busy, error, onConfirm, onClose }: { title: string; text: string; confirmLabel: string; danger?: boolean; busy?: boolean; error?: string | null; onConfirm: () => void; onClose: () => void }) {
  return <Modal title={title} onClose={onClose}>
    <p className="text-sm leading-6 text-slate-600">{text}</p>
    {error && <Alert tone="error">{error}</Alert>}
    <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="button" variant={danger ? "danger" : "primary"} disabled={busy} onClick={onConfirm}>{busy ? "Working…" : confirmLabel}</Button></div>
  </Modal>;
}

export function Alert({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: ReactNode }) {
  const styles = { info: "border-blue-100 bg-blue-50 text-blue-800", error: "border-rose-200 bg-rose-50 text-rose-700", success: "border-emerald-200 bg-emerald-50 text-emerald-800" }[tone];
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  return <div className={cn("mt-4 flex gap-2.5 rounded-xl border px-4 py-3 text-sm", styles)} role={tone === "error" ? "alert" : "status"}><Icon size={17} className="mt-0.5 shrink-0" /><div className="min-w-0">{children}</div></div>;
}

const tones: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700", enrolled: "bg-emerald-50 text-emerald-700", approved: "bg-emerald-50 text-emerald-700", present: "bg-emerald-50 text-emerald-700", promoted: "bg-blue-50 text-blue-700",
  submitted: "bg-blue-50 text-blue-700", under_review: "bg-amber-50 text-amber-700", waitlisted: "bg-amber-50 text-amber-700", late: "bg-amber-50 text-amber-700", excused: "bg-violet-50 text-violet-700",
  rejected: "bg-rose-50 text-rose-700", absent: "bg-rose-50 text-rose-700", withdrawn: "bg-rose-50 text-rose-700", draft: "bg-slate-100 text-slate-600", inactive: "bg-slate-100 text-slate-600", transferred: "bg-slate-100 text-slate-600", graduated: "bg-indigo-50 text-indigo-700", repeated: "bg-amber-50 text-amber-700",
};
export function Badge({ value, label }: { value: string; label?: string }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", tones[value] ?? "bg-slate-100 text-slate-600")}>{label ?? STATUS_LABEL[value] ?? value}</span>;
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <div className="flex items-center justify-center gap-3 p-10 text-sm text-slate-500" role="status"><span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-sky" />{label}</div>;
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return <div className="p-10 text-center"><p className="font-semibold text-slate-700">{title}</p>{text && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{text}</p>}{action && <div className="mt-4">{action}</div>}</div>;
}

export function Tabs({ tabs, value, onChange }: { tabs: [string, string][]; value: string; onChange: (value: string) => void }) {
  return <div className="flex gap-1 overflow-x-auto border-b border-line print:hidden" role="tablist">{tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)} className={cn("whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition", value === key ? "border-sky text-ink" : "border-transparent text-slate-500 hover:text-ink")}>{label}</button>)}</div>;
}

export function Pager({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return <div className="flex items-center justify-between border-t border-line px-5 py-3 text-sm text-slate-500 print:hidden"><span>Page {page} of {pages} · {total} records</span><div className="flex gap-1"><Button type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft size={15} /></Button><Button type="button" variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight size={15} /></Button></div></div>;
}

export type FieldDef = {
  name: string; label: string; type?: "text" | "email" | "tel" | "date" | "time" | "number" | "select" | "textarea" | "checkbox";
  options?: Option[]; span?: 1 | 2; placeholder?: string; hint?: string; required?: boolean; disabled?: boolean; blank?: string;
};
export type FormValues = Record<string, string | boolean>;

export function FormFields({ fields, values, onChange }: { fields: FieldDef[]; values: FormValues; onChange: (name: string, value: string | boolean) => void }) {
  return <div className="grid gap-4 sm:grid-cols-2">{fields.map((field) => {
    const id = `f-${field.name}`; const span = field.span === 2 ? "sm:col-span-2" : "";
    if (field.type === "checkbox") return <label key={field.name} className={cn("flex items-center gap-2.5 text-sm font-medium text-slate-700", span)}><input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={Boolean(values[field.name])} disabled={field.disabled} onChange={(event) => onChange(field.name, event.target.checked)} />{field.label}</label>;
    const common = { id, disabled: field.disabled, required: field.required, className: "field", value: String(values[field.name] ?? "") };
    return <div key={field.name} className={span}><label htmlFor={id} className="text-sm font-semibold text-slate-700">{field.label}{field.required && <span className="text-rose-500"> *</span>}</label>
      {field.type === "select" ? <select {...common} onChange={(event) => onChange(field.name, event.target.value)}><option value="">{field.blank ?? "Select…"}</option>{(field.options ?? []).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        : field.type === "textarea" ? <textarea {...common} rows={3} placeholder={field.placeholder} onChange={(event) => onChange(field.name, event.target.value)} />
        : <input {...common} type={field.type ?? "text"} placeholder={field.placeholder} onChange={(event) => onChange(field.name, event.target.value)} />}
      {field.hint && <p className="mt-1 text-xs text-slate-400">{field.hint}</p>}</div>;
  })}</div>;
}

/** Keeps the form's values in one object. */
export function setField(setValues: (updater: (current: FormValues) => FormValues) => void) {
  return (name: string, value: string | boolean) => setValues((current) => ({ ...current, [name]: value }));
}
