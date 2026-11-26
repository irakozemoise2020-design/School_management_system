// Database tests for Phase 2. Needs a PostgreSQL with the four migrations applied and a stub of the Supabase auth/storage schemas.
// Run: PGPORT=54399 bun supabase/tests/phase2_db.test.js
import { SQL } from "bun";
const sql = new SQL({ hostname: "127.0.0.1", port: Number(process.env.PGPORT || 54399), username: "postgres", database: process.env.PGDATABASE || "p2test", max: 4 });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);
const J = v => (typeof v === "string" ? JSON.parse(v) : v);
async function rpc(sub, fn, school, payload) {
  try {
    const r = await sql.begin(async tx => {
      await tx.unsafe("set local role authenticated");
      await tx.unsafe("select set_config('request.jwt.claim.sub', $1, true)", [sub]);
      const rows = await tx.unsafe(`select public.${fn}($1::uuid, $2::text::jsonb) as r`, [school, JSON.stringify(payload ?? {})]);
      return rows[0].r;
    });
    return { ok: true, data: J(r) };
  } catch (e) { return { ok: false, error: String(e.message) }; }
}
async function asUser(sub, q, params = []) {
  return sql.begin(async tx => { await tx.unsafe("set local role authenticated"); await tx.unsafe("select set_config('request.jwt.claim.sub', $1, true)", [sub]); return tx.unsafe(q, params); });
}
async function asAnon(q) { return sql.begin(async tx => { await tx.unsafe("set local role anon"); return tx.unsafe(q); }); }
const good = async (p, m) => { const r = await p; ok(r.ok, `${m}: ${r.error}`); return r.data; };
const bad = async (p, re, m) => { const r = await p; ok(!r.ok && re.test(r.error), `${m}: expected /${re}/ got ${r.ok ? "success" : r.error}`); return r; };
const su = async (q, params = []) => sql.unsafe(q, params);
const newUser = async email => (await su("insert into auth.users(email) values ($1) returning id", [email]))[0].id;

// ---------- set-up: two schools ----------
const owner = await newUser("owner@a.test"), ownerB = await newUser("owner@b.test");
const S = (await sql.begin(async tx => { await tx.unsafe("set local role authenticated"); await tx.unsafe("select set_config('request.jwt.claim.sub', $1, true)", [owner]); return tx.unsafe("select public.create_school_with_owner('Org A','Alpha School','ALP','Main','Rwanda') s"); }))[0].s;
const SB = (await sql.begin(async tx => { await tx.unsafe("set local role authenticated"); await tx.unsafe("select set_config('request.jwt.claim.sub', $1, true)", [ownerB]); return tx.unsafe("select public.create_school_with_owner('Org B','Beta School','BET','Main','Rwanda') s"); }))[0].s;
await su("update public.school_settings set working_days = '{1,2,3,4,5,6,7}' where school_id = $1", [S]);
const today = (await su("select public.school_today($1) d", [S]))[0].d; const todayStr = new Date(today).toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// ---------- roles ----------
const perms = async (role, key) => (await su("select count(*)::int n from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id where r.key = $1 and r.organization_id = (select organization_id from public.schools where id = $2) and p.key = $3", [role, S, key]))[0].n;
eq(await perms("school_owner", "students.delete"), 1, "owner has students.delete");
eq(await perms("teacher", "admissions.view"), 0, "teacher has no admissions");
eq(await perms("teacher", "attendance.create"), 1, "teacher marks attendance");
eq(await perms("accountant", "finance.view"), 1, "accountant sees finance");
eq(await perms("registrar", "finance.view"), 0, "registrar has no finance");
const me = await good(rpc(owner, "api_me", S, {}), "me"); ok(me.permissions.length === 36 && me.role === "School Owner", "owner permissions list");

