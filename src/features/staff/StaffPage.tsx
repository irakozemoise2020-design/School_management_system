import { Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { FormModal } from "../../components/ui/FormModal";
import { Alert, Badge, Empty, PageHeader, Spinner, type FieldDef } from "../../components/ui/kit";
import { toOptions } from "../../lib/types";
import { useAsync } from "../../lib/useAsync";
import { useSchool } from "../schools/SchoolContext";

type Member = { id: string; employeeNumber: string; firstName: string; lastName: string; name: string; employmentType: string; departmentId: string | null; department: string | null; phone: string | null; email: string | null; isActive: boolean; userId: string | null };
type Members = { members: { userId: string; name: string; email: string; isActive: boolean }[] };
const TYPES: [string, string][] = [["teacher", "Teacher"], ["staff", "Support staff"], ["administrator", "Administrator"]];

export function StaffPage() {
  const { api, can, lookups, refreshLookups } = useSchool();
  const [search, setSearch] = useState(""); const [query, setQuery] = useState(""); const [form, setForm] = useState<Member | "new" | null>(null);
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  const list = useAsync(() => api<{ staff: Member[] }>("staff_list", { search: query }), [api, query]);
  const users = useAsync(() => (can("users.view") ? api<Members>("members_list") : Promise.resolve(null)), [api, can]);
  const fields: FieldDef[] = [
    { name: "firstName", label: "First name", required: true }, { name: "lastName", label: "Last name", required: true }, { name: "employmentType", label: "Type", type: "select", options: TYPES, required: true },
    { name: "departmentId", label: "Department", type: "select", options: toOptions(lookups?.departments ?? [], (item) => item.name), blank: "No department" }, { name: "phone", label: "Phone", type: "tel" }, { name: "email", label: "Email", type: "email" },
    ...(users.data ? [{ name: "userId", label: "Linked login account", type: "select" as const, span: 2 as const, blank: "Not linked", hint: "Link a teacher to their login so they can take attendance for their own classes.", options: users.data.members.filter((item) => item.isActive).map((item) => [item.userId, `${item.name} (${item.email})`] as [string, string]) }] : []),
    { name: "isActive", label: "Currently employed", type: "checkbox", span: 2 },
  ];
  const rows = list.data?.staff ?? [];
  return <div className="space-y-6">
    <PageHeader eyebrow="People" title="Teachers & Staff" subtitle="The staff directory. Teachers added here can be assigned to classes and lessons." actions={can("staff.create") && <Button type="button" onClick={() => setForm("new")}><Plus size={16} /> Add staff member</Button>} />
    <section className="surface overflow-hidden">
      <div className="border-b border-line p-4"><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 sm:max-w-md"><Search size={16} className="text-slate-400" /><input className="w-full bg-transparent text-sm outline-none" placeholder="Search by name or number" aria-label="Search staff" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
      {list.loading && !list.data ? <Spinner /> : list.error ? <div className="p-5"><Alert tone="error">{list.error}</Alert></div> : !rows.length ? <Empty title="No staff found" text="Add your teachers and staff to get started." /> :
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Name</th><th className="px-3 py-3">Number</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Department</th><th className="px-3 py-3">Contact</th><th className="px-3 py-3">Status</th><th className="px-3 py-3" /></tr></thead>
          <tbody className="divide-y divide-line">{rows.map((row) => <tr key={row.id}><td className="px-5 py-3 font-semibold text-ink">{row.name}</td><td className="px-3 py-3 text-slate-600">{row.employeeNumber}</td><td className="px-3 py-3 text-slate-600">{TYPES.find(([key]) => key === row.employmentType)?.[1] ?? row.employmentType}</td><td className="px-3 py-3 text-slate-600">{row.department ?? "—"}</td><td className="px-3 py-3 text-slate-600">{row.phone ?? row.email ?? "—"}</td><td className="px-3 py-3"><Badge value={row.isActive ? "active" : "inactive"} /></td><td className="px-3 py-3 text-right">{can("staff.edit") && <Button type="button" size="sm" variant="ghost" onClick={() => setForm(row)}>Edit</Button>}</td></tr>)}</tbody></table></div>}
    </section>
    {form && <FormModal title={form === "new" ? "Add staff member" : `Edit ${form.name}`} fields={fields} wide initial={form === "new" ? { firstName: "", lastName: "", employmentType: "teacher", departmentId: "", phone: "", email: "", userId: "", isActive: true } : { firstName: form.firstName, lastName: form.lastName, employmentType: form.employmentType, departmentId: form.departmentId ?? "", phone: form.phone ?? "", email: form.email ?? "", userId: form.userId ?? "", isActive: form.isActive }}
      onClose={() => setForm(null)} onSave={async (values) => { await api("staff_save", { ...values, departmentId: values.departmentId || undefined, userId: values.userId || undefined, phone: values.phone || undefined, email: values.email || undefined, id: form === "new" ? undefined : form.id }); list.reload(); void refreshLookups(); }} />}
  </div>;
}
