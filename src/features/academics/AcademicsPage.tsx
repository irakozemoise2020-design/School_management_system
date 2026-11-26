import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { FormModal } from "../../components/ui/FormModal";
import { Alert, Badge, Empty, Modal, PageHeader, Spinner, Tabs, type FieldDef } from "../../components/ui/kit";
import { fmtDate, toOptions } from "../../lib/types";
import { useAsync, useSubmit } from "../../lib/useAsync";
import { useSchool } from "../schools/SchoolContext";

type Term = { id: string; name: string; startsOn: string; endsOn: string };
type YearRow = { id: string; name: string; startsOn: string; endsOn: string; isCurrent: boolean; classCount: number; terms: Term[] };
type ClassRow = { id: string; name: string; levelOrder: number; capacity: number | null; yearId: string; students: number; classTeacher: string | null; subjects: number };
type SubjectRow = { id: string; name: string; code: string | null; departmentId: string | null; department: string | null; classes: number };
type DepartmentRow = { id: string; name: string; code: string | null; subjects: number };
type Assignment = { id: string; employeeId: string; teacher: string; subjectId: string | null; subject: string | null; isClassTeacher: boolean };

const TABS: [string, string][] = [["years", "Years & terms"], ["classes", "Classes"], ["subjects", "Subjects"], ["departments", "Departments"]];

export function AcademicsPage() {
  const [tab, setTab] = useState("years");
  return <div className="space-y-6">
    <PageHeader eyebrow="Academic structure" title="Academics" subtitle="Set up academic years and terms, classes, subjects and who teaches what. Other modules use this setup." />
    <section className="surface overflow-hidden"><div className="px-2 pt-2"><Tabs tabs={TABS} value={tab} onChange={setTab} /></div>
      <div className="p-5">{tab === "years" ? <YearsTab /> : tab === "classes" ? <ClassesTab /> : tab === "subjects" ? <SubjectsTab /> : <DepartmentsTab />}</div></section>
  </div>;
}

function YearsTab() {
  const { api, can, refreshLookups } = useSchool();
  const list = useAsync(() => api<{ years: YearRow[] }>("years_list"), [api]);
  const [yearForm, setYearForm] = useState<YearRow | "new" | null>(null);
  const [termForm, setTermForm] = useState<{ year: YearRow; term: Term | null } | null>(null);
  const done = () => { list.reload(); void refreshLookups(); };
  const yearFields: FieldDef[] = [{ name: "name", label: "Name", required: true, placeholder: "2026-2027", span: 2 }, { name: "startsOn", label: "Starts on", type: "date", required: true }, { name: "endsOn", label: "Ends on", type: "date", required: true }, { name: "isCurrent", label: "This is the current academic year", type: "checkbox", span: 2 }];
  const termFields: FieldDef[] = [{ name: "name", label: "Term name", required: true, placeholder: "Term 1", span: 2 }, { name: "startsOn", label: "Starts on", type: "date", required: true }, { name: "endsOn", label: "Ends on", type: "date", required: true }];
  if (list.loading && !list.data) return <Spinner />;
  if (list.error) return <Alert tone="error">{list.error}</Alert>;
  const years = list.data?.years ?? [];
  return <div>
    <div className="mb-4 flex justify-end">{can("academics.create") && <Button type="button" onClick={() => setYearForm("new")}><Plus size={16} /> New academic year</Button>}</div>
    {!years.length ? <Empty title="No academic years yet" text="Create the first academic year, then add its terms and classes." /> :
      <div className="space-y-4">{years.map((year) => <article key={year.id} className="rounded-2xl border border-line p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-ink">{year.name} {year.isCurrent && <span className="ml-2 align-middle"><Badge value="active" label="Current" /></span>}</h3><p className="text-sm text-slate-500">{fmtDate(year.startsOn)} – {fmtDate(year.endsOn)} · {year.classCount} classes</p></div>
          <div className="flex gap-2">{can("academics.create") && <Button type="button" variant="secondary" size="sm" onClick={() => setTermForm({ year, term: null })}>Add term</Button>}{can("academics.edit") && <Button type="button" variant="secondary" size="sm" onClick={() => setYearForm(year)}>Edit</Button>}</div></div>
        <ul className="mt-4 grid gap-2 sm:grid-cols-3">{year.terms.length ? year.terms.map((term) => <li key={term.id}><button type="button" disabled={!can("academics.edit")} onClick={() => setTermForm({ year, term })} className="w-full rounded-xl bg-slate-50 p-3 text-left hover:bg-slate-100 disabled:hover:bg-slate-50"><span className="block text-sm font-semibold text-ink">{term.name}</span><span className="text-xs text-slate-500">{fmtDate(term.startsOn)} – {fmtDate(term.endsOn)}</span></button></li>) : <li className="text-sm text-slate-400">No terms yet.</li>}</ul>
      </article>)}</div>}
    {yearForm && <FormModal title={yearForm === "new" ? "New academic year" : `Edit ${yearForm.name}`} fields={yearFields} initial={yearForm === "new" ? { name: "", startsOn: "", endsOn: "", isCurrent: !years.length } : { name: yearForm.name, startsOn: yearForm.startsOn, endsOn: yearForm.endsOn, isCurrent: yearForm.isCurrent }}
      onClose={() => setYearForm(null)} onSave={async (values) => { await api("year_save", { ...values, id: yearForm === "new" ? undefined : yearForm.id }); done(); }}
      onDelete={yearForm !== "new" && can("academics.delete") ? async () => { await api("year_delete", { id: yearForm.id }); done(); } : undefined} deleteText="Delete this academic year? It must have no classes or students." />}
    {termForm && <FormModal title={termForm.term ? `Edit ${termForm.term.name}` : `Add term to ${termForm.year.name}`} fields={termFields} initial={termForm.term ? { name: termForm.term.name, startsOn: termForm.term.startsOn, endsOn: termForm.term.endsOn } : { name: "", startsOn: "", endsOn: "" }}
      onClose={() => setTermForm(null)} onSave={async (values) => { await api("term_save", { ...values, id: termForm.term?.id, academicYearId: termForm.year.id }); done(); }}
      onDelete={termForm.term && can("academics.delete") ? async () => { await api("term_delete", { id: termForm.term!.id }); done(); } : undefined} />}
  </div>;
}

