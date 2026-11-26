import { Plus, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { FormModal } from "../../components/ui/FormModal";
import { Alert, Empty, PageHeader, Spinner, Tabs, type FieldDef } from "../../components/ui/kit";
import { DAYS, toOptions } from "../../lib/types";
import { useAsync } from "../../lib/useAsync";
import { useSchool } from "../schools/SchoolContext";

type Period = { id: string; name: string; sortOrder: number; startTime: string; endTime: string; isBreak: boolean };
type Classroom = { id: string; name: string; capacity: number | null };
type Setup = { periods: Period[]; classrooms: Classroom[]; workingDays: number[] };
type Entry = { id: string; classId: string; className: string; dayOfWeek: number; periodId: string; subjectId: string; subject: string; employeeId: string | null; teacher: string | null; classroomId: string | null; classroom: string | null };

export function TimetablePage() {
  const { can } = useSchool(); const [tab, setTab] = useState("class");
  const tabs: [string, string][] = [["class", "By class"], ["teacher", "By teacher"], ["setup", "Periods & rooms"]];
  return <div className="space-y-6">
    <PageHeader eyebrow="Weekly schedule" title="Timetable" subtitle="Build each class's week. The system refuses lessons that clash for a teacher, a classroom or a class." actions={tab !== "setup" && <Button type="button" variant="secondary" onClick={() => window.print()}><Printer size={16} /> Print</Button>} />
    <section className="surface overflow-hidden"><div className="px-2 pt-2"><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
      <div className="p-5">{tab === "setup" ? <SetupTab canEdit={can("timetable.edit", "timetable.create")} /> : <GridTab mode={tab === "teacher" ? "teacher" : "class"} />}</div></section>
  </div>;
}

function GridTab({ mode }: { mode: "class" | "teacher" }) {
  const { api, can, lookups } = useSchool();
  const options: { id: string; name: string }[] = mode === "class" ? lookups?.classes ?? [] : lookups?.teachers ?? [];
  const [subject, setSubject] = useState("");
  useEffect(() => { setSubject(""); }, [mode]);
  const selected = subject && options.some((item) => item.id === subject) ? subject : options[0]?.id ?? "";
  const setup = useAsync(() => api<Setup>("timetable_setup"), [api]);
  const grid = useAsync(() => (selected ? api<{ entries: Entry[] }>("timetable_get", mode === "class" ? { classId: selected } : { employeeId: selected }) : Promise.resolve(null)), [api, selected, mode]);
  const classSubjects = useAsync(() => (mode === "class" && selected ? api<{ subjectIds: string[] }>("class_subjects_get", { classId: selected }) : Promise.resolve(null)), [api, selected, mode]);
  const [editor, setEditor] = useState<{ day: number; period: Period; entry: Entry | null } | null>(null);
  const canEdit = mode === "class" && can("timetable.create", "timetable.edit");
  if (!options.length) return <Empty title={mode === "class" ? "No classes yet" : "No teachers yet"} text={mode === "class" ? "Create classes in Academics first." : "Add staff with the type Teacher first."} />;
  if (setup.loading && !setup.data) return <Spinner />;
  if (setup.error) return <Alert tone="error">{setup.error}</Alert>;
  const days = (setup.data?.workingDays ?? [1, 2, 3, 4, 5]); const periods = setup.data?.periods ?? [];
  const entries = grid.data?.entries ?? []; const find = (day: number, periodId: string) => entries.filter((entry) => entry.dayOfWeek === day && entry.periodId === periodId);
  const subjectOptions = toOptions((lookups?.subjects ?? []).filter((item) => (classSubjects.data?.subjectIds ?? []).includes(item.id)), (item) => item.name);
  const fields: FieldDef[] = [{ name: "subjectId", label: "Subject", type: "select", required: true, options: subjectOptions, hint: subjectOptions.length ? undefined : "No subjects yet: add them to this class in Academics." }, { name: "employeeId", label: "Teacher", type: "select", options: toOptions(lookups?.teachers ?? [], (item) => item.name), blank: "No teacher" }, { name: "classroomId", label: "Classroom", type: "select", options: toOptions(lookups?.classrooms ?? [], (item) => item.name), blank: "No classroom" }];
  return <div>
    <label className="text-sm font-semibold text-slate-700 print:hidden">{mode === "class" ? "Class" : "Teacher"}<select className="field mt-1 min-w-56" value={selected} onChange={(event) => setSubject(event.target.value)}>{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <p className="mb-2 mt-4 hidden text-lg font-bold text-ink print:block">{options.find((item) => item.id === selected)?.name} — weekly timetable</p>
    {!periods.length ? <Empty title="No periods set up" text="Add the daily periods in the “Periods & rooms” tab first." /> : grid.error ? <Alert tone="error">{grid.error}</Alert> : <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[720px] border-separate border-spacing-1 text-left text-xs"><thead><tr><th className="w-28 px-2 py-2 text-slate-500">Period</th>{days.map((day) => <th key={day} className="px-2 py-2 text-slate-500">{DAYS[day]}</th>)}</tr></thead>
        <tbody>{periods.map((period) => <tr key={period.id}><th className="rounded-lg bg-slate-50 px-2 py-2 align-top font-semibold text-slate-700">{period.name}<span className="block font-normal text-slate-400">{period.startTime}–{period.endTime}</span></th>
          {period.isBreak ? <td colSpan={days.length} className="rounded-lg bg-amber-50 px-2 py-2 text-center font-semibold text-amber-700">Break</td> : days.map((day) => { const cell = find(day, period.id); return <td key={day} className="h-16 rounded-lg border border-line align-top">
            {cell.length ? cell.map((entry) => <button key={entry.id} type="button" disabled={!canEdit} onClick={() => setEditor({ day, period, entry })} className="block w-full rounded-lg bg-sky/10 p-2 text-left enabled:hover:bg-sky/20"><span className="block font-semibold text-ink">{entry.subject}</span><span className="block text-slate-500">{mode === "class" ? entry.teacher ?? "—" : entry.className}{entry.classroom ? ` · ${entry.classroom}` : ""}</span></button>)
              : canEdit ? <button type="button" aria-label={`Add lesson ${DAYS[day]} ${period.name}`} onClick={() => setEditor({ day, period, entry: null })} className="flex h-full min-h-16 w-full items-center justify-center rounded-lg text-slate-300 hover:bg-slate-50 hover:text-sky print:hidden"><Plus size={16} /></button> : null}</td>; })}</tr>)}</tbody></table></div>}
    {editor && <FormModal title={`${editor.entry ? "Edit" : "Add"} lesson — ${DAYS[editor.day]}, ${editor.period.name}`} fields={fields} initial={{ subjectId: editor.entry?.subjectId ?? "", employeeId: editor.entry?.employeeId ?? "", classroomId: editor.entry?.classroomId ?? "" }}
      onClose={() => setEditor(null)} onSave={async (values) => { await api("timetable_entry_save", { id: editor.entry?.id, classId: selected, dayOfWeek: editor.day, periodId: editor.period.id, subjectId: values.subjectId, employeeId: values.employeeId || undefined, classroomId: values.classroomId || undefined }); grid.reload(); }}
      onDelete={editor.entry && can("timetable.delete") ? async () => { await api("timetable_entry_delete", { id: editor.entry!.id }); grid.reload(); } : undefined} deleteText="Remove this lesson from the timetable?" />}
  </div>;
}

function SetupTab({ canEdit }: { canEdit: boolean }) {
  const { api, can, refreshLookups } = useSchool();
  const setup = useAsync(() => api<Setup>("timetable_setup"), [api]);
  const [period, setPeriod] = useState<Period | "new" | null>(null); const [room, setRoom] = useState<Classroom | "new" | null>(null);
  const periodFields: FieldDef[] = [{ name: "name", label: "Name", required: true, placeholder: "Period 1", span: 2 }, { name: "sortOrder", label: "Order", type: "number", required: true, hint: "1 = first of the day" }, { name: "isBreak", label: "This is a break (no lessons)", type: "checkbox" }, { name: "startTime", label: "Starts", type: "time", required: true }, { name: "endTime", label: "Ends", type: "time", required: true }];
  const roomFields: FieldDef[] = [{ name: "name", label: "Classroom name", required: true, placeholder: "Room 3" }, { name: "capacity", label: "Capacity", type: "number" }];
  if (setup.loading && !setup.data) return <Spinner />;
  if (setup.error) return <Alert tone="error">{setup.error}</Alert>;
  const periods = setup.data?.periods ?? []; const rooms = setup.data?.classrooms ?? [];
  const done = () => { setup.reload(); void refreshLookups(); };
  return <div className="grid gap-8 lg:grid-cols-2">
    <div><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold text-ink">Daily periods</h3>{can("timetable.create") && <Button type="button" size="sm" onClick={() => setPeriod("new")}><Plus size={14} /> Add</Button>}</div>
      {!periods.length ? <p className="text-sm text-slate-500">No periods yet.</p> : <ul className="divide-y divide-line rounded-xl border border-line">{periods.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><span><span className="font-semibold text-ink">{item.name}</span> <span className="text-slate-500">{item.startTime}–{item.endTime}{item.isBreak ? " · break" : ""}</span></span>{canEdit && <Button type="button" size="sm" variant="ghost" onClick={() => setPeriod(item)}>Edit</Button>}</li>)}</ul>}
      <p className="mt-2 text-xs text-slate-400">Working days are chosen in Settings.</p></div>
    <div><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold text-ink">Classrooms</h3>{can("timetable.create") && <Button type="button" size="sm" onClick={() => setRoom("new")}><Plus size={14} /> Add</Button>}</div>
      {!rooms.length ? <p className="text-sm text-slate-500">No classrooms yet (optional).</p> : <ul className="divide-y divide-line rounded-xl border border-line">{rooms.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><span><span className="font-semibold text-ink">{item.name}</span>{item.capacity ? <span className="text-slate-500"> · {item.capacity} seats</span> : null}</span>{canEdit && <Button type="button" size="sm" variant="ghost" onClick={() => setRoom(item)}>Edit</Button>}</li>)}</ul>}</div>
    {period && <FormModal title={period === "new" ? "New period" : `Edit ${period.name}`} fields={periodFields} initial={period === "new" ? { name: "", sortOrder: String(periods.length + 1), isBreak: false, startTime: "", endTime: "" } : { name: period.name, sortOrder: String(period.sortOrder), isBreak: period.isBreak, startTime: period.startTime, endTime: period.endTime }}
      onClose={() => setPeriod(null)} onSave={async (values) => { await api("period_save", { ...values, sortOrder: Number(values.sortOrder), id: period === "new" ? undefined : period.id }); done(); }}
      onDelete={period !== "new" && can("timetable.delete") ? async () => { await api("period_delete", { id: period.id }); done(); } : undefined} />}
    {room && <FormModal title={room === "new" ? "New classroom" : `Edit ${room.name}`} fields={roomFields} initial={room === "new" ? { name: "", capacity: "" } : { name: room.name, capacity: room.capacity ? String(room.capacity) : "" }}
      onClose={() => setRoom(null)} onSave={async (values) => { await api("classroom_save", { ...values, capacity: values.capacity === "" ? null : Number(values.capacity), id: room === "new" ? undefined : room.id }); done(); }}
      onDelete={room !== "new" && can("timetable.delete") ? async () => { await api("classroom_delete", { id: room.id }); done(); } : undefined} />}
  </div>;
}
