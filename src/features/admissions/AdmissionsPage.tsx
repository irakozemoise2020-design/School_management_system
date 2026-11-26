import { Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert, Badge, ConfirmModal, Empty, FormFields, Modal, PageHeader, Pager, Spinner, Tabs, setField, type FieldDef, type FormValues } from "../../components/ui/kit";
import { Button } from "../../components/ui/Button";
import { GENDERS, STATUS_LABEL, fmtDate, toOptions } from "../../lib/types";
import { useAsync, useSubmit } from "../../lib/useAsync";
import { useSchool } from "../schools/SchoolContext";

type Row = { id: string; applicationNumber: string; name: string; status: string; desiredClass: string | null; guardian: string; guardianPhone: string | null; submittedAt: string | null; createdAt: string; studentId: string | null };
type List = { rows: Row[]; total: number; counts: Record<string, number> };
type Application = { id: string; applicationNumber: string; status: string; firstName: string; middleName: string | null; lastName: string; gender: string | null; dateOfBirth: string | null; nationality: string | null; address: string | null; previousSchool: string | null; previousClass: string | null; desiredClassId: string | null; desiredClass: string | null; guardianFirstName: string | null; guardianLastName: string | null; guardianRelationship: string | null; guardianPhone: string | null; guardianEmail: string | null; notes: string | null; decisionNote: string | null; submittedAt: string | null; studentId: string | null };
const PAGE_SIZE = 25;
const TABS: [string, string][] = [["", "All"], ["draft", "Draft"], ["submitted", "Submitted"], ["under_review", "Under review"], ["waitlisted", "Waitlist"], ["approved", "Approved"], ["enrolled", "Enrolled"], ["rejected", "Rejected"]];

export function AdmissionsPage() {
  const { api, can } = useSchool();
  const [status, setStatus] = useState(""); const [search, setSearch] = useState(""); const [query, setQuery] = useState(""); const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | "new" | null>(null);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  const list = useAsync(() => api<List>("applications_list", { status, search: query, page, pageSize: PAGE_SIZE }), [status, query, page, api]);
  const counts = list.data?.counts ?? {}; const all = Object.values(counts).reduce((sum, value) => sum + Number(value), 0);
  return <div className="space-y-6">
    <PageHeader eyebrow="Enrollment pipeline" title="Admissions" subtitle="Applications move from draft to enrolled. Enrolling creates the student, guardian and class placement in one step." actions={can("admissions.create") && <Button type="button" onClick={() => setOpen("new")}><Plus size={16} /> New application</Button>} />
    <section className="surface overflow-hidden">
      <div className="px-2 pt-2"><Tabs tabs={TABS.map(([key, label]) => [key, `${label} (${key ? counts[key] ?? 0 : all})`] as [string, string])} value={status} onChange={(value) => { setStatus(value); setPage(1); }} /></div>
      <div className="border-b border-line p-4"><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 sm:max-w-md"><Search size={16} className="text-slate-400" /><input className="w-full bg-transparent text-sm outline-none" placeholder="Search by applicant, guardian or number" aria-label="Search applications" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
      {list.loading && !list.data ? <Spinner /> : list.error ? <div className="p-5"><Alert tone="error">{list.error}</Alert></div> : !list.data?.rows.length ? <Empty title="No applications here" text="New applications will appear in this list." /> :
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Applicant</th><th className="px-3 py-3">Number</th><th className="px-3 py-3">Class applied for</th><th className="px-3 py-3">Guardian</th><th className="px-3 py-3">Status</th></tr></thead>
          <tbody className="divide-y divide-line">{list.data.rows.map((row) => <tr key={row.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(row.id)}><td className="px-5 py-3 font-semibold text-ink">{row.name}</td><td className="px-3 py-3 text-slate-600">{row.applicationNumber}</td><td className="px-3 py-3 text-slate-600">{row.desiredClass ?? "—"}</td><td className="px-3 py-3 text-slate-600">{row.guardian || "—"}{row.guardianPhone && <span className="block text-xs text-slate-400">{row.guardianPhone}</span>}</td><td className="px-3 py-3"><Badge value={row.status} /></td></tr>)}</tbody></table></div>}
      {list.data && <Pager page={page} pageSize={PAGE_SIZE} total={list.data.total} onChange={setPage} />}
    </section>
    {open && <ApplicationDialog id={open === "new" ? null : open} onClose={() => setOpen(null)} onChanged={list.reload} />}
  </div>;
}