function ClassesTab() {
  const { api, can, lookups, refreshLookups } = useSchool();
  const [yearId, setYearId] = useState<string>("");
  const list = useAsync(() => api<{ yearId: string | null; classes: ClassRow[] }>("classes_list", { yearId: yearId || undefined }), [api, yearId]);
  const [form, setForm] = useState<ClassRow | "new" | null>(null); const [detail, setDetail] = useState<ClassRow | null>(null);
  const activeYear = yearId || list.data?.yearId || lookups?.currentYearId || "";
  const fields: FieldDef[] = [{ name: "name", label: "Class name", required: true, placeholder: "Primary 4A", span: 2 }, { name: "levelOrder", label: "Level order", type: "number", hint: "Used for sorting and promotion (1, 2, 3…)" }, { name: "capacity", label: "Capacity", type: "number", hint: "Leave empty for no limit" }];
  const done = () => { list.reload(); void refreshLookups(activeYear || undefined); };
  return <div>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><label className="text-sm font-semibold text-slate-700">Academic year<select className="field mt-1 min-w-48" value={activeYear} onChange={(event) => setYearId(event.target.value)}>{(lookups?.years ?? []).map((year) => <option key={year.id} value={year.id}>{year.name}{year.isCurrent ? " (current)" : ""}</option>)}</select></label>
      {can("academics.create") && activeYear && <Button type="button" onClick={() => setForm("new")}><Plus size={16} /> New class</Button>}</div>
    {list.loading && !list.data ? <Spinner /> : list.error ? <Alert tone="error">{list.error}</Alert> : !list.data?.classes.length ? <Empty title="No classes in this year" text={activeYear ? "Add the classes of this academic year." : "Create an academic year first."} /> :
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Class</th><th className="px-3 py-3">Students</th><th className="px-3 py-3">Class teacher</th><th className="px-3 py-3">Subjects</th><th className="px-3 py-3" /></tr></thead>
        <tbody className="divide-y divide-line">{list.data.classes.map((item) => <tr key={item.id}><td className="px-4 py-3 font-semibold text-ink">{item.name}</td><td className="px-3 py-3 text-slate-600">{item.students}{item.capacity ? ` / ${item.capacity}` : ""}</td><td className="px-3 py-3 text-slate-600">{item.classTeacher ?? "—"}</td><td className="px-3 py-3 text-slate-600">{item.subjects}</td>
          <td className="px-3 py-3 text-right"><div className="flex justify-end gap-2"><Button type="button" size="sm" variant="secondary" onClick={() => setDetail(item)}>Subjects & teachers</Button>{can("academics.edit") && <Button type="button" size="sm" variant="ghost" onClick={() => setForm(item)}>Edit</Button>}</div></td></tr>)}</tbody></table></div>}
    {form && <FormModal title={form === "new" ? "New class" : `Edit ${form.name}`} fields={fields} initial={form === "new" ? { name: "", levelOrder: String((list.data?.classes.length ?? 0) + 1), capacity: "" } : { name: form.name, levelOrder: String(form.levelOrder), capacity: form.capacity ? String(form.capacity) : "" }}
      onClose={() => setForm(null)} onSave={async (values) => { await api("class_save", { ...values, levelOrder: values.levelOrder === "" ? 0 : Number(values.levelOrder), capacity: values.capacity === "" ? null : Number(values.capacity), id: form === "new" ? undefined : form.id, academicYearId: activeYear }); done(); }}
      onDelete={form !== "new" && can("academics.delete") ? async () => { await api("class_delete", { id: form.id }); done(); } : undefined} deleteText="Delete this class? It must have no students, attendance or timetable." />}
    {detail && <ClassDetail item={detail} onClose={() => { setDetail(null); done(); }} />}
  </div>;
}

