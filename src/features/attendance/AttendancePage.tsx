import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Alert, Badge, Empty, PageHeader, Spinner, Tabs } from "../../components/ui/kit";
import { cn } from "../../lib/utils";
import { fmtDate, todayIso } from "../../lib/types";
import { useAsync, useSubmit } from "../../lib/useAsync";
import { useSchool } from "../schools/SchoolContext";

type Status = "present" | "absent" | "late" | "excused";
type Sheet = { class: { id: string; name: string }; date: string; today: string; isSchoolDay: boolean; canMark: boolean; students: { studentId: string; studentNumber: string; name: string; status: Status | null; note: string | null }[] };
type Summary = { date: string; classes: { classId: string; name: string; enrolled: number; present: number; absent: number; late: number; excused: number }[]; absentees: { studentId: string; name: string; className: string | null; status: string; note: string | null }[]; trend: { date: string; rate: number | null }[] };
const STATUSES: [Status, string, string][] = [["present", "Present", "bg-emerald-600 text-white"], ["absent", "Absent", "bg-rose-600 text-white"], ["late", "Late", "bg-amber-500 text-white"], ["excused", "Excused", "bg-violet-600 text-white"]];

export function AttendancePage() {
  const { can } = useSchool(); const [tab, setTab] = useState("sheet");
  const tabs: [string, string][] = [["sheet", "Take attendance"]]; if (can("attendance.view")) tabs.push(["summary", "Daily summary"]);
  return <div className="space-y-6">
    <PageHeader eyebrow="Daily register" title="Attendance" subtitle="Mark each student present, absent, late or excused. Teachers can mark only the classes they teach." />
    <section className="surface overflow-hidden"><div className="px-2 pt-2"><Tabs tabs={tabs} value={tab} onChange={setTab} /></div><div className="p-5">{tab === "sheet" ? <SheetTab /> : <SummaryTab />}</div></section>
  </div>;
}

function SheetTab() {
  const { api, lookups } = useSchool(); const classes = lookups?.classes ?? [];
  const [classId, setClassId] = useState(""); const [date, setDate] = useState(todayIso());
  const [marks, setMarks] = useState<Record<string, { status: Status | null; note: string }>>({}); const [saved, setSaved] = useState<string | null>(null);
  const { busy, error, setError, run } = useSubmit();
  useEffect(() => { if (!classId && classes.length) setClassId(classes[0].id); }, [classes, classId]);
  useEffect(() => { setSaved(null); }, [classId, date]);
  const sheet = useAsync(() => (classId ? api<Sheet>("attendance_sheet", { classId, date }) : Promise.resolve(null)), [api, classId, date]);
  useEffect(() => {
    const next: Record<string, { status: Status | null; note: string }> = {};
    (sheet.data?.students ?? []).forEach((student) => { next[student.studentId] = { status: student.status, note: student.note ?? "" }; });
    setMarks(next); setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.data]);
  const data = sheet.data; const students = data?.students ?? []; const editable = Boolean(data?.canMark && data.isSchoolDay);
  const counts = { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 };
  students.forEach((student) => { const status = marks[student.studentId]?.status; if (status) counts[status] += 1; else counts.unmarked += 1; });
  function setStatus(id: string, status: Status) { setMarks((current) => ({ ...current, [id]: { status, note: current[id]?.note ?? "" } })); setSaved(null); }
  function markAll() { setMarks((current) => { const next = { ...current }; students.forEach((student) => { next[student.studentId] = { status: next[student.studentId]?.status ?? "present", note: next[student.studentId]?.note ?? "" }; }); return next; }); setSaved(null); }
  async function save() {
    if (counts.unmarked > 0) { setError(`${counts.unmarked} student(s) are not marked yet. Mark everyone, or use "Mark unmarked as present".`); return; }
    await run(async () => {
      const response = await api<{ saved: number }>("attendance_save", { classId, date, entries: students.map((student) => ({ studentId: student.studentId, status: marks[student.studentId].status, note: marks[student.studentId].note.trim() || undefined })) });
      setSaved(`Attendance saved for ${response.saved} students.`); sheet.reload();
    });
  }
  if (!classes.length) return <Empty title="No classes yet" text="Create the classes of the current academic year in Academics first." />;
  return <div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm font-semibold text-slate-700">Class<select className="field mt-1 min-w-48" value={classId} onChange={(event) => setClassId(event.target.value)}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-sm font-semibold text-slate-700">Date<input className="field mt-1" type="date" max={data?.today ?? todayIso()} value={date} onChange={(event) => event.target.value && setDate(event.target.value)} /></label>
    </div>
    {sheet.loading && !sheet.data ? <Spinner /> : sheet.error ? <Alert tone="error">{sheet.error}</Alert> : !data ? null : <>
      {!data.isSchoolDay && <Alert>{fmtDate(data.date)} is not a school day, so attendance cannot be taken.</Alert>}
      {data.isSchoolDay && !data.canMark && <Alert>You can view this register but not change it{data.date !== data.today ? " (changing past dates needs extra permission)" : ""}.</Alert>}
      {!students.length ? <Empty title="No active students in this class" text="Students appear here once they are enrolled in the class." /> : <>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold"><span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">Present {counts.present}</span><span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">Absent {counts.absent}</span><span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">Late {counts.late}</span><span className="rounded-full bg-violet-50 px-3 py-1 text-violet-700">Excused {counts.excused}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">Unmarked {counts.unmarked}</span>
          {editable && <Button type="button" variant="secondary" size="sm" className="ml-auto" onClick={markAll}>Mark unmarked as present</Button>}</div>
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line">{students.map((student) => { const mark = marks[student.studentId]; return <li key={student.studentId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{student.name}</p><p className="text-xs text-slate-400">{student.studentNumber}</p></div>
          {editable ? <div className="flex flex-wrap items-center gap-2"><div className="flex overflow-hidden rounded-xl border border-slate-200" role="group" aria-label={`Attendance for ${student.name}`}>{STATUSES.map(([key, label, active]) => <button key={key} type="button" aria-pressed={mark?.status === key} onClick={() => setStatus(student.studentId, key)} className={cn("px-3 py-1.5 text-xs font-semibold transition", mark?.status === key ? active : "bg-white text-slate-600 hover:bg-slate-50")}>{label}</button>)}</div>
            {mark?.status && mark.status !== "present" && <input className="field w-44 py-1.5 text-xs" placeholder="Note (optional)" aria-label={`Note for ${student.name}`} maxLength={200} value={mark.note} onChange={(event) => { const value = event.target.value; setMarks((current) => ({ ...current, [student.studentId]: { status: current[student.studentId]?.status ?? null, note: value } })); }} />}</div>
            : <div>{mark?.status ? <Badge value={mark.status} /> : <span className="text-xs text-slate-400">Not marked</span>}{mark?.note && <span className="ml-2 text-xs text-slate-500">{mark.note}</span>}</div>}
        </li>; })}</ul>
        {error && <Alert tone="error">{error}</Alert>}{saved && <Alert tone="success">{saved}</Alert>}
        {editable && <div className="mt-5 flex justify-end"><Button type="button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save attendance"}</Button></div>}
      </>}
    </>}
  </div>;
}