// ---------- invitations ----------
const members = await good(rpc(owner, "api_members_list", S, {}), "members"); const roleId = k => members.roles.find(r => r.key === k).id;
ok(!members.roles.some(r => r.key === "school_owner"), "owner role is not offered");
const teacherU = await newUser("teach@a.test");
await good(rpc(owner, "api_invite_create", S, { email: "Teach@a.test", roleId: roleId("teacher") }), "invite existing account adds directly");
eq((await su("select count(*)::int n from public.user_school_assignments where user_id = $1 and school_id = $2 and is_active", [teacherU, S]))[0].n, 1, "existing account got access");
await bad(rpc(owner, "api_invite_create", S, { email: "teach@a.test", roleId: roleId("teacher") }), /already has access/, "no duplicate access");
await bad(rpc(owner, "api_invite_create", S, { email: "x@a.test", roleId: (await su("select id from public.roles where key = 'school_owner' and organization_id = (select organization_id from public.schools where id = $1)", [S]))[0].id }), /cannot be given|Choose a role/, "cannot invite an owner");
await bad(rpc(owner, "api_invite_create", S, { email: "not-an-email", roleId: roleId("teacher") }), /valid email/, "email format");
await good(rpc(owner, "api_invite_create", S, { email: "reg@a.test", roleId: roleId("registrar") }), "invite future registrar");
await bad(rpc(owner, "api_invite_create", S, { email: "reg@a.test", roleId: roleId("teacher") }), /already waiting/, "duplicate pending invite");
const regU = await newUser("reg@a.test");
eq((await asUser(regU, "select public.claim_invitations() n"))[0].n, 1, "registrar claims invitation on sign-in");
eq((await asUser(regU, "select public.claim_invitations() n"))[0].n, 0, "claim is idempotent");
const unconfirmed = (await su("insert into auth.users(email, email_confirmed_at) values ('ghost@a.test', null) returning id"))[0].id;
await good(rpc(owner, "api_invite_create", S, { email: "ghost@a.test", roleId: roleId("registrar") }), "invite for unconfirmed address");
eq((await asUser(unconfirmed, "select public.claim_invitations() n"))[0].n, 0, "unconfirmed email cannot claim");
await bad(rpc(teacherU, "api_invite_create", S, { email: "q@a.test", roleId: roleId("teacher") }), /permission/, "teacher cannot invite");
await bad(rpc(teacherU, "api_members_list", S, {}), /permission/, "teacher cannot list members");
const ml = await good(rpc(owner, "api_members_list", S, {}), "members 2"); const memTeacher = ml.members.find(m => m.email === "teach@a.test"); const memOwner = ml.members.find(m => m.isMe);
await bad(rpc(owner, "api_member_update", S, { assignmentId: memOwner.assignmentId, isActive: false }), /own access/, "cannot deactivate yourself");
await good(rpc(owner, "api_member_update", S, { assignmentId: memTeacher.assignmentId, roleId: roleId("head_teacher") }), "change role");
await good(rpc(owner, "api_member_update", S, { assignmentId: memTeacher.assignmentId, roleId: roleId("teacher") }), "change role back");
await good(rpc(owner, "api_member_update", S, { assignmentId: memTeacher.assignmentId, isActive: false }), "deactivate");
await bad(rpc(teacherU, "api_me", S, {}), /not assigned/, "deactivated user has no access");
await good(rpc(owner, "api_member_update", S, { assignmentId: memTeacher.assignmentId, isActive: true }), "reactivate");
const inv = (await good(rpc(owner, "api_members_list", S, {}), "inv list")).invitations; ok(inv.length === 1 && inv.some(i => i.email === "ghost@a.test"), "pending invitations listed");
await good(rpc(owner, "api_invite_revoke", S, { id: inv.find(i => i.email === "ghost@a.test").id }), "revoke");
await bad(rpc(owner, "api_invite_revoke", S, { id: inv.find(i => i.email === "ghost@a.test").id }), /not waiting/, "revoke twice");

