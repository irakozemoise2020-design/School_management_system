import { ArrowLeft, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, Badge, ConfirmModal, Empty, FormFields, Modal, PageHeader, Spinner, Tabs, setField, type FieldDef, type FormValues } from "../../components/ui/kit";
import { Button } from "../../components/ui/Button";
import { fmtDate, toOptions } from "../../lib/types";
import { useAsync, useSubmit } from "../../lib/useAsync";
import { useSchool } from "../schools/SchoolContext";
import { studentFields } from "./StudentsPage";

type Guardian = { id: string; firstName: string; lastName: string; relationship: string; phone: string | null; email: string | null; occupation: string | null; address: string | null; isPrimary: boolean; isEmergency: boolean };
type Profile = {
  student: { id: string; studentNumber: string; admissionNumber: string | null; firstName: string; middleName: string | null; lastName: string; gender: string | null; dateOfBirth: string | null; nationality: string | null; email: string | null; phone: string | null; address: string | null; status: string; createdAt: string };
  guardians: Guardian[];
  enrollments: { id: string; year: string; yearId: string; classId: string | null; className: string | null; status: string; enrollmentDate: string; isCurrentYear: boolean }[];
  attendance: { summary: { present: number; absent: number; late: number; excused: number }; recent: { date: string; status: string; note: string | null }[] } | null;
};

