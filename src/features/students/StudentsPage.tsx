import { Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Badge, Empty, FormFields, Modal, PageHeader, Pager, Spinner, setField, type FieldDef, type FormValues } from "../../components/ui/kit";
import { Button } from "../../components/ui/Button";
import { GENDERS, toOptions } from "../../lib/types";
import { useAsync, useSubmit } from "../../lib/useAsync";
import { useSchool } from "../schools/SchoolContext";

export type StudentRow = { id: string; studentNumber: string; admissionNumber: string | null; name: string; gender: string | null; status: string; classId: string | null; className: string | null };
type StudentList = { rows: StudentRow[]; total: number; page: number; pageSize: number };
const PAGE_SIZE = 25;

export function StudentsPage() {
  const { api, can, lookups } = useSchool();
  const [search, setSearch] = useState(""); const [query, setQuery] = useState("");
  const [classId, setClassId] = useState(""); const [status, setStatus] = useState("active"); const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  const list = useAsync(() => api<StudentList>("students_list", { search: query, classId, status, page, pageSize: PAGE_SIZE }), [query, classId, status, page, api]);
  return <div className="space-y-6">
    <PageHeader eyebrow="Student information system" title="Students" subtitle="Every learner's permanent record: family, class history and attendance." actions={can("students.create") && <Button type="button" onClick={() => setAdding(true)}><Plus size={16} /> Add student</Button>} />
    <section className="surface overflow-hidden">
      <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-[1fr_200px_160px]">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><Search size={16} className="text-slate-400" /><input className="w-full bg-transparent text-sm outline-none" placeholder="Search by name, student or admission number" aria-label="Search students" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <select className="field mt-0" aria-label="Filter by class" value={classId} onChange={(event) => { setClassId(event.target.value); setPage(1); }}><option value="">All classes</option>{(lookups?.classes ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select className="field mt-0" aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="active">Active</option><option value="">All statuses</option><option value="transferred">Transferred</option><option value="withdrawn">Withdrawn</option><option value="graduated">Graduated</option><option value="inactive">Inactive</option></select>
      </div>
      {list.loading && !list.data ? <Spinner /> : list.error ? <div className="p-5"><Alert tone="error">{list.error}</Alert></div> : !list.data?.rows.length ? <Empty title="No students found" text={query || classId ? "Try a different search or filter." : "Add your first student, or enrol one from an approved admission."} /> :
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Student</th><th className="px-3 py-3">Number</th><th className="px-3 py-3">Class</th><th className="px-3 py-3">Gender</th><th className="px-3 py-3">Status</th></tr></thead>
          <tbody className="divide-y divide-line">{list.data.rows.map((row) => <tr key={row.id} className="hover:bg-slate-50"><td className="px-5 py-3"><Link className="font-semibold text-ink hover:text-sky" to={`/students/${row.id}`}>{row.name}</Link></td><td className="px-3 py-3 text-slate-600">{row.studentNumber}</td><td className="px-3 py-3 text-slate-600">{row.className ?? "—"}</td><td className="px-3 py-3 capitalize text-slate-600">{row.gender ?? "—"}</td><td className="px-3 py-3"><Badge value={row.status} /></td></tr>)}</tbody></table></div>}
      {list.data && <Pager page={page} pageSize={PAGE_SIZE} total={list.data.total} onChange={setPage} />}
    </section>
    {adding && <StudentForm onClose={() => setAdding(false)} />}
  </div>;
}

export const studentFields = (classOptions: [string, string][]): FieldDef[] => [
  { name: "firstName", label: "First name", required: true }, { name: "lastName", label: "Last name", required: true },
  { name: "middleName", label: "Middle name" }, { name: "gender", label: "Gender", type: "select", options: GENDERS },
  { name: "dateOfBirth", label: "Date of birth", type: "date" }, { name: "nationality", label: "Nationality", placeholder: "Rwandan" },
  { name: "phone", label: "Phone", type: "tel" }, { name: "email", label: "Email", type: "email" },
  { name: "address", label: "Address", span: 2 }, { name: "admissionNumber", label: "Admission number", hint: "Optional. Leave empty if not issued yet." },
  ...(classOptions.length ? [{ name: "classId", label: "Class", type: "select" as const, options: classOptions }] : []),
];

function StudentForm({ onClose }: { onClose: () => void }) {
  const { api, lookups } = useSchool(); const navigate = useNavigate(); const { busy, error, setError, run } = useSubmit();
  const [values, setValues] = useState<FormValues>({ relationship: "Mother" }); const [duplicate, setDuplicate] = useState(false);
  const change = setField(setValues);
  const classOptions = toOptions(lookups?.classes ?? [], (item) => item.name);
  const fields = [...studentFields(classOptions)];
  const guardianFields: FieldDef[] = [
    { name: "gFirst", label: "Guardian first name" }, { name: "gLast", label: "Guardian last name" },
    { name: "relationship", label: "Relationship", type: "select", options: [["Mother", "Mother"], ["Father", "Father"], ["Guardian", "Guardian"], ["Other", "Other"]] }, { name: "gPhone", label: "Guardian phone", type: "tel" },
  ];
  async function submit(allowDuplicate: boolean) {
    await run(async () => {
      const hasFirst = Boolean(String(values.gFirst ?? "").trim()), hasLast = Boolean(String(values.gLast ?? "").trim());
      if (hasFirst !== hasLast) throw new Error("A guardian needs both a first and a last name.");
      const { gFirst, gLast, gPhone, relationship, ...student } = values;
      const guardians = hasFirst ? [{ firstName: gFirst, lastName: gLast, phone: gPhone, relationship, isPrimary: true, isEmergency: true }] : [];
      try {
        const result = await api<{ id: string }>("student_save", { ...student, guardians, allowDuplicate });
        navigate(`/students/${result.id}`);
      } catch (caught) {
        setDuplicate(caught instanceof Error && /same name and date of birth/.test(caught.message));
        throw caught;
      }
    });
  }
  return <Modal title="Add student" onClose={onClose} wide>
    <form onSubmit={(event) => { event.preventDefault(); setError(null); void submit(false); }}>
      <FormFields fields={fields} values={values} onChange={change} />
      <p className="mb-3 mt-6 text-sm font-bold text-ink">Parent or guardian (optional)</p>
      <FormFields fields={guardianFields} values={values} onChange={change} />
      {error && <Alert tone="error">{error}</Alert>}
      <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>{duplicate && <Button type="button" variant="secondary" disabled={busy} onClick={() => void submit(true)}>Add anyway</Button>}<Button disabled={busy}>{busy ? "Saving…" : "Save student"}</Button></div>
    </form>
  </Modal>;
}