function ClassDetail({ item, onClose }: { item: ClassRow; onClose: () => void }) {
  const { api, can, lookups } = useSchool(); const canEdit = can("academics.edit"); const { busy, error, setError, run } = useSubmit();
  const subjects = useAsync(() => api<{ subjectIds: string[] }>("class_subjects_get", { classId: item.id }), [api, item.id]);
  const assignments = useAsync(() => api<{ assignments: Assignment[] }>("assignments_list", { classId: item.id }), [api, item.id]);
  const [picked, setPicked] = useState<string[] | null>(null); const [teacherId, setTeacherId] = useState(""); const [subjectId, setSubjectId] = useState(""); const [asClassTeacher, setAsClassTeacher] = useState(false);
  const chosen = picked ?? subjects.data?.subjectIds ?? []; const classSubjects = (lookups?.subjects ?? []).filter((subject) => (subjects.data?.subjectIds ?? []).includes(subject.id));
  function toggle(id: string) { setPicked(chosen.includes(id) ? chosen.filter((value) => value !== id) : [...chosen, id]); }
  return <Modal title={`${item.name} — subjects & teachers`} onClose={onClose} wide>
    <h3 className="text-sm font-bold text-ink">Subjects taught in this class</h3>
    {subjects.loading && !subjects.data ? <Spinner /> : <div className="mt-3 grid gap-2 sm:grid-cols-2">{(lookups?.subjects ?? []).length ? (lookups?.subjects ?? []).map((subject) => <label key={subject.id} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-sm"><input type="checkbox" className="h-4 w-4" disabled={!canEdit} checked={chosen.includes(subject.id)} onChange={() => toggle(subject.id)} />{subject.name}{subject.code && <span className="text-xs text-slate-400">{subject.code}</span>}</label>) : <p className="text-sm text-slate-500">Add subjects in the Subjects tab first.</p>}</div>}
    {canEdit && picked && <div className="mt-3"><Button type="button" disabled={busy} onClick={() => void run(async () => { await api("class_subjects_set", { classId: item.id, subjectIds: picked }); setPicked(null); subjects.reload(); })}>{busy ? "Saving…" : "Save subjects"}</Button></div>}
    <h3 className="mt-8 text-sm font-bold text-ink">Teachers</h3>
    {assignments.loading && !assignments.data ? <Spinner /> : !assignments.data?.assignments.length ? <p className="mt-2 text-sm text-slate-500">No teachers assigned yet.</p> :
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line">{assignments.data.assignments.map((row) => <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><span><span className="font-semibold text-ink">{row.teacher}</span> <span className="text-slate-500">— {row.isClassTeacher ? "Class teacher" : row.subject}</span></span>
        {canEdit && <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => void run(async () => { await api("assignment_delete", { id: row.id }); assignments.reload(); })}>Remove</button>}</li>)}</ul>}
    {canEdit && <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="text-sm font-semibold text-slate-700">Teacher<select className="field mt-1" value={teacherId} onChange={(event) => setTeacherId(event.target.value)}><option value="">Select…</option>{toOptions(lookups?.teachers ?? [], (teacher) => teacher.name).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm font-semibold text-slate-700">Subject<select className="field mt-1" disabled={asClassTeacher} value={asClassTeacher ? "" : subjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="">Select…</option>{classSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
      <Button type="button" disabled={busy || !teacherId} onClick={() => void run(async () => { await api("assignment_save", { classId: item.id, employeeId: teacherId, subjectId: asClassTeacher ? undefined : subjectId || undefined, isClassTeacher: asClassTeacher }); setTeacherId(""); setSubjectId(""); setAsClassTeacher(false); assignments.reload(); })}>Assign</Button>
      <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-3"><input type="checkbox" className="h-4 w-4" checked={asClassTeacher} onChange={(event) => setAsClassTeacher(event.target.checked)} />Make this teacher the class teacher (replaces the current one)</label></div>}
    {error && <Alert tone="error">{error}</Alert>}
    <div className="mt-6 flex justify-end"><Button type="button" variant="secondary" onClick={() => { setError(null); onClose(); }}>Close</Button></div>
  </Modal>;
}

function SubjectsTab() {
  const { api, can, lookups, refreshLookups } = useSchool();
  const list = useAsync(() => api<{ subjects: SubjectRow[] }>("subjects_list"), [api]);
  const [form, setForm] = useState<SubjectRow | "new" | null>(null);
  const fields: FieldDef[] = [{ name: "name", label: "Subject name", required: true, placeholder: "Mathematics" }, { name: "code", label: "Code", placeholder: "MATH" }, { name: "departmentId", label: "Department", type: "select", options: toOptions(lookups?.departments ?? [], (item) => item.name), blank: "No department", span: 2 }];
  const done = () => { list.reload(); void refreshLookups(); };
  return <div>
    <div className="mb-4 flex justify-end">{can("academics.create") && <Button type="button" onClick={() => setForm("new")}><Plus size={16} /> New subject</Button>}</div>
    {list.loading && !list.data ? <Spinner /> : list.error ? <Alert tone="error">{list.error}</Alert> : !list.data?.subjects.length ? <Empty title="No subjects yet" text="Add the subjects your school teaches." /> :
      <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Subject</th><th className="px-3 py-3">Code</th><th className="px-3 py-3">Department</th><th className="px-3 py-3">Classes</th><th className="px-3 py-3" /></tr></thead>
        <tbody className="divide-y divide-line">{list.data.subjects.map((item) => <tr key={item.id}><td className="px-4 py-3 font-semibold text-ink">{item.name}</td><td className="px-3 py-3 text-slate-600">{item.code ?? "—"}</td><td className="px-3 py-3 text-slate-600">{item.department ?? "—"}</td><td className="px-3 py-3 text-slate-600">{item.classes}</td><td className="px-3 py-3 text-right">{can("academics.edit") && <Button type="button" size="sm" variant="ghost" onClick={() => setForm(item)}>Edit</Button>}</td></tr>)}</tbody></table></div>}
    {form && <FormModal title={form === "new" ? "New subject" : `Edit ${form.name}`} fields={fields} initial={form === "new" ? { name: "", code: "", departmentId: "" } : { name: form.name, code: form.code ?? "", departmentId: form.departmentId ?? "" }}
      onClose={() => setForm(null)} onSave={async (values) => { await api("subject_save", { ...values, departmentId: values.departmentId || undefined, id: form === "new" ? undefined : form.id }); done(); }}
      onDelete={form !== "new" && can("academics.delete") ? async () => { await api("subject_delete", { id: form.id }); done(); } : undefined} deleteText="Delete this subject? It must not be used by any class or timetable." />}
  </div>;
}

function DepartmentsTab() {
  const { api, can, refreshLookups } = useSchool();
  const list = useAsync(() => api<{ departments: DepartmentRow[] }>("departments_list"), [api]);
  const [form, setForm] = useState<DepartmentRow | "new" | null>(null);
  const fields: FieldDef[] = [{ name: "name", label: "Department name", required: true, placeholder: "Sciences" }, { name: "code", label: "Code", placeholder: "SCI" }];
  const done = () => { list.reload(); void refreshLookups(); };
  return <div>
    <div className="mb-4 flex justify-end">{can("academics.create") && <Button type="button" onClick={() => setForm("new")}><Plus size={16} /> New department</Button>}</div>
    {list.loading && !list.data ? <Spinner /> : list.error ? <Alert tone="error">{list.error}</Alert> : !list.data?.departments.length ? <Empty title="No departments yet" text="Departments group subjects and staff. They are optional." /> :
      <ul className="divide-y divide-line rounded-xl border border-line">{list.data.departments.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span><span className="font-semibold text-ink">{item.name}</span>{item.code && <span className="ml-2 text-xs text-slate-400">{item.code}</span>}<span className="ml-3 text-slate-500">{item.subjects} subjects</span></span>{can("academics.edit") && <Button type="button" size="sm" variant="ghost" onClick={() => setForm(item)}>Edit</Button>}</li>)}</ul>}
    {form && <FormModal title={form === "new" ? "New department" : `Edit ${form.name}`} fields={fields} initial={form === "new" ? { name: "", code: "" } : { name: form.name, code: form.code ?? "" }}
      onClose={() => setForm(null)} onSave={async (values) => { await api("department_save", { ...values, id: form === "new" ? undefined : form.id }); done(); }}
      onDelete={form !== "new" && can("academics.delete") ? async () => { await api("department_delete", { id: form.id }); done(); } : undefined} />}
  </div>;
}