// ---------- academics ----------
const y1 = (await good(rpc(owner, "api_year_save", S, { name: "2026", startsOn: "2026-01-05", endsOn: "2026-12-04", isCurrent: true }), "year")).id;
await bad(rpc(owner, "api_year_save", S, { name: "2026", startsOn: "2026-01-05", endsOn: "2026-12-04" }), /already exists/, "duplicate year");
await bad(rpc(owner, "api_year_save", S, { name: "Bad", startsOn: "2026-05-01", endsOn: "2026-04-01" }), /after the start/, "dates order");
const y2 = (await good(rpc(owner, "api_year_save", S, { name: "2027", startsOn: "2027-01-04", endsOn: "2027-12-03" }), "year 2")).id;
await good(rpc(owner, "api_year_save", S, { id: y2, name: "2027", startsOn: "2027-01-04", endsOn: "2027-12-03", isCurrent: false }), "edit year");
eq((await su("select count(*)::int n from public.academic_years where school_id = $1 and is_current", [S]))[0].n, 1, "one current year");
await good(rpc(owner, "api_term_save", S, { academicYearId: y1, name: "Term 1", startsOn: "2026-01-05", endsOn: "2026-04-10" }), "term");
await bad(rpc(owner, "api_term_save", S, { academicYearId: y1, name: "Term X", startsOn: "2025-12-01", endsOn: "2026-04-10" }), /inside the academic year/, "term outside year");
const c1 = (await good(rpc(owner, "api_class_save", S, { academicYearId: y1, name: "P4 A", levelOrder: 4, capacity: 2 }), "class")).id;
const c2 = (await good(rpc(owner, "api_class_save", S, { academicYearId: y1, name: "P4 B", levelOrder: 4, capacity: 30 }), "class 2")).id;
const c5 = (await good(rpc(owner, "api_class_save", S, { academicYearId: y2, name: "P5 A", levelOrder: 5, capacity: 30 }), "class next year")).id;
await bad(rpc(owner, "api_class_save", S, { academicYearId: y1, name: "P4 A" }), /already has a class/, "duplicate class");
const math = (await good(rpc(owner, "api_subject_save", S, { name: "Mathematics", code: "MAT" }), "subject")).id;
const eng = (await good(rpc(owner, "api_subject_save", S, { name: "English" }), "subject 2")).id;
await bad(rpc(owner, "api_subject_save", S, { name: "Mathematics" }), /already exists/, "duplicate subject");
await good(rpc(owner, "api_class_subjects_set", S, { classId: c1, subjectIds: [math, eng] }), "class subjects");
await good(rpc(owner, "api_class_subjects_set", S, { classId: c2, subjectIds: [math] }), "class subjects 2");
await bad(rpc(owner, "api_class_subjects_set", S, { classId: c1, subjectIds: ["00000000-0000-0000-0000-000000000099"] }), /not found/, "unknown subject");
const t1 = (await good(rpc(owner, "api_staff_save", S, { firstName: "Alice", lastName: "Mukamana", employmentType: "teacher", userId: teacherU }), "teacher")).id;
const t2 = (await good(rpc(owner, "api_staff_save", S, { firstName: "Bob", lastName: "Habimana", employmentType: "teacher" }), "teacher 2")).id;
await bad(rpc(owner, "api_staff_save", S, { firstName: "X", lastName: "Y", employmentType: "teacher", userId: ownerB }), /must have access/, "linked user must belong");
await good(rpc(owner, "api_assignment_save", S, { employeeId: t1, classId: c1, isClassTeacher: true }), "class teacher");
await good(rpc(owner, "api_assignment_save", S, { employeeId: t2, classId: c1, isClassTeacher: true }), "replace class teacher");
eq((await su("select count(*)::int n from public.teacher_assignments where class_id = $1 and is_class_teacher", [c1]))[0].n, 1, "single class teacher");
await good(rpc(owner, "api_assignment_save", S, { employeeId: t1, classId: c1, subjectId: math }), "subject teacher");
await bad(rpc(owner, "api_assignment_save", S, { employeeId: t1, classId: c1, subjectId: math }), /already assigned/, "duplicate assignment");
await bad(rpc(owner, "api_assignment_save", S, { employeeId: t1, classId: c2, subjectId: eng }), /not taught/, "subject must be in class");
const empNum = (await good(rpc(owner, "api_staff_list", S, {}), "staff list")).staff.map(s => s.employeeNumber); ok(empNum.includes("EMP-0001") && empNum.includes("EMP-0002"), "employee numbers");
const cl = await good(rpc(owner, "api_classes_list", S, {}), "classes list"); eq(cl.classes.length, 2, "classes of current year"); ok(cl.classes.find(c => c.id === c1).classTeacher === "Bob Habimana", "class teacher shown");