function ApplicationDialog({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { api } = useSchool();
  const detail = useAsync(() => (id ? api<Application>("application_get", { id }) : Promise.resolve(null)), [id, api]);
  if (id && detail.loading && !detail.data) return <Modal title="Application" onClose={onClose}><Spinner /></Modal>;
  if (id && detail.error) return <Modal title="Application" onClose={onClose}><Alert tone="error">{detail.error}</Alert></Modal>;
  return <ApplicationBody application={detail.data} onClose={onClose} onChanged={() => { onChanged(); detail.reload(); }} />;
}

const EDITABLE = ["draft", "submitted", "under_review", "waitlisted"];

function ApplicationBody({ application, onClose, onChanged }: { application: Application | null; onClose: () => void; onChanged: () => void }) {
  const { api, can, lookups } = useSchool(); const { busy, error, setError, run } = useSubmit();
  const [editing, setEditing] = useState(!application);
  const [ask, setAsk] = useState<null | { action: string; title: string; needNote: boolean; text: string; label: string; danger?: boolean }>(null); const [note, setNote] = useState("");
  const [duplicate, setDuplicate] = useState(false); const [result, setResult] = useState<string | null>(null);
  const [values, setValues] = useState<FormValues>({
    firstName: application?.firstName ?? "", middleName: application?.middleName ?? "", lastName: application?.lastName ?? "", gender: application?.gender ?? "", dateOfBirth: application?.dateOfBirth ?? "", nationality: application?.nationality ?? "", address: application?.address ?? "",
    previousSchool: application?.previousSchool ?? "", previousClass: application?.previousClass ?? "", desiredClassId: application?.desiredClassId ?? "",
    guardianFirstName: application?.guardianFirstName ?? "", guardianLastName: application?.guardianLastName ?? "", guardianRelationship: application?.guardianRelationship ?? "Mother", guardianPhone: application?.guardianPhone ?? "", guardianEmail: application?.guardianEmail ?? "", notes: application?.notes ?? "",
  });
  const change = setField(setValues);
  const fields: FieldDef[] = [
    { name: "firstName", label: "First name", required: true }, { name: "lastName", label: "Last name", required: true }, { name: "middleName", label: "Middle name" }, { name: "gender", label: "Gender", type: "select", options: GENDERS },
    { name: "dateOfBirth", label: "Date of birth", type: "date" }, { name: "nationality", label: "Nationality" }, { name: "address", label: "Address", span: 2 },
    { name: "desiredClassId", label: "Class applied for", type: "select", options: toOptions(lookups?.classes ?? [], (item) => item.name), hint: "Classes of the current academic year" }, { name: "previousSchool", label: "Previous school" }, { name: "previousClass", label: "Previous class" },
    { name: "guardianFirstName", label: "Guardian first name" }, { name: "guardianLastName", label: "Guardian last name" }, { name: "guardianRelationship", label: "Relationship", type: "select", options: [["Mother", "Mother"], ["Father", "Father"], ["Guardian", "Guardian"], ["Other", "Other"]] },
    { name: "guardianPhone", label: "Guardian phone", type: "tel" }, { name: "guardianEmail", label: "Guardian email", type: "email", span: 2 }, { name: "notes", label: "Notes", type: "textarea", span: 2 },
  ];
  async function save(submit: boolean) { await run(async () => { await api("application_save", { ...values, id: application?.id, submit }); onChanged(); onClose(); }); }
  async function act(action: string, allowDuplicate = false) {
    await run(async () => {
      try {
        const response = await api<{ studentId?: string; studentNumber?: string }>("application_action", { id: application?.id, action, note, allowDuplicate });
        setAsk(null); setNote(""); setDuplicate(false); onChanged();
        if (action === "enroll" && response.studentId) setResult(response.studentId); else onClose();
      } catch (caught) { setDuplicate(action === "enroll" && caught instanceof Error && /same name and date of birth/.test(caught.message)); throw caught; }
    });
  }
  if (result) return <Modal title="Student enrolled" onClose={onClose}><Alert tone="success">The student record, guardian and class placement were created from this application.</Alert><div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Close</Button><Button asChild><Link to={`/students/${result}`}>Open student profile</Link></Button></div></Modal>;
  if (editing) return <Modal title={application ? `Edit ${application.applicationNumber}` : "New application"} onClose={onClose} wide>
    <form onSubmit={(event) => { event.preventDefault(); setError(null); void save(false); }}><FormFields fields={fields} values={values} onChange={change} />{error && <Alert tone="error">{error}</Alert>}
      <div className="mt-6 flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy} variant="secondary">{busy ? "Saving…" : "Save draft"}</Button>{(!application || application.status === "draft") && <Button type="button" disabled={busy} onClick={() => void save(true)}>Save and submit</Button>}</div></form></Modal>;
  const a = application; if (!a) return null;
  const canDecide = can("admissions.approve"); const canEdit = can("admissions.edit") && EDITABLE.includes(a.status);
  const buttons: { action: string; label: string; show: boolean; danger?: boolean; needNote?: boolean; text: string }[] = [
    { action: "submit", label: "Submit", show: a.status === "draft" && can("admissions.edit"), text: "Submit this application for review?" },
    { action: "review", label: "Start review", show: canDecide && a.status === "submitted", text: "Mark this application as under review?" },
    { action: "waitlist", label: "Waitlist", show: canDecide && ["submitted", "under_review"].includes(a.status), text: "Put this applicant on the waiting list? You may add a note." },
    { action: "approve", label: "Approve", show: canDecide && ["submitted", "under_review", "waitlisted"].includes(a.status), text: "Approve this application? The applicant can then be enrolled." },
    { action: "reject", label: "Reject", show: canDecide && ["submitted", "under_review", "waitlisted", "approved"].includes(a.status), danger: true, needNote: true, text: "Reject this application. Write the reason; it is kept in the record." },
    { action: "enroll", label: "Enrol as student", show: canDecide && can("students.create") && a.status === "approved", text: "Create the student record, guardian and class placement from this application? This can only be done once." },
  ];
  const rows: [string, string | null][] = [["Date of birth", fmtDate(a.dateOfBirth)], ["Gender", a.gender], ["Nationality", a.nationality], ["Address", a.address], ["Class applied for", a.desiredClass], ["Previous school", [a.previousSchool, a.previousClass].filter(Boolean).join(" · ")], ["Guardian", [a.guardianFirstName, a.guardianLastName].filter(Boolean).join(" ") + (a.guardianRelationship ? ` (${a.guardianRelationship})` : "")], ["Guardian contact", [a.guardianPhone, a.guardianEmail].filter(Boolean).join(" · ")], ["Submitted", a.submittedAt ? fmtDate(a.submittedAt) : null], ["Notes", a.notes]];
  return <><Modal title={`${a.firstName} ${a.lastName}`} onClose={onClose} wide>
    <div className="mb-4 flex items-center gap-3"><Badge value={a.status} /><span className="text-sm text-slate-500">{a.applicationNumber}</span></div>
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label}><dt className="label">{label}</dt><dd className="mt-1 text-sm capitalize-none text-slate-800">{value || "—"}</dd></div>)}</dl>
    {a.decisionNote && <Alert>{STATUS_LABEL[a.status] ?? a.status}: {a.decisionNote}</Alert>}
    {error && !ask && <Alert tone="error">{error}</Alert>}
    <div className="mt-6 flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Close</Button>
      {canEdit && <Button type="button" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>}
      {a.studentId && <Button asChild variant="secondary"><Link to={`/students/${a.studentId}`}>Open student</Link></Button>}
      {buttons.filter((item) => item.show).map((item) => <Button key={item.action} type="button" variant={item.danger ? "danger" : item.action === "enroll" || item.action === "approve" ? "primary" : "secondary"} onClick={() => { setError(null); setNote(""); setAsk({ action: item.action, title: item.label, needNote: Boolean(item.needNote), text: item.text, label: item.label, danger: item.danger }); }}>{item.label}</Button>)}
    </div></Modal>
    {ask && (ask.action === "reject" || ask.action === "waitlist" ? <Modal title={ask.title} onClose={() => setAsk(null)}><p className="text-sm text-slate-600">{ask.text}</p><label className="mt-4 block text-sm font-semibold text-slate-700" htmlFor="note">{ask.needNote ? "Reason" : "Note (optional)"}</label><textarea id="note" className="field" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />{error && <Alert tone="error">{error}</Alert>}<div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setAsk(null)}>Cancel</Button><Button type="button" variant={ask.danger ? "danger" : "primary"} disabled={busy} onClick={() => void act(ask.action)}>{busy ? "Working…" : ask.label}</Button></div></Modal>
      : <ConfirmModal title={ask.title} text={ask.text} confirmLabel={ask.label} busy={busy} error={error} onClose={() => setAsk(null)} onConfirm={() => void act(ask.action)} />)}
    {ask && duplicate && <Modal title="Possible duplicate" onClose={() => setDuplicate(false)}><Alert tone="error">{error}</Alert><div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setDuplicate(false)}>Cancel</Button><Button type="button" disabled={busy} onClick={() => void act("enroll", true)}>Enrol anyway</Button></div></Modal>}
  </>;
}
