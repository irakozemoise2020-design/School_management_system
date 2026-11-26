import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { FormModal } from "../../components/ui/FormModal";
import { Alert, Badge, Empty, FormFields, PageHeader, Spinner, Tabs, setField, type FieldDef, type FormValues } from "../../components/ui/kit";
import { DAYS } from "../../lib/types";
import { useAsync, useSubmit } from "../../lib/useAsync";
import { useSchool } from "../schools/SchoolContext";

type Role = { id: string; key: string; name: string };
type People = { members: { assignmentId: string; userId: string; name: string; email: string; roleId: string; role: string; roleKey: string; isActive: boolean; isMe: boolean }[]; invitations: { id: string; email: string; role: string; status: string; createdAt: string }[]; roles: Role[] };
type SettingsData = { schoolName: string; code: string; country: string | null; timezone: string | null; currency: string; studentPrefix: string | null; admissionPrefix: string | null; language: string; workingDays: number[] };

export function SettingsPage() {
  const { can, school } = useSchool(); const [tab, setTab] = useState(can("users.view") ? "people" : "school");
  const tabs: [string, string][] = []; if (can("users.view")) tabs.push(["people", "Users & access"]); if (can("settings.view")) tabs.push(["school", "School settings"]);
  if (!tabs.length) return <div className="surface p-8"><h1 className="text-xl font-bold text-ink">Settings</h1><p className="mt-2 text-sm text-slate-500">Your role ({school?.role_name}) does not include settings access.</p></div>;
  const active = tabs.some(([key]) => key === tab) ? tab : tabs[0][0];
  return <div className="space-y-6">
    <PageHeader eyebrow="Administration" title="Settings" subtitle="Control who can use the system and how numbering, working days and language are set up." />
    <section className="surface overflow-hidden"><div className="px-2 pt-2"><Tabs tabs={tabs} value={active} onChange={setTab} /></div><div className="p-5">{active === "people" ? <PeopleTab /> : <SchoolTab />}</div></section>
  </div>;
}

function PeopleTab() {
  const { api, can } = useSchool(); const people = useAsync(() => api<People>("members_list"), [api]);
  const [invite, setInvite] = useState(false); const [notice, setNotice] = useState<string | null>(null); const [edit, setEdit] = useState<People["members"][number] | null>(null);
  const { busy, error, run } = useSubmit();
  if (people.loading && !people.data) return <Spinner />; if (people.error) return <Alert tone="error">{people.error}</Alert>;
  const data = people.data; if (!data) return null;
  const roleOptions = data.roles.map((role) => [role.id, role.name] as [string, string]);
  return <div className="space-y-8">
    {notice && <Alert tone="success">{notice}</Alert>}{error && <Alert tone="error">{error}</Alert>}
    <div><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold text-ink">People with access</h3>{can("users.create") && <Button type="button" size="sm" onClick={() => { setNotice(null); setInvite(true); }}><Plus size={14} /> Invite someone</Button>}</div>
      <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Name</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Status</th><th className="px-3 py-3" /></tr></thead>
        <tbody className="divide-y divide-line">{data.members.map((member) => <tr key={member.assignmentId}><td className="px-4 py-3"><span className="font-semibold text-ink">{member.name}{member.isMe && <span className="ml-2 text-xs font-normal text-slate-400">(you)</span>}</span><span className="block text-xs text-slate-500">{member.email}</span></td><td className="px-3 py-3 text-slate-600">{member.role}</td><td className="px-3 py-3"><Badge value={member.isActive ? "active" : "inactive"} /></td>
          <td className="px-3 py-3 text-right">{can("users.edit") && !member.isMe && member.roleKey !== "school_owner" && <Button type="button" size="sm" variant="ghost" onClick={() => setEdit(member)}>Change</Button>}</td></tr>)}</tbody></table></div></div>
    <div><h3 className="mb-3 text-sm font-bold text-ink">Waiting invitations</h3>
      {!data.invitations.length ? <p className="text-sm text-slate-500">No invitations are waiting. A person gets access automatically when they create an account with the invited email and confirm it.</p> :
        <ul className="divide-y divide-line rounded-xl border border-line">{data.invitations.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><span><span className="font-semibold text-ink">{item.email}</span> <span className="text-slate-500">· {item.role}</span></span>{can("users.delete") && <button type="button" disabled={busy} className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => void run(async () => { await api("invite_revoke", { id: item.id }); people.reload(); })}>Cancel invitation</button>}</li>)}</ul>}</div>
    {invite && <FormModal title="Invite someone" saveLabel="Send invitation" fields={[{ name: "email", label: "Email address", type: "email", required: true, span: 2 }, { name: "roleId", label: "Role", type: "select", options: roleOptions, required: true, span: 2 }]} initial={{ email: "", roleId: "" }}
      onClose={() => setInvite(false)} onSave={async (values) => { const response = await api<{ message: string }>("invite_create", { email: values.email, roleId: values.roleId }); setNotice(response.message); people.reload(); }} />}
    {edit && <FormModal title={`Change access — ${edit.name}`} fields={[{ name: "roleId", label: "Role", type: "select", options: roleOptions, required: true, span: 2 }, { name: "isActive", label: "Can sign in to this school", type: "checkbox", span: 2 }]} initial={{ roleId: edit.roleId, isActive: edit.isActive }}
      onClose={() => setEdit(null)} onSave={async (values) => { await api("member_update", { assignmentId: edit.assignmentId, roleId: values.roleId, isActive: Boolean(values.isActive) }); people.reload(); }} />}
    {!roleOptions.length && <Empty title="No roles found" />}
  </div>;
}