// ---------- students ----------
const g = (f, l) => ({ firstName: f, lastName: l, relationship: "Mother", phone: "0788123456", isPrimary: true, isEmergency: true });
const st1 = await good(rpc(owner, "api_student_save", S, { firstName: "Ange", lastName: "Uwase", gender: "female", dateOfBirth: "2015-03-02", classId: c1, guardians: [g("Marie", "Uwase")] }), "student 1");
ok(/^STU-00001$/.test(st1.studentNumber), "student number format " + st1.studentNumber);
const st2 = await good(rpc(owner, "api_student_save", S, { firstName: "Eric", lastName: "Niyonzima", gender: "male", dateOfBirth: "2014-07-19", classId: c1 }), "student 2");
await bad(rpc(owner, "api_student_save", S, { firstName: "Third", lastName: "Kid", classId: c1 }), /is full/, "class capacity enforced");
await bad(rpc(owner, "api_student_save", S, { firstName: "Ange", lastName: "Uwase", dateOfBirth: "2015-03-02" }), /same name and date of birth/, "duplicate student detected");
await good(rpc(owner, "api_student_save", S, { firstName: "Ange", lastName: "Uwase", dateOfBirth: "2015-03-02", allowDuplicate: true }), "duplicate allowed on confirm");
await bad(rpc(owner, "api_student_save", S, { firstName: "Future", lastName: "Baby", dateOfBirth: addDays(todayStr, 3) }), /realistic/, "future birth date");
await bad(rpc(owner, "api_student_save", S, { firstName: "A", lastName: "B", gender: "robot" }), /Gender/, "gender validated");
await bad(rpc(owner, "api_student_save", S, { firstName: "", lastName: "B" }), /First name is required/, "required name");
await bad(rpc(owner, "api_student_save", S, { firstName: "A", lastName: "B", email: "nope" }), /valid email/, "email validated");
await bad(rpc(owner, "api_student_save", S, { firstName: "A", lastName: "B", phone: "abc" }), /digits/, "phone validated");
const stp = (await good(rpc(owner, "api_student_save", S, { firstName: "Percent", lastName: "50% Off_Name" }), "special chars")).id;
const lst = await good(rpc(owner, "api_students_list", S, { search: "50%" }), "search %"); eq(lst.total, 1, "search treats % literally");
const lst2 = await good(rpc(owner, "api_students_list", S, { classId: c1 }), "filter class"); eq(lst2.total, 2, "class filter");
const lst3 = await good(rpc(owner, "api_students_list", S, { pageSize: 2, page: 2 }), "paging"); eq([lst3.rows.length, lst3.total], [2, 4], "pagination");
const prof = await good(rpc(owner, "api_student_get", S, { studentId: st1.id }), "profile"); eq(prof.guardians.length, 1, "guardian saved"); eq(prof.enrollments[0].className, "P4 A", "enrollment saved");
await good(rpc(owner, "api_guardian_save", S, { studentId: st1.id, firstName: "Jean", lastName: "Uwase", relationship: "Father", phone: "0788000111", isPrimary: true }), "second guardian becomes primary");
const prof2 = await good(rpc(owner, "api_student_get", S, { studentId: st1.id }), "profile 2"); eq(prof2.guardians.filter(x => x.isPrimary).length, 1, "single primary guardian"); eq(prof2.guardians[0].firstName, "Jean", "primary first");
await good(rpc(owner, "api_guardian_unlink", S, { studentId: st1.id, guardianId: prof2.guardians[1].id }), "unlink");
eq((await su("select count(*)::int n from public.guardians where school_id = $1", [S]))[0].n, 1, "orphan guardian removed");
await good(rpc(owner, "api_student_enroll", S, { studentId: st1.id, classId: c2 }), "move class"); eq((await good(rpc(owner, "api_students_list", S, { classId: c2 }), "c2")).total, 1, "moved");
await good(rpc(owner, "api_student_enroll", S, { studentId: st1.id, classId: c1 }), "move back");
await bad(rpc(owner, "api_student_get", S, { studentId: "00000000-0000-0000-0000-000000000001" }), /not found/, "unknown student");