function SummaryTab() {
  const { api } = useSchool(); const [date, setDate] = useState(todayIso());
  const summary = useAsync(() => api<Summary>("attendance_summary", { date }), [api, date]);
  const data = summary.data;
  return <div>
    <label className="text-sm font-semibold text-slate-700">Date<input className="field mt-1 block" type="date" max={todayIso()} value={date} onChange={(event) => event.target.value && setDate(event.target.value)} /></label>
    {summary.loading && !data ? <Spinner /> : summary.error ? <Alert tone="error">{summary.error}</Alert> : !data ? null : <>
      <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Class</th><th className="px-3 py-3">Enrolled</th><th className="px-3 py-3">Present</th><th className="px-3 py-3">Absent</th><th className="px-3 py-3">Late</th><th className="px-3 py-3">Excused</th></tr></thead>
        <tbody className="divide-y divide-line">{data.classes.map((row) => <tr key={row.classId}><td className="px-4 py-3 font-semibold text-ink">{row.name}</td><td className="px-3 py-3">{row.enrolled}</td><td className="px-3 py-3 text-emerald-700">{row.present}</td><td className="px-3 py-3 text-rose-700">{row.absent}</td><td className="px-3 py-3 text-amber-700">{row.late}</td><td className="px-3 py-3 text-violet-700">{row.excused}</td></tr>)}</tbody></table>{!data.classes.length && <Empty title="No classes" />}</div>
      <h3 className="mt-8 text-sm font-bold text-ink">Absent or late on {fmtDate(data.date)}</h3>
      {!data.absentees.length ? <p className="mt-2 text-sm text-slate-500">Nobody is recorded absent or late.</p> : <ul className="mt-3 divide-y divide-line rounded-xl border border-line">{data.absentees.map((row) => <li key={row.studentId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><span><span className="font-semibold text-ink">{row.name}</span> <span className="text-slate-500">· {row.className ?? "—"}{row.note ? ` · ${row.note}` : ""}</span></span><Badge value={row.status} /></li>)}</ul>}
      <h3 className="mt-8 text-sm font-bold text-ink">Attendance rate, last 14 days</h3>
      <div className="mt-3 flex h-32 items-end gap-1.5" role="img" aria-label="Attendance rate for the last 14 days">{data.trend.map((point) => <div key={point.date} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${fmtDate(point.date)}: ${point.rate === null ? "no data" : `${point.rate}%`}`}><div className={cn("w-full rounded-t", point.rate === null ? "bg-slate-100" : "bg-sky")} style={{ height: `${point.rate === null ? 4 : Math.max(4, point.rate)}%` }} /><span className="text-[10px] text-slate-400">{point.date.slice(8)}</span></div>)}</div>
    </>}
  </div>;
}