function SchoolTab() {
  const { api, can, refresh, refreshLookups } = useSchool(); const data = useAsync(() => api<SettingsData>("settings_get"), [api]);
  const [values, setValues] = useState<FormValues>({}); const [days, setDays] = useState<number[]>([]); const [saved, setSaved] = useState(false); const { busy, error, setError, run } = useSubmit();
  const canEdit = can("settings.edit"); const change = setField(setValues);
  useEffect(() => {
    if (!data.data) return;
    setValues({ schoolName: data.data.schoolName, studentPrefix: data.data.studentPrefix ?? "", admissionPrefix: data.data.admissionPrefix ?? "", language: data.data.language });
    setDays(data.data.workingDays);
  }, [data.data]);
  if (data.loading && !data.data) return <Spinner />; if (data.error) return <Alert tone="error">{data.error}</Alert>; if (!data.data) return null;
  const fields: FieldDef[] = [
    { name: "schoolName", label: "School name", required: true, span: 2, disabled: !canEdit }, { name: "studentPrefix", label: "Student number prefix", hint: "Example: STU gives STU-00001", disabled: !canEdit }, { name: "admissionPrefix", label: "Admission number prefix", hint: "Example: ADM", disabled: !canEdit },
    { name: "language", label: "Default language", type: "select", options: [["en", "English"], ["rw", "Kinyarwanda"], ["fr", "Français"]], disabled: !canEdit, hint: "Stored now; translations arrive in a later phase." },
  ];
  return <form className="max-w-2xl" onSubmit={(event) => { event.preventDefault(); setSaved(false); setError(null); void run(async () => { await api("settings_save", { ...values, workingDays: days }); setSaved(true); data.reload(); void refresh(); void refreshLookups(); }); }}>
    <p className="mb-4 text-sm text-slate-500">School code <strong className="text-ink">{data.data.code}</strong> · Currency <strong className="text-ink">{data.data.currency}</strong> · Time zone <strong className="text-ink">{data.data.timezone ?? "—"}</strong></p>
    <FormFields fields={fields} values={values} onChange={change} />
    <fieldset className="mt-6" disabled={!canEdit}><legend className="text-sm font-semibold text-slate-700">Working days</legend><div className="mt-2 flex flex-wrap gap-2">{[1, 2, 3, 4, 5, 6, 7].map((day) => <label key={day} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={days.includes(day)} onChange={(event) => setDays(event.target.checked ? [...days, day].sort() : days.filter((item) => item !== day))} />{DAYS[day]}</label>)}</div><p className="mt-1 text-xs text-slate-400">Attendance and the timetable use these days.</p></fieldset>
    {error && <Alert tone="error">{error}</Alert>}{saved && <Alert tone="success">Settings saved.</Alert>}
    {canEdit && <div className="mt-6"><Button disabled={busy}>{busy ? "Saving…" : "Save settings"}</Button></div>}
  </form>;
}