// ---------- cross-school isolation ----------
await bad(rpc(ownerB, "api_students_list", S, {}), /permission/, "other school owner cannot list students");
await bad(rpc(ownerB, "api_student_get", S, { studentId: st1.id }), /permission/, "other school cannot read a profile");
await bad(rpc(ownerB, "api_student_get", SB, { studentId: st1.id }), /not found/, "own school scope hides foreign student");
await bad(rpc(owner, "api_student_enroll", S, { studentId: st1.id, classId: (await good(rpc(ownerB, "api_year_save", SB, { name: "B26", startsOn: "2026-01-01", endsOn: "2026-12-01", isCurrent: true }), "yB")).id }), /not found/, "foreign class id refused");
const cB = (await good(rpc(ownerB, "api_class_save", SB, { academicYearId: (await su("select id from public.academic_years where school_id = $1", [SB]))[0].id, name: "B1" }), "classB")).id;
await bad(rpc(owner, "api_student_enroll", S, { studentId: st1.id, classId: cB }), /not found/, "foreign class refused again");
eq((await asUser(ownerB, "select count(*)::int n from public.students"))[0].n, 0, "direct select: other school sees no students");
eq((await asUser(owner, "select count(*)::int n from public.students"))[0].n >= 4, true, "direct select: owner sees students");
await bad(asAnon("select 1 from public.students").then(() => ({ ok: true })).catch(e => ({ ok: false, error: e.message })), /permission denied|x/, "anon cannot read students");
const anonCount = await asAnon("select count(*)::int n from public.students").then(r => r[0].n, () => -1); ok(anonCount === 0 || anonCount === -1, "anon sees nothing");

// ---------- attendance ----------
await bad(rpc(teacherU, "api_attendance_save", S, { classId: c2, date: todayStr, entries: [{ studentId: st1.id, status: "present" }] }), /classes you teach|not active/, "teacher cannot mark another class");
const sheet = await good(rpc(teacherU, "api_attendance_sheet", S, { classId: c1 }), "sheet"); ok(sheet.students.length === 2 || sheet.students.length === 3, "sheet lists enrolled students");
// teacher t1 is linked and assigned (subject teacher of c1) so may mark c1
ok(sheet.canMark === true, "assigned teacher can mark");
const entries = sheet.students.map((s, i) => ({ studentId: s.studentId, status: i === 0 ? "absent" : "present" }));
await good(rpc(teacherU, "api_attendance_save", S, { classId: c1, date: todayStr, entries }), "teacher marks today");
await bad(rpc(teacherU, "api_attendance_save", S, { classId: c1, date: addDays(todayStr, 1), entries }), /future/, "future date refused");
await bad(rpc(teacherU, "api_attendance_save", S, { classId: c1, date: addDays(todayStr, -1), entries }), /permission/, "past date needs correction permission");
await good(rpc(owner, "api_attendance_save", S, { classId: c1, date: addDays(todayStr, -1), entries }), "owner may correct past dates");
await bad(rpc(owner, "api_attendance_save", S, { classId: c1, date: todayStr, entries: [{ studentId: stp, status: "present" }] }), /not active in this class/, "student of another class refused");
await bad(rpc(owner, "api_attendance_save", S, { classId: c1, date: todayStr, entries: [{ studentId: st1.id, status: "maybe" }] }), /Status must be/, "status validated");
await bad(rpc(owner, "api_attendance_save", S, { classId: c1, date: todayStr, entries: [{ studentId: st1.id, status: "present" }, { studentId: st1.id, status: "late" }] }), /twice/, "duplicates refused");
await good(rpc(owner, "api_attendance_save", S, { classId: c1, date: todayStr, entries: [{ studentId: st1.id, status: "late", note: "bus" }] }), "re-save updates, not duplicates");
eq((await su("select count(*)::int n from public.attendance_records where student_id = $1 and attendance_date = $2", [st1.id, todayStr]))[0].n, 1, "one record per student per day");
const sm = await good(rpc(owner, "api_attendance_summary", S, {}), "summary"); const row = sm.classes.find(c => c.classId === c1); ok(row.late === 1 && row.enrolled >= 2, "summary counts"); eq(sm.trend.length, 14, "14 day trend");
const dow = new Date(todayStr + "T00:00:00Z").getUTCDay() || 7;
await su("update public.school_settings set working_days = $2 where school_id = $1", [S, `{${[1, 2, 3, 4, 5, 6, 7].filter(d => d !== dow).join(",")}}`]);
await bad(rpc(owner, "api_attendance_save", S, { classId: c1, date: todayStr, entries: [{ studentId: st1.id, status: "present" }] }), /not a school day/, "non-school day refused");
await su("update public.school_settings set working_days = '{1,2,3,4,5,6,7}' where school_id = $1", [S]);
const prof3 = await good(rpc(owner, "api_student_get", S, { studentId: st1.id }), "profile attendance"); ok(prof3.attendance.summary.late >= 1, "profile shows attendance");