export function StudentProfilePage() {
  const { id } = useParams(); const { api, can, lookups } = useSchool();
  const profile = useAsync(() => api<Profile>("student_get", { studentId: id }), [id, api]);
  const [tab, setTab] = useState("overview");
  const [dialog, setDialog] = useState<null | "edit" | "class" | "status" | "guardian">(null);
  const [guardian, setGuardian] = useState<Guardian | null>(null); const [unlink, setUnlink] = useState<Guardian | null>(null);
  const data = profile.data; const student = data?.student;
  if (profile.loading && !data) return <Spinner />;
  if (profile.error || !data || !student) return <div className="space-y-4"><Link to="/students" className="inline-flex items-center gap-2 text-sm font-semibold text-sky"><ArrowLeft size={16} /> Back to students</Link><Alert tone="error">{profile.error ?? "Student not found."}</Alert></div>;
  const current = data.enrollments.find((item) => item.isCurrentYear);
  const canEdit = can("students.edit");
  const done = () => { setDialog(null); setGuardian(null); profile.reload(); };
  const tabs: [string, string][] = [["overview", "Overview"], ["guardians", "Family"], ["academics", "Academics"]]; if (data.attendance) tabs.push(["attendance", "Attendance"]);
  return <div className="space-y-6">
    <Link to="/students" className="inline-flex items-center gap-2 text-sm font-semibold text-sky print:hidden"><ArrowLeft size={16} /> Back to students</Link>
    <PageHeader eyebrow={student.studentNumber} title={[student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ")} subtitle={`${current?.className ?? "No class this year"} · ${student.gender ?? "gender not set"}`}
      actions={<>{can("students.print") && <Button type="button" variant="secondary" onClick={() => window.print()}><Printer size={16} /> Print</Button>}{canEdit && <><Button type="button" variant="secondary" onClick={() => setDialog("status")}>Change status</Button><Button type="button" variant="secondary" onClick={() => setDialog("class")}>Change class</Button><Button type="button" onClick={() => setDialog("edit")}><Pencil size={16} /> Edit</Button></>}</>} />
    <div className="flex items-center gap-3"><Badge value={student.status} />{student.admissionNumber && <span className="text-sm text-slate-500">Admission no. {student.admissionNumber}</span>}</div>
    <Tabs tabs={tabs} value={tab} onChange={setTab} />
    {tab === "overview" && <section className="surface grid gap-x-8 gap-y-5 p-6 sm:grid-cols-2 lg:grid-cols-3">{([["Date of birth", fmtDate(student.dateOfBirth)], ["Nationality", student.nationality], ["Phone", student.phone], ["Email", student.email], ["Address", student.address], ["Registered", fmtDate(student.createdAt)]] as [string, string | null][]).map(([label, value]) => <div key={label}><p className="label">{label}</p><p className="mt-1 text-sm text-slate-800">{value || "—"}</p></div>)}</section>}
    {tab === "guardians" && <section className="surface">
      <div className="flex items-center justify-between p-5"><h2 className="font-bold text-ink">Parents and guardians</h2>{canEdit && <Button type="button" size="sm" onClick={() => { setGuardian(null); setDialog("guardian"); }}><Plus size={14} /> Add</Button>}</div>
      {!data.guardians.length ? <Empty title="No guardian recorded" text="Add a parent or guardian so the school can reach the family." /> : <ul className="divide-y divide-line">{data.guardians.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="font-semibold text-ink">{item.firstName} {item.lastName} <span className="ml-1 text-sm font-normal text-slate-500">{item.relationship}</span></p><p className="mt-0.5 text-sm text-slate-500">{[item.phone, item.email, item.occupation].filter(Boolean).join(" · ") || "No contact details"}</p><div className="mt-1.5 flex gap-2">{item.isPrimary && <Badge value="approved" label="Primary contact" />}{item.isEmergency && <Badge value="late" label="Emergency contact" />}</div></div>{canEdit && <div className="flex gap-1"><Button type="button" variant="ghost" size="sm" onClick={() => { setGuardian(item); setDialog("guardian"); }}><Pencil size={14} /></Button><Button type="button" variant="ghost" size="sm" aria-label="Remove guardian" onClick={() => setUnlink(item)}><Trash2 size={14} /></Button></div>}</li>)}</ul>}
    </section>}
    {tab === "academics" && <section className="surface"><div className="p-5"><h2 className="font-bold text-ink">Class history</h2><p className="mt-1 text-sm text-slate-500">Every year the learner has been enrolled. Promotions never erase earlier years.</p></div>
      {!data.enrollments.length ? <Empty title="Not enrolled yet" text="Use “Change class” to place this learner in a class." /> : <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Academic year</th><th className="px-3 py-3">Class</th><th className="px-3 py-3">Since</th><th className="px-3 py-3">Status</th></tr></thead><tbody className="divide-y divide-line">{data.enrollments.map((row) => <tr key={row.id}><td className="px-5 py-3 font-semibold text-ink">{row.year}</td><td className="px-3 py-3">{row.className ?? "—"}</td><td className="px-3 py-3 text-slate-600">{fmtDate(row.enrollmentDate)}</td><td className="px-3 py-3"><Badge value={row.status} /></td></tr>)}</tbody></table></div>}
    </section>}
    {tab === "attendance" && data.attendance && <section className="space-y-4"><div className="grid gap-3 sm:grid-cols-4">{(["present", "late", "excused", "absent"] as const).map((key) => <div key={key} className="surface p-4 text-center"><p className="text-2xl font-bold text-ink">{data.attendance?.summary[key] ?? 0}</p><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{key}</p></div>)}</div>
      <div className="surface"><div className="p-5"><h2 className="font-bold text-ink">Last 30 records</h2></div>{!data.attendance.recent.length ? <Empty title="No attendance yet" /> : <ul className="divide-y divide-line">{data.attendance.recent.map((row) => <li key={row.date} className="flex items-center justify-between px-5 py-3 text-sm"><span>{fmtDate(row.date)}{row.note && <span className="ml-2 text-slate-500">· {row.note}</span>}</span><Badge value={row.status} /></li>)}</ul>}</div></section>}
    {dialog === "edit" && <EditStudent student={student} onClose={() => setDialog(null)} onDone={done} />}
    {dialog === "class" && <ChangeClass studentId={student.id} currentClassId={current?.classId ?? ""} options={toOptions(lookups?.classes ?? [], (item) => item.name)} onClose={() => setDialog(null)} onDone={done} />}
    {dialog === "status" && <ChangeStatus studentId={student.id} current={student.status} onClose={() => setDialog(null)} onDone={done} />}
    {dialog === "guardian" && <GuardianForm studentId={student.id} guardian={guardian} onClose={() => { setDialog(null); setGuardian(null); }} onDone={done} />}
    {unlink && <UnlinkGuardian studentId={student.id} guardian={unlink} onClose={() => setUnlink(null)} onDone={() => { setUnlink(null); profile.reload(); }} />}
  </div>;
}

function EditStudent({ student, onClose, onDone }: { student: Profile["student"]; onClose: () => void; onDone: () => void }) {
  const { api } = useSchool(); const { busy, error, run } = useSubmit();
  const [values, setValues] = useState<FormValues>({ firstName: student.firstName, middleName: student.middleName ?? "", lastName: student.lastName, gender: student.gender ?? "", dateOfBirth: student.dateOfBirth ?? "", nationality: student.nationality ?? "", phone: student.phone ?? "", email: student.email ?? "", address: student.address ?? "", admissionNumber: student.admissionNumber ?? "" });
  return <Modal title="Edit student" onClose={onClose} wide><form onSubmit={(event) => { event.preventDefault(); void run(async () => { await api("student_save", { ...values, id: student.id }); onDone(); }); }}>
    <FormFields fields={studentFields([])} values={values} onChange={setField(setValues)} />{error && <Alert tone="error">{error}</Alert>}
    <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button></div></form></Modal>;
}

function ChangeClass({ studentId, currentClassId, options, onClose, onDone }: { studentId: string; currentClassId: string; options: [string, string][]; onClose: () => void; onDone: () => void }) {
  const { api } = useSchool(); const { busy, error, run } = useSubmit(); const [classId, setClassId] = useState(currentClassId);
  return <Modal title="Change class" onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); void run(async () => { await api("student_enroll", { studentId, classId }); onDone(); }); }}>
    <label className="text-sm font-semibold text-slate-700" htmlFor="class">Class (current academic year)</label>
    <select id="class" className="field" value={classId} onChange={(event) => setClassId(event.target.value)}><option value="">Select…</option>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    {error && <Alert tone="error">{error}</Alert>}<div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy || !classId}>{busy ? "Saving…" : "Save"}</Button></div></form></Modal>;
}