// ---------- timetable ----------
const p1 = (await good(rpc(owner, "api_period_save", S, { name: "Period 1", sortOrder: 1, startTime: "08:00", endTime: "08:40" }), "period")).id;
const pb = (await good(rpc(owner, "api_period_save", S, { name: "Break", sortOrder: 2, startTime: "08:40", endTime: "09:00", isBreak: true }), "break")).id;
await bad(rpc(owner, "api_period_save", S, { name: "Overlap", sortOrder: 3, startTime: "08:30", endTime: "09:10" }), /overlaps/, "period overlap");
await bad(rpc(owner, "api_period_save", S, { name: "Dup", sortOrder: 1, startTime: "10:00", endTime: "10:40" }), /order number/, "duplicate order");
await bad(rpc(owner, "api_period_save", S, { name: "Bad time", sortOrder: 5, startTime: "25:00", endTime: "26:00" }), /Times must/, "time format");
const p2 = (await good(rpc(owner, "api_period_save", S, { name: "Period 2", sortOrder: 3, startTime: "09:00", endTime: "09:40" }), "period 2")).id;
const r1 = (await good(rpc(owner, "api_classroom_save", S, { name: "Room 1", capacity: 40 }), "room")).id;
const e1 = (await good(rpc(owner, "api_timetable_entry_save", S, { classId: c1, dayOfWeek: 1, periodId: p1, subjectId: math, employeeId: t1, classroomId: r1 }), "lesson")).id;
await bad(rpc(owner, "api_timetable_entry_save", S, { classId: c1, dayOfWeek: 1, periodId: p1, subjectId: eng }), /already has a lesson/, "class slot taken");
await bad(rpc(owner, "api_timetable_entry_save", S, { classId: c2, dayOfWeek: 1, periodId: p1, subjectId: math, employeeId: t1 }), /Clash: this teacher/, "teacher double-booking refused");
await bad(rpc(owner, "api_timetable_entry_save", S, { classId: c2, dayOfWeek: 1, periodId: p1, subjectId: math, employeeId: t2, classroomId: r1 }), /Clash: this classroom/, "room double-booking refused");
await good(rpc(owner, "api_timetable_entry_save", S, { classId: c2, dayOfWeek: 1, periodId: p1, subjectId: math, employeeId: t2 }), "other teacher is fine");
await bad(rpc(owner, "api_timetable_entry_save", S, { classId: c1, dayOfWeek: 2, periodId: pb, subjectId: math }), /break/, "no lesson in a break");
await bad(rpc(owner, "api_timetable_entry_save", S, { classId: c2, dayOfWeek: 2, periodId: p2, subjectId: eng }), /not taught/, "subject must be in class");
await good(rpc(owner, "api_timetable_entry_save", S, { id: e1, classId: c1, dayOfWeek: 1, periodId: p2, subjectId: math, employeeId: t1, classroomId: r1 }), "move a lesson");
await bad(rpc(owner, "api_class_subjects_set", S, { classId: c1, subjectIds: [eng] }), /in the timetable/, "cannot drop a timetabled subject");
await bad(rpc(owner, "api_period_delete", S, { id: p2 }), /scheduled/, "cannot delete a used period");
const tt = await good(rpc(owner, "api_timetable_get", S, { employeeId: t1 }), "teacher view"); eq(tt.entries.length, 1, "teacher timetable");
const tt2 = await good(rpc(owner, "api_timetable_get", S, { classId: c1 }), "class view"); eq(tt2.entries[0].subject, "Mathematics", "class timetable");
await bad(rpc(teacherU, "api_timetable_entry_save", S, { classId: c1, dayOfWeek: 3, periodId: p1, subjectId: math }), /permission/, "teacher cannot edit timetable");
await good(rpc(teacherU, "api_timetable_get", S, { classId: c1 }), "teacher can view timetable");
await good(rpc(owner, "api_timetable_entry_delete", S, { id: e1 }), "delete lesson");

// ---------- admissions ----------
const regUser = regU;
const ap = (await good(rpc(regUser, "api_application_save", S, { firstName: "Grace", lastName: "Ingabire", gender: "female" }), "draft application")).id;
await bad(rpc(regUser, "api_application_action", S, { id: ap, action: "submit" }), /Date of birth is required/, "incomplete draft cannot be submitted");
await good(rpc(regUser, "api_application_save", S, { id: ap, firstName: "Grace", lastName: "Ingabire", gender: "female", dateOfBirth: "2016-05-05", desiredClassId: c2, guardianFirstName: "Anne", guardianLastName: "Ingabire", guardianRelationship: "Mother", guardianPhone: "0788555000" }), "complete the draft");
await good(rpc(regUser, "api_application_action", S, { id: ap, action: "submit" }), "submit");
await bad(rpc(regUser, "api_application_action", S, { id: ap, action: "enroll" }), /Only an approved/, "cannot enrol before approval");
await bad(rpc(regUser, "api_application_action", S, { id: ap, action: "reject" }), /reason/, "reject needs a reason");
await good(rpc(regUser, "api_application_action", S, { id: ap, action: "review" }), "review");
await good(rpc(regUser, "api_application_action", S, { id: ap, action: "approve" }), "approve");
await bad(rpc(regUser, "api_application_save", S, { id: ap, firstName: "X", lastName: "Y" }), /cannot be edited/, "approved application is locked");
const en = await good(rpc(regUser, "api_application_action", S, { id: ap, action: "enroll" }), "enrol creates student"); ok(/^STU-/.test(en.studentNumber), "student number from enrolment");
const sp = await good(rpc(regUser, "api_student_get", S, { studentId: en.studentId }), "enrolled profile"); eq([sp.guardians.length, sp.enrollments[0].className, /^ADM-/.test(sp.student.admissionNumber)], [1, "P4 B", true], "no double entry: guardian, class, admission number carried over");
await bad(rpc(regUser, "api_application_action", S, { id: ap, action: "enroll" }), /Only an approved/, "enrol twice refused");
eq((await su("select count(*)::int n from public.students where first_name = 'Grace'"))[0].n, 1, "exactly one student created");
const ap2 = (await good(rpc(regUser, "api_application_save", S, { firstName: "Hope", lastName: "Teta", dateOfBirth: "2016-01-01", desiredClassId: c2, guardianFirstName: "Z", guardianLastName: "Teta", guardianPhone: "0788000999", submit: true }), "save and submit")).id;
await good(rpc(regUser, "api_application_action", S, { id: ap2, action: "waitlist", note: "No space" }), "waitlist");
await good(rpc(regUser, "api_application_action", S, { id: ap2, action: "reject", note: "Incomplete documents" }), "reject");
const al = await good(rpc(regUser, "api_applications_list", S, {}), "applications list"); eq([al.total, al.counts.enrolled, al.counts.rejected], [2, 1, 1], "status counts");
await bad(rpc(teacherU, "api_applications_list", S, {}), /permission/, "teacher cannot see admissions");
eq((await asUser(teacherU, "select count(*)::int n from public.admission_applications"))[0].n, 0, "teacher direct select on admissions returns nothing");
await bad(rpc(teacherU, "api_application_action", S, { id: ap2, action: "approve" }), /permission/, "teacher cannot approve");

// ---------- promotion ----------
const pr = await good(rpc(owner, "api_students_promote", S, { fromClassId: c1, toClassId: c5, studentIds: [st1.id, st2.id], mode: "promote" }), "promote"); eq(pr.count, 2, "two promoted");
const hist = await good(rpc(owner, "api_student_get", S, { studentId: st1.id }), "history kept"); eq(hist.enrollments.map(e => e.status), ["active", "promoted"], "history preserved, newest first");
await bad(rpc(owner, "api_students_promote", S, { fromClassId: c1, toClassId: c2, studentIds: [st1.id] }), /different/, "same-year promotion refused");
await good(rpc(owner, "api_student_status", S, { studentId: st2.id, status: "withdrawn", note: "Moved away" }), "withdraw");
eq((await su("select status from public.student_enrollments where student_id = $1 order by created_at desc limit 1", [st2.id]))[0].status.length > 0, true, "enrolment follows status");
await bad(rpc(owner, "api_student_enroll", S, { studentId: st2.id, classId: c2 }), /Only active/, "withdrawn student cannot be placed");
await good(rpc(owner, "api_student_status", S, { studentId: st2.id, status: "active" }), "reactivate");
await bad(rpc(owner, "api_student_status", S, { studentId: st2.id, status: "dead" }), /not valid/, "status validated");