function ChangeStatus({ studentId, current, onClose, onDone }: { studentId: string; current: string; onClose: () => void; onDone: () => void }) {
  const { api } = useSchool(); const { busy, error, run } = useSubmit(); const [values, setValues] = useState<FormValues>({ status: current, note: "" });
  const fields: FieldDef[] = [{ name: "status", label: "Status", type: "select", required: true, options: [["active", "Active"], ["transferred", "Transferred to another school"], ["withdrawn", "Withdrawn"], ["graduated", "Graduated"], ["inactive", "Inactive"]], span: 2 }, { name: "note", label: "Note (optional)", type: "textarea", span: 2 }];
  return <Modal title="Change status" onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); void run(async () => { await api("student_status", { studentId, ...values }); onDone(); }); }}>
    <FormFields fields={fields} values={values} onChange={setField(setValues)} /><Alert>The learner's class history is kept whatever you choose.</Alert>{error && <Alert tone="error">{error}</Alert>}
    <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div></form></Modal>;
}

function GuardianForm({ studentId, guardian, onClose, onDone }: { studentId: string; guardian: Guardian | null; onClose: () => void; onDone: () => void }) {
  const { api } = useSchool(); const { busy, error, run } = useSubmit();
  const [values, setValues] = useState<FormValues>({ firstName: guardian?.firstName ?? "", lastName: guardian?.lastName ?? "", relationship: guardian?.relationship ?? "Mother", phone: guardian?.phone ?? "", email: guardian?.email ?? "", occupation: guardian?.occupation ?? "", address: guardian?.address ?? "", isPrimary: guardian?.isPrimary ?? false, isEmergency: guardian?.isEmergency ?? false });
  const fields: FieldDef[] = [{ name: "firstName", label: "First name", required: true }, { name: "lastName", label: "Last name", required: true }, { name: "relationship", label: "Relationship", type: "select", options: [["Mother", "Mother"], ["Father", "Father"], ["Guardian", "Guardian"], ["Other", "Other"]] }, { name: "phone", label: "Phone", type: "tel" }, { name: "email", label: "Email", type: "email" }, { name: "occupation", label: "Occupation" }, { name: "address", label: "Address", span: 2 }, { name: "isPrimary", label: "Primary contact", type: "checkbox" }, { name: "isEmergency", label: "Emergency contact", type: "checkbox" }];
  return <Modal title={guardian ? "Edit guardian" : "Add guardian"} onClose={onClose} wide><form onSubmit={(event) => { event.preventDefault(); void run(async () => { await api("guardian_save", { ...values, studentId, guardianId: guardian?.id }); onDone(); }); }}>
    <FormFields fields={fields} values={values} onChange={setField(setValues)} />{error && <Alert tone="error">{error}</Alert>}
    <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div></form></Modal>;
}

function UnlinkGuardian({ studentId, guardian, onClose, onDone }: { studentId: string; guardian: Guardian; onClose: () => void; onDone: () => void }) {
  const { api } = useSchool(); const { busy, error, run } = useSubmit();
  return <ConfirmModal title="Remove guardian" text={`Remove ${guardian.firstName} ${guardian.lastName} from this student? If they are not linked to another learner their record is deleted.`} confirmLabel="Remove" danger busy={busy} error={error} onClose={onClose} onConfirm={() => void run(async () => { await api("guardian_unlink", { studentId, guardianId: guardian.id }); onDone(); })} />;
}