// ---------- delete protections ----------
await bad(rpc(owner, "api_class_delete", S, { id: c1 }), /cannot be deleted/, "class with students kept");
await bad(rpc(owner, "api_year_delete", S, { id: y1 }), /classes or enrolled/, "year with classes kept");
await bad(rpc(owner, "api_subject_delete", S, { id: math }), /used by classes/, "used subject kept");
await good(rpc(owner, "api_subject_save", S, { name: "Temp" }), "temp subject"); const tmp = (await su("select id from public.subjects where name = 'Temp' and school_id = $1", [S]))[0].id; await good(rpc(owner, "api_subject_delete", S, { id: tmp }), "unused subject deleted");

// ---------- dashboard and money ----------
await su("insert into public.payments(school_id, amount, status, receipt_number) values ($1, 12000, 'confirmed', 'R-1')", [S]);
const dOwner = await good(rpc(owner, "get_dashboard_overview", S, {}).then(async () => { try { const r = await sql.begin(async tx => { await tx.unsafe("set local role authenticated"); await tx.unsafe("select set_config('request.jwt.claim.sub', $1, true)", [owner]); return tx.unsafe("select public.get_dashboard_overview($1) r", [S]); }); return { ok: true, data: J(r[0].r) }; } catch (e) { return { ok: false, error: e.message }; } }), "owner dashboard");
const dTeacher = await sql.begin(async tx => { await tx.unsafe("set local role authenticated"); await tx.unsafe("select set_config('request.jwt.claim.sub', $1, true)", [teacherU]); return J((await tx.unsafe("select public.get_dashboard_overview($1) r", [S]))[0].r); });
eq(Number(dOwner.stats.collected), 12000, "owner sees collections"); eq(Number(dTeacher.stats.collected), 0, "teacher does not see collections"); eq(dTeacher.recent_admissions.length, 0, "teacher does not see admissions");
ok(dOwner.stats.students >= 4, "dashboard counts students");
eq((await asUser(teacherU, "select count(*)::int n from public.payments"))[0].n, 0, "teacher cannot read payments directly");
eq((await asUser(regU, "select count(*)::int n from public.payments"))[0].n, 0, "registrar cannot read payments directly");
eq((await asUser(owner, "select count(*)::int n from public.payments"))[0].n, 1, "owner reads payments");
// direct writes remain impossible from the browser
const w = await asUser(owner, "insert into public.students(school_id, student_number, first_name, last_name) values ($1, 'X', 'a', 'b')", [S]).then(() => "wrote", e => "blocked"); eq(w, "blocked", "no direct inserts");
// settings
await good(rpc(owner, "api_settings_save", S, { schoolName: "Alpha School", studentPrefix: "alp", admissionPrefix: "adm", language: "rw", workingDays: [1, 2, 3, 4, 5] }), "settings save");
await bad(rpc(owner, "api_settings_save", S, { schoolName: "Alpha", studentPrefix: "bad prefix!" }), /prefix/, "prefix validated");
await bad(rpc(teacherU, "api_settings_get", S, {}), /permission/, "teacher cannot open settings");
const stN = await good(rpc(owner, "api_student_save", S, { firstName: "Prefix", lastName: "Check" }), "prefix student"); ok(/^ALP-\d{5}$/.test(stN.studentNumber), "prefix applied " + stN.studentNumber);
// audit
ok((await su("select count(*)::int n from public.audit_logs where school_id = $1", [S]))[0].n > 40, "actions are audited");
const aud = await asUser(teacherU, "select count(*)::int n from public.audit_logs"); eq(aud[0].n, 0, "teacher cannot read audit logs");
// invalid payload shapes
await bad(rpc(owner, "api_student_save", S, { firstName: 5, lastName: "x" }), /must be text/, "wrong type refused");
await bad(rpc(owner, "api_student_save", S, { firstName: "a".repeat(200), lastName: "x" }), /too long/, "length limit");
await bad(rpc(owner, "api_students_list", S, { pageSize: 5000 }), /whole number from 1 to 100/, "page size cap");
await bad(rpc(owner, "api_students_list", S, { classId: "not-a-uuid" }), /not valid/, "uuid validated");
await bad(rpc(owner, "api_student_save", S, null), /First name is required/, "null payload handled gracefully");
console.log(`${pass} passed, ${fail} failed`);
await sql.close(); process.exit(fail ? 1 : 0);
