-- EduNexus Phase 2: enforced roles, invitations, academics, students, admissions, attendance, timetable.
-- Run AFTER 0001, 0002 and 0003. Every browser request still goes through the `api` Edge Function;
-- every function below checks the caller's permission inside the database as well.

---------------------------------------------------------------------------------------------------
-- 1. Small helpers (input checking, numbering, audit)
---------------------------------------------------------------------------------------------------
create or replace function public.j_text(p jsonb, k text, label text, maxlen int default 160)
returns text language plpgsql immutable set search_path = public as $$
declare v jsonb := p -> k; t text;
begin
  if v is null or jsonb_typeof(v) = 'null' then return null; end if;
  if jsonb_typeof(v) <> 'string' then raise exception '% must be text.', label using errcode = '22023'; end if;
  t := btrim(v #>> '{}');
  if t = '' then return null; end if;
  if char_length(t) > maxlen then raise exception '% is too long (maximum % characters).', label, maxlen using errcode = '22023'; end if;
  return t;
end $$;

create or replace function public.j_req(p jsonb, k text, label text, maxlen int default 160)
returns text language plpgsql immutable set search_path = public as $$
declare t text := public.j_text(p, k, label, maxlen);
begin
  if t is null then raise exception '% is required.', label using errcode = '22023'; end if;
  return t;
end $$;

create or replace function public.j_uuid(p jsonb, k text, label text, required boolean default false)
returns uuid language plpgsql immutable set search_path = public as $$
declare t text := public.j_text(p, k, label, 36);
begin
  if t is null then
    if required then raise exception '% is required.', label using errcode = '22023'; end if;
    return null;
  end if;
  if t !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception '% is not valid.', label using errcode = '22023'; end if;
  return t::uuid;
end $$;

create or replace function public.j_date(p jsonb, k text, label text, required boolean default false)
returns date language plpgsql immutable set search_path = public as $$
declare t text := public.j_text(p, k, label, 10);
begin
  if t is null then
    if required then raise exception '% is required.', label using errcode = '22023'; end if;
    return null;
  end if;
  if t !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '% must be a date (YYYY-MM-DD).', label using errcode = '22023'; end if;
  begin return t::date; exception when others then raise exception '% is not a real date.', label using errcode = '22023'; end;
end $$;

create or replace function public.j_int(p jsonb, k text, label text, lo int, hi int, required boolean default false)
returns int language plpgsql immutable set search_path = public as $$
declare v jsonb := p -> k; n numeric;
begin
  if v is null or jsonb_typeof(v) = 'null' or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '') then
    if required then raise exception '% is required.', label using errcode = '22023'; end if;
    return null;
  end if;
  begin n := (v #>> '{}')::numeric; exception when others then raise exception '% must be a number.', label using errcode = '22023'; end;
  if n <> trunc(n) or n < lo or n > hi then raise exception '% must be a whole number from % to %.', label, lo, hi using errcode = '22023'; end if;
  return n::int;
end $$;

create or replace function public.j_bool(p jsonb, k text, dflt boolean default false)
returns boolean language sql immutable set search_path = public as $$
  select case when jsonb_typeof(p -> k) = 'boolean' then (p ->> k)::boolean else dflt end
$$;

create or replace function public.j_email(p jsonb, k text, label text default 'Email')
returns text language plpgsql immutable set search_path = public as $$
declare t text := lower(public.j_text(p, k, label, 160));
begin
  if t is not null and t !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception '% is not a valid email address.', label using errcode = '22023'; end if;
  return t;
end $$;

create or replace function public.j_phone(p jsonb, k text, label text default 'Phone')
returns text language plpgsql immutable set search_path = public as $$
declare t text := public.j_text(p, k, label, 30);
begin
  if t is not null and t !~ '^[0-9+() -]{6,30}$' then raise exception '% may contain only digits, spaces, + ( ) and -.', label using errcode = '22023'; end if;
  return t;
end $$;

create table public.school_counters (
  school_id uuid not null references public.schools(id) on delete cascade,
  key text not null,
  value bigint not null default 0,
  primary key (school_id, key)
);
alter table public.school_counters enable row level security;

create or replace function public.next_number(p_school uuid, p_key text)
returns bigint language sql security definer set search_path = public as $$
  insert into public.school_counters(school_id, key, value) values (p_school, p_key, 1)
  on conflict (school_id, key) do update set value = public.school_counters.value + 1
  returning value;
$$;

create or replace function public.audit(p_school uuid, p_action text, p_type text, p_id uuid, p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs(school_id, actor_id, action, entity_type, entity_id, metadata) values (p_school, auth.uid(), p_action, p_type, p_id, coalesce(p_meta, '{}'::jsonb));
$$;

create or replace function public.school_today(p_school uuid)
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select timezone from public.schools where id = p_school), 'UTC'))::date;
$$;

---------------------------------------------------------------------------------------------------
-- 2. Permissions (roles are now enforced)
---------------------------------------------------------------------------------------------------
insert into public.permissions(key, module, action, description)
select m.module || '.' || a.action, m.module, a.action, initcap(m.module) || ' - ' || a.action
from (values
  ('dashboard', array['view']),
  ('admissions', array['view','create','edit','approve','export']),
  ('students', array['view','create','edit','delete','export','print']),
  ('academics', array['view','create','edit','delete']),
  ('attendance', array['view','create','edit','approve','export']),
  ('timetable', array['view','create','edit','delete','print']),
  ('staff', array['view','create','edit']),
  ('users', array['view','create','edit','delete']),
  ('settings', array['view','edit']),
  ('finance', array['view'])
) as m(module, actions)
cross join lateral unnest(m.actions) as a(action)
on conflict (key) do nothing;

create or replace function public.has_permission(p_school_id uuid, p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_school_id is not null and exists (
    select 1 from public.user_school_assignments usa
    join public.role_permissions rp on rp.role_id = usa.role_id
    join public.permissions pm on pm.id = rp.permission_id
    where usa.user_id = auth.uid() and usa.school_id = p_school_id and usa.is_active and pm.key = p_key
  );
$$;

create or replace function public.require_permission(p_school_id uuid, p_key text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if not public.has_permission(p_school_id, p_key) then raise exception 'You do not have permission to do this.' using errcode = '42501'; end if;
end $$;

create or replace function public.seed_default_roles(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_role uuid; v_all text[];
begin
  select array_agg(key) into v_all from public.permissions;
  for r in select * from (values
    ('school_owner', 'School Owner', v_all),
    ('school_administrator', 'School Administrator', v_all),
    ('head_teacher', 'Head Teacher', array['dashboard.view','admissions.view','admissions.create','admissions.edit','admissions.approve','admissions.export','students.view','students.create','students.edit','students.export','students.print','academics.view','academics.create','academics.edit','attendance.view','attendance.create','attendance.edit','attendance.approve','attendance.export','timetable.view','timetable.create','timetable.edit','timetable.delete','timetable.print','staff.view','users.view','settings.view']),
    ('registrar', 'Registrar', array['dashboard.view','admissions.view','admissions.create','admissions.edit','admissions.approve','admissions.export','students.view','students.create','students.edit','students.export','students.print','academics.view','attendance.view','timetable.view','timetable.print']),
    ('teacher', 'Teacher', array['dashboard.view','students.view','academics.view','attendance.view','attendance.create','timetable.view','timetable.print']),
    ('accountant', 'Accountant', array['dashboard.view','students.view','academics.view','finance.view'])
  ) as t(key, name, perms) loop
    insert into public.roles(organization_id, key, name, is_system) values (p_org, r.key, r.name, true)
    on conflict (organization_id, key) do nothing;
    select id into v_role from public.roles where organization_id = p_org and key = r.key;
    insert into public.role_permissions(role_id, permission_id)
    select v_role, pm.id from public.permissions pm where pm.key = any (r.perms)
    on conflict do nothing;
  end loop;
end $$;

select public.seed_default_roles(id) from public.organizations;

create or replace function public.create_school_with_owner(
  p_organization_name text, p_school_name text, p_school_code text, p_campus_name text, p_country text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_school uuid; v_campus uuid; v_role uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if not (p_school_code ~ '^[A-Z0-9-]{2,16}$') then raise exception 'School code must contain 2–16 letters, numbers, or hyphens'; end if;
  insert into public.organizations(name) values(trim(p_organization_name)) returning id into v_org;
  insert into public.schools(organization_id, name, code, country) values(v_org, trim(p_school_name), upper(trim(p_school_code)), trim(p_country)) returning id into v_school;
  insert into public.campuses(school_id, name, code) values(v_school, trim(p_campus_name), 'MAIN') returning id into v_campus;
  insert into public.school_settings(school_id) values(v_school);
  perform public.seed_default_roles(v_org);
  select id into v_role from public.roles where organization_id = v_org and key = 'school_owner';
  insert into public.user_roles(user_id, role_id) values(auth.uid(), v_role);
  insert into public.user_school_assignments(user_id, school_id, campus_id, role_id) values(auth.uid(), v_school, v_campus, v_role);
  insert into public.audit_logs(school_id, actor_id, action, entity_type, entity_id, metadata)
  values(v_school, auth.uid(), 'create', 'school', v_school, jsonb_build_object('source', 'onboarding'));
  return v_school;
end $$;

-- One active role per person per school.
create unique index if not exists user_school_one_active_role on public.user_school_assignments(user_id, school_id) where is_active;

---------------------------------------------------------------------------------------------------
-- 3. Row level security: direct table reads now need the matching permission
---------------------------------------------------------------------------------------------------
create or replace function public.storage_school(p_name text)
returns uuid language sql immutable set search_path = public, storage as $$
  select case when (storage.foldername(p_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (storage.foldername(p_name))[1]::uuid end;
$$;

drop policy if exists years_select_assigned on public.academic_years;
drop policy if exists terms_select_assigned on public.terms;
drop policy if exists departments_select_assigned on public.departments;
drop policy if exists classes_select_assigned on public.classes;
drop policy if exists subjects_select_assigned on public.subjects;
drop policy if exists students_select_assigned on public.students;
drop policy if exists guardians_select_assigned on public.guardians;
drop policy if exists student_guardians_select_assigned on public.student_guardians;
drop policy if exists enrollments_select_assigned on public.student_enrollments;
drop policy if exists admissions_select_assigned on public.admission_applications;
drop policy if exists employees_select_assigned on public.employees;
drop policy if exists attendance_select_assigned on public.attendance_records;
drop policy if exists invoices_select_assigned on public.student_invoices;
drop policy if exists payments_select_assigned on public.payments;
drop policy if exists expenses_select_assigned on public.expenses;
drop policy if exists audit_logs_select_assigned on public.audit_logs;
drop policy if exists school_documents_select on storage.objects;
drop policy if exists school_documents_insert on storage.objects;
drop policy if exists school_documents_update on storage.objects;
drop policy if exists school_documents_delete on storage.objects;

create policy years_select on public.academic_years for select to authenticated using (public.has_permission(school_id, 'academics.view'));
create policy terms_select on public.terms for select to authenticated using (public.has_permission(school_id, 'academics.view'));
create policy departments_select on public.departments for select to authenticated using (public.has_permission(school_id, 'academics.view'));
create policy classes_select on public.classes for select to authenticated using (public.has_permission(school_id, 'academics.view'));
create policy subjects_select on public.subjects for select to authenticated using (public.has_permission(school_id, 'academics.view'));
create policy students_select on public.students for select to authenticated using (public.has_permission(school_id, 'students.view'));
create policy guardians_select on public.guardians for select to authenticated using (public.has_permission(school_id, 'students.view'));
create policy student_guardians_select on public.student_guardians for select to authenticated using (exists (select 1 from public.students s where s.id = student_id and public.has_permission(s.school_id, 'students.view')));
create policy enrollments_select on public.student_enrollments for select to authenticated using (public.has_permission(school_id, 'students.view'));
create policy admissions_select on public.admission_applications for select to authenticated using (public.has_permission(school_id, 'admissions.view'));
create policy employees_select on public.employees for select to authenticated using (public.has_permission(school_id, 'staff.view'));
create policy attendance_select on public.attendance_records for select to authenticated using (public.has_permission(school_id, 'attendance.view'));
create policy invoices_select on public.student_invoices for select to authenticated using (public.has_permission(school_id, 'finance.view'));
create policy payments_select on public.payments for select to authenticated using (public.has_permission(school_id, 'finance.view'));
create policy expenses_select on public.expenses for select to authenticated using (public.has_permission(school_id, 'finance.view'));
create policy audit_logs_select on public.audit_logs for select to authenticated using (school_id is not null and public.has_permission(school_id, 'users.view'));
create policy school_documents_select on storage.objects for select to authenticated using (bucket_id in ('school-documents', 'school-media') and public.has_permission(public.storage_school(name), 'students.view'));
create policy school_documents_insert on storage.objects for insert to authenticated with check (bucket_id in ('school-documents', 'school-media') and public.has_permission(public.storage_school(name), 'students.edit'));
create policy school_documents_update on storage.objects for update to authenticated using (bucket_id in ('school-documents', 'school-media') and public.has_permission(public.storage_school(name), 'students.edit'));
create policy school_documents_delete on storage.objects for delete to authenticated using (bucket_id in ('school-documents', 'school-media') and public.has_permission(public.storage_school(name), 'students.edit'));

---------------------------------------------------------------------------------------------------
-- 4. New tables and columns
---------------------------------------------------------------------------------------------------
create table public.school_invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  email text not null check (email = lower(email)),
  role_id uuid not null references public.roles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);
create unique index school_invitations_one_pending on public.school_invitations(school_id, email) where status = 'pending';
alter table public.school_invitations enable row level security;
create policy invitations_select on public.school_invitations for select to authenticated using (public.has_permission(school_id, 'users.view'));

alter table public.school_settings add column working_days smallint[] not null default '{1,2,3,4,5}';
alter table public.employees add column phone text, add column email text;

alter table public.admission_applications
  add column nationality text, add column address text, add column previous_school text, add column previous_class text,
  add column guardian_first_name text, add column guardian_last_name text, add column guardian_relationship text,
  add column guardian_phone text, add column guardian_email text, add column notes text,
  add column student_id uuid references public.students(id) on delete set null;

create table public.class_subjects (
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  primary key (class_id, subject_id)
);

create table public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid references public.subjects(id) on delete cascade,
  is_class_teacher boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index teacher_assignments_unique on public.teacher_assignments(class_id, employee_id, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid));
create unique index teacher_assignments_one_class_teacher on public.teacher_assignments(class_id) where is_class_teacher;
create index teacher_assignments_employee_idx on public.teacher_assignments(employee_id);

create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  capacity integer check (capacity > 0),
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

create table public.timetable_periods (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  sort_order integer not null,
  start_time time not null,
  end_time time not null check (end_time > start_time),
  is_break boolean not null default false,
  unique (school_id, sort_order)
);

create table public.timetable_entries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  period_id uuid not null references public.timetable_periods(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  classroom_id uuid references public.classrooms(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (class_id, day_of_week, period_id)
);
create unique index timetable_teacher_clash on public.timetable_entries(academic_year_id, employee_id, day_of_week, period_id) where employee_id is not null;
create unique index timetable_room_clash on public.timetable_entries(academic_year_id, classroom_id, day_of_week, period_id) where classroom_id is not null;

alter table public.class_subjects enable row level security;
alter table public.teacher_assignments enable row level security;
alter table public.classrooms enable row level security;
alter table public.timetable_periods enable row level security;
alter table public.timetable_entries enable row level security;
create policy class_subjects_select on public.class_subjects for select to authenticated using (public.has_permission(school_id, 'academics.view'));
create policy teacher_assignments_select on public.teacher_assignments for select to authenticated using (public.has_permission(school_id, 'academics.view'));
create policy classrooms_select on public.classrooms for select to authenticated using (public.has_permission(school_id, 'timetable.view'));
create policy periods_select on public.timetable_periods for select to authenticated using (public.has_permission(school_id, 'timetable.view'));
create policy entries_select on public.timetable_entries for select to authenticated using (public.has_permission(school_id, 'timetable.view'));

-- Classes always belong to a year, and a name is unique inside a year.
update public.classes c set academic_year_id = (select id from public.academic_years y where y.school_id = c.school_id order by is_current desc, starts_on desc limit 1) where academic_year_id is null and exists (select 1 from public.academic_years y where y.school_id = c.school_id);

---------------------------------------------------------------------------------------------------
-- 5. Dashboard: money and admissions only for people who may see them
---------------------------------------------------------------------------------------------------
create or replace function public.get_dashboard_overview(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text; v_today date; v_stats jsonb; v_enrollment jsonb; v_finance jsonb; v_admissions jsonb; v_events jsonb; v_payments jsonb; v_notifications jsonb;
begin
  select timezone into v_tz from public.schools where id = p_school_id;
  v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;
  if not public.has_permission(p_school_id, 'dashboard.view') then raise exception 'You do not have permission to open the dashboard.' using errcode = '42501'; end if;
  select jsonb_build_object(
    'students', (select count(*) from public.students where school_id = p_school_id and enrollment_status = 'active'),
    'male_students', (select count(*) from public.students where school_id = p_school_id and enrollment_status = 'active' and gender = 'male'),
    'female_students', (select count(*) from public.students where school_id = p_school_id and enrollment_status = 'active' and gender = 'female'),
    'teachers', (select count(*) from public.employees where school_id = p_school_id and is_active and employment_type = 'teacher'),
    'employees', (select count(*) from public.employees where school_id = p_school_id and is_active),
    'classes', (select count(*) from public.classes where school_id = p_school_id),
    'subjects', (select count(*) from public.subjects where school_id = p_school_id),
    'departments', (select count(*) from public.departments where school_id = p_school_id),
    'present_today', (select count(*) from public.attendance_records where school_id = p_school_id and attendance_date = v_today and status = 'present'),
    'absent_today', (select count(*) from public.attendance_records where school_id = p_school_id and attendance_date = v_today and status = 'absent'),
    'late_today', (select count(*) from public.attendance_records where school_id = p_school_id and attendance_date = v_today and status = 'late'),
    'attendance_rate', coalesce((select round(100.0 * count(*) filter (where status in ('present', 'late')) / nullif(count(*), 0), 1) from public.attendance_records where school_id = p_school_id and attendance_date = v_today), 0),
    'invoiced', coalesce((select sum(total_amount) from public.student_invoices where school_id = p_school_id and status <> 'void'), 0),
    'collected', coalesce((select sum(amount) from public.payments where school_id = p_school_id and status = 'confirmed'), 0),
    'outstanding', coalesce((select sum(balance_due) from public.student_invoices where school_id = p_school_id and status <> 'void'), 0),
    'collected_today', coalesce((select sum(amount) from public.payments where school_id = p_school_id and status = 'confirmed' and (paid_at at time zone coalesce(v_tz, 'UTC'))::date = v_today), 0)
  ) into v_stats;
  select coalesce(jsonb_agg(row.item order by row.month_start), '[]'::jsonb) into v_enrollment from (
    select m.month_start, jsonb_build_object('label', to_char(m.month_start, 'Mon'), 'value', count(se.id)) as item
    from generate_series(date_trunc('month', v_today) - interval '5 months', date_trunc('month', v_today), interval '1 month') m(month_start)
    left join public.student_enrollments se on se.school_id = p_school_id and date_trunc('month', se.enrollment_date::timestamp) = m.month_start
    group by m.month_start
  ) row;
  select coalesce(jsonb_agg(row.item order by row.month_start), '[]'::jsonb) into v_finance from (
    select m.month_start, jsonb_build_object('label', to_char(m.month_start, 'Mon'), 'income', coalesce((select sum(p.amount) from public.payments p where p.school_id = p_school_id and p.status = 'confirmed' and date_trunc('month', p.paid_at) = m.month_start), 0), 'expense', coalesce((select sum(e.amount) from public.expenses e where e.school_id = p_school_id and e.status = 'posted' and date_trunc('month', e.expense_date::timestamp) = m.month_start), 0)) as item
    from generate_series(date_trunc('month', v_today) - interval '5 months', date_trunc('month', v_today), interval '1 month') m(month_start)
  ) row;
  select coalesce(jsonb_agg(jsonb_build_object('id', row.id, 'full_name', row.full_name, 'status', row.status, 'submitted_at', row.submitted_at) order by row.submitted_at desc), '[]'::jsonb) into v_admissions from (select id, concat_ws(' ', first_name, middle_name, last_name) as full_name, status::text, submitted_at from public.admission_applications where school_id = p_school_id order by submitted_at desc nulls last limit 5) row;
  select coalesce(jsonb_agg(jsonb_build_object('id', row.id, 'title', row.title, 'starts_at', row.starts_at, 'category', row.category) order by row.starts_at), '[]'::jsonb) into v_events from (select id, title, starts_at, category from public.school_events where school_id = p_school_id and starts_at >= now() order by starts_at limit 5) row;
  select coalesce(jsonb_agg(jsonb_build_object('id', row.id, 'receipt_number', row.receipt_number, 'amount', row.amount, 'paid_at', row.paid_at, 'payer_name', row.payer_name) order by row.paid_at desc), '[]'::jsonb) into v_payments from (select p.id, p.receipt_number, p.amount, p.paid_at, concat_ws(' ', s.first_name, s.last_name) as payer_name from public.payments p left join public.students s on s.id = p.student_id where p.school_id = p_school_id and p.status = 'confirmed' order by p.paid_at desc limit 5) row;
  select coalesce(jsonb_agg(jsonb_build_object('id', row.id, 'title', row.title, 'body', row.body, 'created_at', row.created_at) order by row.created_at desc), '[]'::jsonb) into v_notifications from (select id, title, body, created_at from public.notifications where school_id = p_school_id and (recipient_id is null or recipient_id = auth.uid()) order by created_at desc limit 5) row;
  if not public.has_permission(p_school_id, 'finance.view') then
    v_stats := v_stats || jsonb_build_object('invoiced', 0, 'collected', 0, 'outstanding', 0, 'collected_today', 0); v_finance := '[]'::jsonb; v_payments := '[]'::jsonb;
  end if;
  if not public.has_permission(p_school_id, 'admissions.view') then v_admissions := '[]'::jsonb; end if;
  return jsonb_build_object('stats', v_stats, 'enrollment_trend', v_enrollment, 'finance_trend', v_finance, 'recent_admissions', v_admissions, 'upcoming_events', v_events, 'recent_payments', v_payments, 'notifications', v_notifications);
end;
$$;

---------------------------------------------------------------------------------------------------
-- 6. Session helpers: who am I, what may I do, invitations
---------------------------------------------------------------------------------------------------
create or replace function public.claim_invitations()
returns int language plpgsql security definer set search_path = public as $$
declare v_email text; r record; n int := 0;
begin
  if auth.uid() is null then return 0; end if;
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  for r in select * from public.school_invitations where email = v_email and status = 'pending' loop
    if not exists (select 1 from public.user_school_assignments where user_id = auth.uid() and school_id = r.school_id and is_active) then
      insert into public.user_school_assignments(user_id, school_id, role_id) values (auth.uid(), r.school_id, r.role_id)
      on conflict (user_id, school_id, role_id) do update set is_active = true;
      insert into public.user_roles(user_id, role_id) values (auth.uid(), r.role_id) on conflict do nothing;
      n := n + 1;
    end if;
    update public.school_invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = r.id;
    perform public.audit(r.school_id, 'accept', 'invitation', r.id);
  end loop;
  return n;
end $$;

create or replace function public.api_me(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_school_access(p_school_id) then raise exception 'You are not assigned to this school.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'permissions', coalesce((select jsonb_agg(pm.key order by pm.key) from public.user_school_assignments usa join public.role_permissions rp on rp.role_id = usa.role_id join public.permissions pm on pm.id = rp.permission_id where usa.user_id = auth.uid() and usa.school_id = p_school_id and usa.is_active), '[]'::jsonb),
    'role', (select r.name from public.user_school_assignments usa join public.roles r on r.id = usa.role_id where usa.user_id = auth.uid() and usa.school_id = p_school_id and usa.is_active limit 1),
    'roleKey', (select r.key from public.user_school_assignments usa join public.roles r on r.id = usa.role_id where usa.user_id = auth.uid() and usa.school_id = p_school_id and usa.is_active limit 1),
    'userId', auth.uid(),
    'workingDays', (select to_jsonb(working_days) from public.school_settings where school_id = p_school_id)
  );
end $$;

---------------------------------------------------------------------------------------------------
-- 7. Users, roles and invitations
---------------------------------------------------------------------------------------------------
create or replace function public.api_members_list(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid;
begin
  perform public.require_permission(p_school_id, 'users.view');
  select organization_id into v_org from public.schools where id = p_school_id;
  return jsonb_build_object(
    'members', coalesce((select jsonb_agg(jsonb_build_object('assignmentId', usa.id, 'userId', usa.user_id, 'name', coalesce(nullif(pr.full_name, ''), au.email), 'email', au.email, 'roleId', usa.role_id, 'role', r.name, 'roleKey', r.key, 'isActive', usa.is_active, 'isMe', usa.user_id = auth.uid()) order by usa.is_active desc, pr.full_name)
      from public.user_school_assignments usa join public.profiles pr on pr.id = usa.user_id join auth.users au on au.id = usa.user_id join public.roles r on r.id = usa.role_id where usa.school_id = p_school_id), '[]'::jsonb),
    'invitations', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', r.name, 'status', i.status, 'createdAt', i.created_at) order by i.created_at desc)
      from public.school_invitations i join public.roles r on r.id = i.role_id where i.school_id = p_school_id and i.status = 'pending'), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'key', r.key, 'name', r.name) order by r.name) from public.roles r where r.organization_id = v_org and r.key <> 'school_owner'), '[]'::jsonb)
  );
end $$;

create or replace function public.api_invite_create(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_email text; v_role uuid; v_key text; v_uid uuid; v_id uuid; v_org uuid;
begin
  perform public.require_permission(p_school_id, 'users.create');
  v_email := public.j_email(p_payload, 'email', 'Email'); if v_email is null then raise exception 'Email is required.' using errcode = '22023'; end if;
  v_role := public.j_uuid(p_payload, 'roleId', 'Role', true);
  select organization_id into v_org from public.schools where id = p_school_id;
  select key into v_key from public.roles where id = v_role and organization_id = v_org;
  if v_key is null then raise exception 'Choose a role of this school.' using errcode = '22023'; end if;
  if v_key = 'school_owner' then raise exception 'The School Owner role cannot be given by invitation.' using errcode = '22023'; end if;
  select id into v_uid from auth.users where lower(email) = v_email and email_confirmed_at is not null;
  if v_uid is not null and exists (select 1 from public.user_school_assignments where user_id = v_uid and school_id = p_school_id and is_active) then
    raise exception 'This person already has access to the school.' using errcode = '22023';
  end if;
  if v_uid is not null then
    insert into public.user_school_assignments(user_id, school_id, role_id) values (v_uid, p_school_id, v_role)
    on conflict (user_id, school_id, role_id) do update set is_active = true;
    insert into public.user_roles(user_id, role_id) values (v_uid, v_role) on conflict do nothing;
    insert into public.school_invitations(school_id, email, role_id, status, invited_by, accepted_by, accepted_at) values (p_school_id, v_email, v_role, 'accepted', auth.uid(), v_uid, now()) returning id into v_id;
    perform public.audit(p_school_id, 'add_member', 'invitation', v_id, jsonb_build_object('email', v_email, 'role', v_key));
    return jsonb_build_object('status', 'added', 'message', 'This person already has an account and now has access.');
  end if;
  begin
    insert into public.school_invitations(school_id, email, role_id, invited_by) values (p_school_id, v_email, v_role, auth.uid()) returning id into v_id;
  exception when unique_violation then raise exception 'An invitation for this email is already waiting.' using errcode = '22023';
  end;
  perform public.audit(p_school_id, 'invite', 'invitation', v_id, jsonb_build_object('email', v_email, 'role', v_key));
  return jsonb_build_object('status', 'pending', 'message', 'Invitation saved. Ask the person to create an account with this email and confirm it; they get access automatically when they sign in.');
end $$;

create or replace function public.api_invite_revoke(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Invitation', true);
begin
  perform public.require_permission(p_school_id, 'users.delete');
  update public.school_invitations set status = 'revoked' where id = v_id and school_id = p_school_id and status = 'pending';
  if not found then raise exception 'That invitation is not waiting any more.' using errcode = '22023'; end if;
  perform public.audit(p_school_id, 'revoke', 'invitation', v_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.api_member_update(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'assignmentId', 'Member', true); v_role uuid := public.j_uuid(p_payload, 'roleId', 'Role'); a record; v_key text; v_org uuid;
begin
  perform public.require_permission(p_school_id, 'users.edit');
  select usa.*, r.key as role_key into a from public.user_school_assignments usa join public.roles r on r.id = usa.role_id where usa.id = v_id and usa.school_id = p_school_id;
  if not found then raise exception 'That member was not found.' using errcode = '22023'; end if;
  if a.user_id = auth.uid() then raise exception 'You cannot change your own access.' using errcode = '22023'; end if;
  if a.role_key = 'school_owner' then raise exception 'The School Owner cannot be changed here.' using errcode = '22023'; end if;
  if v_role is not null then
    select organization_id into v_org from public.schools where id = p_school_id;
    select key into v_key from public.roles where id = v_role and organization_id = v_org;
    if v_key is null or v_key = 'school_owner' then raise exception 'Choose another role.' using errcode = '22023'; end if;
    update public.user_school_assignments set role_id = v_role where id = v_id;
    insert into public.user_roles(user_id, role_id) values (a.user_id, v_role) on conflict do nothing;
  end if;
  if p_payload ? 'isActive' then
    begin update public.user_school_assignments set is_active = public.j_bool(p_payload, 'isActive', a.is_active) where id = v_id;
    exception when unique_violation then raise exception 'This person already has another active access to the school.' using errcode = '22023'; end;
  end if;
  perform public.audit(p_school_id, 'update_member', 'assignment', v_id, jsonb_build_object('role', v_key, 'isActive', p_payload -> 'isActive'));
  return jsonb_build_object('ok', true);
end $$;

---------------------------------------------------------------------------------------------------
-- 8. Lookups for drop-down lists
---------------------------------------------------------------------------------------------------
create or replace function public.api_lookups(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_year uuid := public.j_uuid(p_payload, 'yearId', 'Year'); v_cur uuid;
begin
  if not public.has_school_access(p_school_id) then raise exception 'You are not assigned to this school.' using errcode = '42501'; end if;
  select id into v_cur from public.academic_years where school_id = p_school_id and is_current;
  v_year := coalesce(v_year, v_cur);
  return jsonb_build_object(
    'currentYearId', v_cur, 'yearId', v_year,
    'years', coalesce((select jsonb_agg(jsonb_build_object('id', y.id, 'name', y.name, 'isCurrent', y.is_current, 'startsOn', y.starts_on, 'endsOn', y.ends_on) order by y.starts_on desc) from public.academic_years y where y.school_id = p_school_id), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'yearId', c.academic_year_id, 'levelOrder', c.level_order) order by c.level_order, c.name) from public.classes c where c.school_id = p_school_id and c.academic_year_id = v_year), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code) order by s.name) from public.subjects s where s.school_id = p_school_id), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.first_name || ' ' || e.last_name) order by e.first_name, e.last_name) from public.employees e where e.school_id = p_school_id and e.is_active and e.employment_type = 'teacher'), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name) from public.departments d where d.school_id = p_school_id), '[]'::jsonb),
    'classrooms', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) order by r.name) from public.classrooms r where r.school_id = p_school_id), '[]'::jsonb)
  );
end $$;

---------------------------------------------------------------------------------------------------
-- 9. Academics: years, terms, classes, departments, subjects, class subjects, teacher assignments
---------------------------------------------------------------------------------------------------
create or replace function public.api_years_list(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_permission(p_school_id, 'academics.view');
  return jsonb_build_object('years', coalesce((select jsonb_agg(jsonb_build_object('id', y.id, 'name', y.name, 'startsOn', y.starts_on, 'endsOn', y.ends_on, 'isCurrent', y.is_current,
    'classCount', (select count(*) from public.classes c where c.academic_year_id = y.id),
    'terms', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'startsOn', t.starts_on, 'endsOn', t.ends_on) order by t.starts_on) from public.terms t where t.academic_year_id = y.id), '[]'::jsonb)) order by y.starts_on desc)
    from public.academic_years y where y.school_id = p_school_id), '[]'::jsonb));
end $$;

create or replace function public.api_year_save(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Year'); v_name text := public.j_req(p_payload, 'name', 'Year name', 40);
  v_from date := public.j_date(p_payload, 'startsOn', 'Start date', true); v_to date := public.j_date(p_payload, 'endsOn', 'End date', true); v_cur boolean := public.j_bool(p_payload, 'isCurrent', false);
begin
  perform public.require_permission(p_school_id, case when v_id is null then 'academics.create' else 'academics.edit' end);
  if v_to <= v_from then raise exception 'The end date must be after the start date.' using errcode = '22023'; end if;
  begin
    if v_cur then update public.academic_years set is_current = false where school_id = p_school_id and is_current and id is distinct from v_id; end if;
    if v_id is null then
      insert into public.academic_years(school_id, name, starts_on, ends_on, is_current) values (p_school_id, v_name, v_from, v_to, v_cur) returning id into v_id;
    else
      update public.academic_years set name = v_name, starts_on = v_from, ends_on = v_to, is_current = v_cur where id = v_id and school_id = p_school_id;
      if not found then raise exception 'That academic year was not found.' using errcode = '22023'; end if;
    end if;
  exception when unique_violation then raise exception 'An academic year with this name already exists.' using errcode = '22023';
  end;
  perform public.audit(p_school_id, 'save', 'academic_year', v_id, jsonb_build_object('name', v_name));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.api_year_delete(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Year', true);
begin
  perform public.require_permission(p_school_id, 'academics.delete');
  if not exists (select 1 from public.academic_years where id = v_id and school_id = p_school_id) then raise exception 'That academic year was not found.' using errcode = '22023'; end if;
  if exists (select 1 from public.classes where academic_year_id = v_id) or exists (select 1 from public.student_enrollments where academic_year_id = v_id) then
    raise exception 'This year has classes or enrolled students. Remove those first.' using errcode = '22023';
  end if;
  delete from public.academic_years where id = v_id;
  perform public.audit(p_school_id, 'delete', 'academic_year', v_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.api_term_save(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Term'); v_year uuid := public.j_uuid(p_payload, 'academicYearId', 'Academic year', true); v_name text := public.j_req(p_payload, 'name', 'Term name', 40);
  v_from date := public.j_date(p_payload, 'startsOn', 'Start date', true); v_to date := public.j_date(p_payload, 'endsOn', 'End date', true); y record;
begin
  perform public.require_permission(p_school_id, case when v_id is null then 'academics.create' else 'academics.edit' end);
  select * into y from public.academic_years where id = v_year and school_id = p_school_id;
  if not found then raise exception 'That academic year was not found.' using errcode = '22023'; end if;
  if v_to <= v_from then raise exception 'The end date must be after the start date.' using errcode = '22023'; end if;
  if v_from < y.starts_on or v_to > y.ends_on then raise exception 'The term must fall inside the academic year (% to %).', y.starts_on, y.ends_on using errcode = '22023'; end if;
  begin
    if v_id is null then insert into public.terms(school_id, academic_year_id, name, starts_on, ends_on) values (p_school_id, v_year, v_name, v_from, v_to) returning id into v_id;
    else update public.terms set name = v_name, starts_on = v_from, ends_on = v_to where id = v_id and school_id = p_school_id and academic_year_id = v_year;
      if not found then raise exception 'That term was not found.' using errcode = '22023'; end if; end if;
  exception when unique_violation then raise exception 'This year already has a term with that name.' using errcode = '22023';
  end;
  perform public.audit(p_school_id, 'save', 'term', v_id, jsonb_build_object('name', v_name));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.api_term_delete(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Term', true);
begin
  perform public.require_permission(p_school_id, 'academics.delete');
  delete from public.terms where id = v_id and school_id = p_school_id;
  if not found then raise exception 'That term was not found.' using errcode = '22023'; end if;
  perform public.audit(p_school_id, 'delete', 'term', v_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.api_classes_list(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_year uuid := public.j_uuid(p_payload, 'yearId', 'Year');
begin
  perform public.require_permission(p_school_id, 'academics.view');
  if v_year is null then select id into v_year from public.academic_years where school_id = p_school_id and is_current; end if;
  return jsonb_build_object('yearId', v_year, 'classes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'levelOrder', c.level_order, 'capacity', c.capacity, 'yearId', c.academic_year_id,
    'students', (select count(*) from public.student_enrollments e where e.class_id = c.id and e.status = 'active'),
    'classTeacher', (select e.first_name || ' ' || e.last_name from public.teacher_assignments ta join public.employees e on e.id = ta.employee_id where ta.class_id = c.id and ta.is_class_teacher limit 1),
    'subjects', (select count(*) from public.class_subjects cs where cs.class_id = c.id)) order by c.level_order, c.name)
    from public.classes c where c.school_id = p_school_id and c.academic_year_id = v_year), '[]'::jsonb));
end $$;

create or replace function public.api_class_save(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Class'); v_year uuid := public.j_uuid(p_payload, 'academicYearId', 'Academic year', true); v_name text := public.j_req(p_payload, 'name', 'Class name', 60);
  v_level int := coalesce(public.j_int(p_payload, 'levelOrder', 'Level order', 0, 100), 0); v_cap int := public.j_int(p_payload, 'capacity', 'Capacity', 1, 500); v_enrolled int;
begin
  perform public.require_permission(p_school_id, case when v_id is null then 'academics.create' else 'academics.edit' end);
  if not exists (select 1 from public.academic_years where id = v_year and school_id = p_school_id) then raise exception 'That academic year was not found.' using errcode = '22023'; end if;
  begin
    if v_id is null then
      insert into public.classes(school_id, academic_year_id, name, level_order, capacity) values (p_school_id, v_year, v_name, v_level, v_cap) returning id into v_id;
    else
      select count(*) into v_enrolled from public.student_enrollments where class_id = v_id and status = 'active';
      if v_cap is not null and v_cap < v_enrolled then raise exception 'The class already has % students; capacity cannot be lower.', v_enrolled using errcode = '22023'; end if;
      update public.classes set name = v_name, level_order = v_level, capacity = v_cap where id = v_id and school_id = p_school_id and academic_year_id = v_year;
      if not found then raise exception 'That class was not found.' using errcode = '22023'; end if;
    end if;
  exception when unique_violation then raise exception 'This year already has a class with that name.' using errcode = '22023';
  end;
  perform public.audit(p_school_id, 'save', 'class', v_id, jsonb_build_object('name', v_name));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.api_class_delete(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Class', true);
begin
  perform public.require_permission(p_school_id, 'academics.delete');
  if not exists (select 1 from public.classes where id = v_id and school_id = p_school_id) then raise exception 'That class was not found.' using errcode = '22023'; end if;
  if exists (select 1 from public.student_enrollments where class_id = v_id) or exists (select 1 from public.attendance_records where class_id = v_id) or exists (select 1 from public.timetable_entries where class_id = v_id) then
    raise exception 'This class has students, attendance or timetable records and cannot be deleted.' using errcode = '22023';
  end if;
  delete from public.classes where id = v_id;
  perform public.audit(p_school_id, 'delete', 'class', v_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.api_departments_list(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_permission(p_school_id, 'academics.view');
  return jsonb_build_object('departments', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'code', d.code, 'subjects', (select count(*) from public.subjects s where s.department_id = d.id)) order by d.name) from public.departments d where d.school_id = p_school_id), '[]'::jsonb));
end $$;

create or replace function public.api_department_save(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Department'); v_name text := public.j_req(p_payload, 'name', 'Department name', 80); v_code text := public.j_text(p_payload, 'code', 'Code', 20);
begin
  perform public.require_permission(p_school_id, case when v_id is null then 'academics.create' else 'academics.edit' end);
  begin
    if v_id is null then insert into public.departments(school_id, name, code) values (p_school_id, v_name, v_code) returning id into v_id;
    else update public.departments set name = v_name, code = v_code where id = v_id and school_id = p_school_id; if not found then raise exception 'That department was not found.' using errcode = '22023'; end if; end if;
  exception when unique_violation then raise exception 'A department with this name already exists.' using errcode = '22023';
  end;
  perform public.audit(p_school_id, 'save', 'department', v_id, jsonb_build_object('name', v_name));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.api_department_delete(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Department', true);
begin
  perform public.require_permission(p_school_id, 'academics.delete');
  delete from public.departments where id = v_id and school_id = p_school_id;
  if not found then raise exception 'That department was not found.' using errcode = '22023'; end if;
  perform public.audit(p_school_id, 'delete', 'department', v_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.api_subjects_list(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_permission(p_school_id, 'academics.view');
  return jsonb_build_object('subjects', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code, 'departmentId', s.department_id, 'department', d.name, 'classes', (select count(*) from public.class_subjects cs where cs.subject_id = s.id)) order by s.name)
    from public.subjects s left join public.departments d on d.id = s.department_id where s.school_id = p_school_id), '[]'::jsonb));
end $$;

create or replace function public.api_subject_save(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Subject'); v_name text := public.j_req(p_payload, 'name', 'Subject name', 80); v_code text := public.j_text(p_payload, 'code', 'Code', 20); v_dep uuid := public.j_uuid(p_payload, 'departmentId', 'Department');
begin
  perform public.require_permission(p_school_id, case when v_id is null then 'academics.create' else 'academics.edit' end);
  if v_dep is not null and not exists (select 1 from public.departments where id = v_dep and school_id = p_school_id) then raise exception 'That department was not found.' using errcode = '22023'; end if;
  begin
    if v_id is null then insert into public.subjects(school_id, name, code, department_id) values (p_school_id, v_name, v_code, v_dep) returning id into v_id;
    else update public.subjects set name = v_name, code = v_code, department_id = v_dep where id = v_id and school_id = p_school_id; if not found then raise exception 'That subject was not found.' using errcode = '22023'; end if; end if;
  exception when unique_violation then raise exception 'A subject with this name already exists.' using errcode = '22023';
  end;
  perform public.audit(p_school_id, 'save', 'subject', v_id, jsonb_build_object('name', v_name));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.api_subject_delete(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Subject', true);
begin
  perform public.require_permission(p_school_id, 'academics.delete');
  if not exists (select 1 from public.subjects where id = v_id and school_id = p_school_id) then raise exception 'That subject was not found.' using errcode = '22023'; end if;
  if exists (select 1 from public.class_subjects where subject_id = v_id) or exists (select 1 from public.timetable_entries where subject_id = v_id) then
    raise exception 'This subject is used by classes or the timetable. Remove it from them first.' using errcode = '22023';
  end if;
  delete from public.subjects where id = v_id;
  perform public.audit(p_school_id, 'delete', 'subject', v_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.api_class_subjects_get(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_class uuid := public.j_uuid(p_payload, 'classId', 'Class', true);
begin
  perform public.require_permission(p_school_id, 'academics.view');
  return jsonb_build_object('subjectIds', coalesce((select jsonb_agg(subject_id) from public.class_subjects where class_id = v_class and school_id = p_school_id), '[]'::jsonb));
end $$;

create or replace function public.api_class_subjects_set(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_class uuid := public.j_uuid(p_payload, 'classId', 'Class', true); v_ids uuid[]; v_bad int; v_used text;
begin
  perform public.require_permission(p_school_id, 'academics.edit');
  if not exists (select 1 from public.classes where id = v_class and school_id = p_school_id) then raise exception 'That class was not found.' using errcode = '22023'; end if;
  if jsonb_typeof(p_payload -> 'subjectIds') is distinct from 'array' then raise exception 'Subjects must be a list.' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct x::uuid), '{}') into v_ids from jsonb_array_elements_text(p_payload -> 'subjectIds') x;
  select count(*) into v_bad from unnest(v_ids) u where not exists (select 1 from public.subjects s where s.id = u and s.school_id = p_school_id);
  if v_bad > 0 then raise exception 'One of the subjects was not found.' using errcode = '22023'; end if;
  select string_agg(s.name, ', ') into v_used from public.timetable_entries te join public.subjects s on s.id = te.subject_id where te.class_id = v_class and te.subject_id <> all (v_ids);
  if v_used is not null then raise exception 'These subjects are in the timetable and cannot be removed: %.', v_used using errcode = '22023'; end if;
  delete from public.class_subjects where class_id = v_class and subject_id <> all (v_ids);
  insert into public.class_subjects(class_id, subject_id, school_id) select v_class, u, p_school_id from unnest(v_ids) u on conflict do nothing;
  perform public.audit(p_school_id, 'set_subjects', 'class', v_class, jsonb_build_object('count', coalesce(array_length(v_ids, 1), 0)));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.api_assignments_list(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_class uuid := public.j_uuid(p_payload, 'classId', 'Class', true);
begin
  perform public.require_permission(p_school_id, 'academics.view');
  return jsonb_build_object('assignments', coalesce((select jsonb_agg(jsonb_build_object('id', ta.id, 'employeeId', ta.employee_id, 'teacher', e.first_name || ' ' || e.last_name, 'subjectId', ta.subject_id, 'subject', s.name, 'isClassTeacher', ta.is_class_teacher) order by ta.is_class_teacher desc, s.name)
    from public.teacher_assignments ta join public.employees e on e.id = ta.employee_id left join public.subjects s on s.id = ta.subject_id where ta.class_id = v_class and ta.school_id = p_school_id), '[]'::jsonb));
end $$;

create or replace function public.api_assignment_save(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.j_uuid(p_payload, 'employeeId', 'Teacher', true); v_class uuid := public.j_uuid(p_payload, 'classId', 'Class', true); v_sub uuid := public.j_uuid(p_payload, 'subjectId', 'Subject'); v_ct boolean := public.j_bool(p_payload, 'isClassTeacher', false); v_id uuid;
begin
  perform public.require_permission(p_school_id, 'academics.edit');
  if not exists (select 1 from public.employees where id = v_emp and school_id = p_school_id and is_active and employment_type = 'teacher') then raise exception 'Choose an active teacher.' using errcode = '22023'; end if;
  if not exists (select 1 from public.classes where id = v_class and school_id = p_school_id) then raise exception 'That class was not found.' using errcode = '22023'; end if;
  if v_ct then v_sub := null; else
    if v_sub is null then raise exception 'Choose a subject, or tick "class teacher".' using errcode = '22023'; end if;
    if not exists (select 1 from public.class_subjects where class_id = v_class and subject_id = v_sub) then raise exception 'That subject is not taught in this class. Add it to the class first.' using errcode = '22023'; end if;
  end if;
  begin
    if v_ct then delete from public.teacher_assignments where class_id = v_class and is_class_teacher; end if;
    insert into public.teacher_assignments(school_id, employee_id, class_id, subject_id, is_class_teacher) values (p_school_id, v_emp, v_class, v_sub, v_ct) returning id into v_id;
  exception when unique_violation then raise exception 'This teacher is already assigned to that class and subject.' using errcode = '22023';
  end;
  perform public.audit(p_school_id, 'assign_teacher', 'class', v_class, jsonb_build_object('employee', v_emp, 'subject', v_sub, 'classTeacher', v_ct));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.api_assignment_delete(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Assignment', true);
begin
  perform public.require_permission(p_school_id, 'academics.edit');
  delete from public.teacher_assignments where id = v_id and school_id = p_school_id;
  if not found then raise exception 'That assignment was not found.' using errcode = '22023'; end if;
  perform public.audit(p_school_id, 'unassign_teacher', 'assignment', v_id);
  return jsonb_build_object('ok', true);
end $$;

---------------------------------------------------------------------------------------------------
-- 10. Staff (teachers and other employees) and school settings
---------------------------------------------------------------------------------------------------
create or replace function public.api_staff_list(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_search text := public.j_text(p_payload, 'search', 'Search', 80); v_pat text;
begin
  perform public.require_permission(p_school_id, 'staff.view');
  if v_search is not null then v_pat := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%'; end if;
  return jsonb_build_object('staff', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'employeeNumber', e.employee_number, 'firstName', e.first_name, 'lastName', e.last_name, 'name', e.first_name || ' ' || e.last_name,
    'employmentType', e.employment_type, 'departmentId', e.department_id, 'department', d.name, 'phone', e.phone, 'email', e.email, 'isActive', e.is_active, 'userId', e.profile_id) order by e.is_active desc, e.first_name, e.last_name)
    from public.employees e left join public.departments d on d.id = e.department_id
    where e.school_id = p_school_id and (v_pat is null or concat_ws(' ', e.first_name, e.last_name, e.employee_number) ilike v_pat escape '\')), '[]'::jsonb));
end $$;

create or replace function public.api_staff_save(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Staff member'); v_first text := public.j_req(p_payload, 'firstName', 'First name', 80); v_last text := public.j_req(p_payload, 'lastName', 'Last name', 80);
  v_type text := coalesce(public.j_text(p_payload, 'employmentType', 'Type', 20), 'staff'); v_dep uuid := public.j_uuid(p_payload, 'departmentId', 'Department');
  v_phone text := public.j_phone(p_payload, 'phone'); v_email text := public.j_email(p_payload, 'email'); v_user uuid := public.j_uuid(p_payload, 'userId', 'Linked user'); v_active boolean := public.j_bool(p_payload, 'isActive', true); v_num text;
begin
  perform public.require_permission(p_school_id, case when v_id is null then 'staff.create' else 'staff.edit' end);
  if v_type not in ('teacher', 'staff', 'administrator') then raise exception 'Type must be teacher, staff or administrator.' using errcode = '22023'; end if;
  if v_dep is not null and not exists (select 1 from public.departments where id = v_dep and school_id = p_school_id) then raise exception 'That department was not found.' using errcode = '22023'; end if;
  if v_user is not null and not exists (select 1 from public.user_school_assignments where user_id = v_user and school_id = p_school_id and is_active) then raise exception 'The linked user must have access to this school.' using errcode = '22023'; end if;
  if v_id is null then
    v_num := 'EMP-' || lpad(public.next_number(p_school_id, 'employee')::text, 4, '0');
    insert into public.employees(school_id, employee_number, first_name, last_name, employment_type, department_id, phone, email, profile_id, is_active) values (p_school_id, v_num, v_first, v_last, v_type, v_dep, v_phone, v_email, v_user, v_active) returning id into v_id;
  else
    update public.employees set first_name = v_first, last_name = v_last, employment_type = v_type, department_id = v_dep, phone = v_phone, email = v_email, profile_id = v_user, is_active = v_active where id = v_id and school_id = p_school_id;
    if not found then raise exception 'That staff member was not found.' using errcode = '22023'; end if;
  end if;
  perform public.audit(p_school_id, 'save', 'employee', v_id, jsonb_build_object('name', v_first || ' ' || v_last, 'type', v_type));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.api_settings_get(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_permission(p_school_id, 'settings.view');
  return (select jsonb_build_object('schoolName', s.name, 'code', s.code, 'country', s.country, 'timezone', s.timezone, 'currency', s.currency_code, 'studentPrefix', st.student_id_prefix, 'admissionPrefix', st.admission_number_prefix, 'language', st.default_language, 'workingDays', to_jsonb(st.working_days))
    from public.schools s join public.school_settings st on st.school_id = s.id where s.id = p_school_id);
end $$;

create or replace function public.api_settings_save(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sp text := upper(public.j_text(p_payload, 'studentPrefix', 'Student number prefix', 10)); v_ap text := upper(public.j_text(p_payload, 'admissionPrefix', 'Admission number prefix', 10)); v_lang text := coalesce(public.j_text(p_payload, 'language', 'Language', 2), 'en'); v_days smallint[]; v_name text := public.j_req(p_payload, 'schoolName', 'School name', 120);
begin
  perform public.require_permission(p_school_id, 'settings.edit');
  if v_sp is not null and v_sp !~ '^[A-Z0-9-]{1,10}$' then raise exception 'Student number prefix may contain only letters, numbers and hyphens.' using errcode = '22023'; end if;
  if v_ap is not null and v_ap !~ '^[A-Z0-9-]{1,10}$' then raise exception 'Admission number prefix may contain only letters, numbers and hyphens.' using errcode = '22023'; end if;
  if v_lang not in ('en', 'rw', 'fr') then raise exception 'Language must be en, rw or fr.' using errcode = '22023'; end if;
  if jsonb_typeof(p_payload -> 'workingDays') = 'array' then
    select coalesce(array_agg(distinct x::smallint order by x::smallint), '{}') into v_days from jsonb_array_elements_text(p_payload -> 'workingDays') x where x ~ '^[1-7]$';
    if coalesce(array_length(v_days, 1), 0) = 0 then raise exception 'Choose at least one working day.' using errcode = '22023'; end if;
  end if;
  update public.schools set name = v_name where id = p_school_id;
  update public.school_settings set student_id_prefix = v_sp, admission_number_prefix = v_ap, default_language = v_lang, working_days = coalesce(v_days, working_days) where school_id = p_school_id;
  perform public.audit(p_school_id, 'save', 'settings', p_school_id);
  return jsonb_build_object('ok', true);
end $$;

---------------------------------------------------------------------------------------------------
-- 11. Students and guardians
---------------------------------------------------------------------------------------------------
create or replace function public.enroll_student(p_school uuid, p_student uuid, p_class uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.classes where id = p_class and school_id = p_school for update;
  if not found then raise exception 'That class was not found.' using errcode = '22023'; end if;
  if c.academic_year_id is null then raise exception 'That class has no academic year.' using errcode = '22023'; end if;
  if c.capacity is not null and (select count(*) from public.student_enrollments where class_id = p_class and status = 'active' and student_id <> p_student) >= c.capacity then
    raise exception 'The class "%" is full (capacity %).', c.name, c.capacity using errcode = '22023';
  end if;
  insert into public.student_enrollments(school_id, student_id, academic_year_id, class_id, status) values (p_school, p_student, c.academic_year_id, p_class, 'active')
  on conflict (student_id, academic_year_id) do update set class_id = excluded.class_id, status = 'active';
end $$;

create or replace function public.add_guardian(p_school uuid, p_student uuid, g jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_rel text := coalesce(public.j_text(g, 'relationship', 'Relationship', 40), 'Guardian');
begin
  insert into public.guardians(school_id, first_name, last_name, relationship, phone, email, occupation, address)
  values (p_school, public.j_req(g, 'firstName', 'Guardian first name', 80), public.j_req(g, 'lastName', 'Guardian last name', 80), v_rel, public.j_phone(g, 'phone', 'Guardian phone'), public.j_email(g, 'email', 'Guardian email'), public.j_text(g, 'occupation', 'Occupation', 80), public.j_text(g, 'address', 'Guardian address', 200))
  returning id into v_id;
  insert into public.student_guardians(student_id, guardian_id, relationship, is_primary, is_emergency_contact)
  values (p_student, v_id, v_rel, public.j_bool(g, 'isPrimary', not exists (select 1 from public.student_guardians where student_id = p_student)), public.j_bool(g, 'isEmergency', false));
  return v_id;
end $$;

create or replace function public.api_students_list(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_search text := public.j_text(p_payload, 'search', 'Search', 80); v_class uuid := public.j_uuid(p_payload, 'classId', 'Class'); v_status text := public.j_text(p_payload, 'status', 'Status', 20);
  v_page int := coalesce(public.j_int(p_payload, 'page', 'Page', 1, 100000), 1); v_size int := coalesce(public.j_int(p_payload, 'pageSize', 'Page size', 1, 100), 25); v_year uuid; v_pat text; v_rows jsonb; v_total bigint;
begin
  perform public.require_permission(p_school_id, 'students.view');
  select id into v_year from public.academic_years where school_id = p_school_id and is_current;
  if v_search is not null then v_pat := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%'; end if;
  select coalesce(jsonb_agg(r.item order by r.rn), '[]'::jsonb), coalesce(max(r.total), 0) into v_rows, v_total from (
    select jsonb_build_object('id', s.id, 'studentNumber', s.student_number, 'admissionNumber', s.admission_number, 'name', concat_ws(' ', s.first_name, s.middle_name, s.last_name), 'gender', s.gender, 'status', s.enrollment_status, 'classId', e.class_id, 'className', c.name) as item,
      row_number() over (order by s.last_name, s.first_name, s.id) as rn, count(*) over () as total
    from public.students s
    left join public.student_enrollments e on e.student_id = s.id and e.academic_year_id = v_year
    left join public.classes c on c.id = e.class_id
    where s.school_id = p_school_id and (v_status is null or s.enrollment_status = v_status) and (v_class is null or e.class_id = v_class)
      and (v_pat is null or concat_ws(' ', s.first_name, s.middle_name, s.last_name) ilike v_pat escape '\' or s.student_number ilike v_pat escape '\' or coalesce(s.admission_number, '') ilike v_pat escape '\')
    order by s.last_name, s.first_name, s.id offset (v_page - 1) * v_size limit v_size
  ) r;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page, 'pageSize', v_size);
end $$;

create or replace function public.api_student_get(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'studentId', 'Student', true); s record;
begin
  perform public.require_permission(p_school_id, 'students.view');
  select * into s from public.students where id = v_id and school_id = p_school_id;
  if not found then raise exception 'That student was not found.' using errcode = '22023'; end if;
  return jsonb_build_object(
    'student', jsonb_build_object('id', s.id, 'studentNumber', s.student_number, 'admissionNumber', s.admission_number, 'firstName', s.first_name, 'middleName', s.middle_name, 'lastName', s.last_name,
      'gender', s.gender, 'dateOfBirth', s.date_of_birth, 'nationality', s.nationality, 'email', s.email, 'phone', s.phone, 'address', s.address, 'status', s.enrollment_status, 'createdAt', s.created_at),
    'guardians', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'firstName', g.first_name, 'lastName', g.last_name, 'relationship', sg.relationship, 'phone', g.phone, 'email', g.email, 'occupation', g.occupation, 'address', g.address, 'isPrimary', sg.is_primary, 'isEmergency', sg.is_emergency_contact) order by sg.is_primary desc, g.first_name)
      from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id where sg.student_id = s.id), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'year', y.name, 'yearId', y.id, 'classId', e.class_id, 'className', c.name, 'status', e.status, 'enrollmentDate', e.enrollment_date, 'isCurrentYear', y.is_current) order by y.starts_on desc)
      from public.student_enrollments e join public.academic_years y on y.id = e.academic_year_id left join public.classes c on c.id = e.class_id where e.student_id = s.id), '[]'::jsonb),
    'attendance', case when public.has_permission(p_school_id, 'attendance.view') then jsonb_build_object(
      'summary', jsonb_build_object('present', (select count(*) from public.attendance_records a where a.student_id = s.id and a.status = 'present'), 'absent', (select count(*) from public.attendance_records a where a.student_id = s.id and a.status = 'absent'), 'late', (select count(*) from public.attendance_records a where a.student_id = s.id and a.status = 'late'), 'excused', (select count(*) from public.attendance_records a where a.student_id = s.id and a.status = 'excused')),
      'recent', coalesce((select jsonb_agg(jsonb_build_object('date', x.attendance_date, 'status', x.status, 'note', x.note) order by x.attendance_date desc) from (select * from public.attendance_records a where a.student_id = s.id order by a.attendance_date desc limit 30) x), '[]'::jsonb)) else null end
  );
end $$;

create or replace function public.api_student_save(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Student'); v_first text := public.j_req(p_payload, 'firstName', 'First name', 80); v_mid text := public.j_text(p_payload, 'middleName', 'Middle name', 80); v_last text := public.j_req(p_payload, 'lastName', 'Last name', 80);
  v_gender text := public.j_text(p_payload, 'gender', 'Gender', 20); v_dob date := public.j_date(p_payload, 'dateOfBirth', 'Date of birth'); v_nat text := public.j_text(p_payload, 'nationality', 'Nationality', 60);
  v_email text := public.j_email(p_payload, 'email'); v_phone text := public.j_phone(p_payload, 'phone'); v_addr text := public.j_text(p_payload, 'address', 'Address', 200); v_adm text := public.j_text(p_payload, 'admissionNumber', 'Admission number', 30);
  v_class uuid := public.j_uuid(p_payload, 'classId', 'Class'); v_dup boolean := public.j_bool(p_payload, 'allowDuplicate', false); v_num text; v_prefix text; g jsonb; d record;
begin
  perform public.require_permission(p_school_id, case when v_id is null then 'students.create' else 'students.edit' end);
  if v_gender is not null and v_gender not in ('male', 'female', 'other', 'undisclosed') then raise exception 'Gender is not valid.' using errcode = '22023'; end if;
  if v_dob is not null and (v_dob > public.school_today(p_school_id) or v_dob < date '1950-01-01') then raise exception 'Date of birth is not realistic.' using errcode = '22023'; end if;
  if v_dob is not null and not v_dup then
    select student_number, first_name, last_name into d from public.students where school_id = p_school_id and lower(first_name) = lower(v_first) and lower(last_name) = lower(v_last) and date_of_birth = v_dob and id is distinct from v_id limit 1;
    if found then raise exception 'A student with the same name and date of birth already exists (%). Open that profile instead.', d.student_number using errcode = '22023'; end if;
  end if;
  begin
    if v_id is null then
      select coalesce(student_id_prefix, 'STU') into v_prefix from public.school_settings where school_id = p_school_id;
      v_num := coalesce(v_prefix, 'STU') || '-' || lpad(public.next_number(p_school_id, 'student')::text, 5, '0');
      insert into public.students(school_id, student_number, admission_number, first_name, middle_name, last_name, gender, date_of_birth, nationality, email, phone, address)
      values (p_school_id, v_num, v_adm, v_first, v_mid, v_last, v_gender, v_dob, v_nat, v_email, v_phone, v_addr) returning id into v_id;
      if jsonb_typeof(p_payload -> 'guardians') = 'array' then
        if jsonb_array_length(p_payload -> 'guardians') > 5 then raise exception 'At most 5 guardians can be added at once.' using errcode = '22023'; end if;
        for g in select value from jsonb_array_elements(p_payload -> 'guardians') loop perform public.add_guardian(p_school_id, v_id, g); end loop;
      end if;
      if v_class is not null then perform public.enroll_student(p_school_id, v_id, v_class); end if;
    else
      update public.students set admission_number = v_adm, first_name = v_first, middle_name = v_mid, last_name = v_last, gender = v_gender, date_of_birth = v_dob, nationality = v_nat, email = v_email, phone = v_phone, address = v_addr where id = v_id and school_id = p_school_id;
      if not found then raise exception 'That student was not found.' using errcode = '22023'; end if;
    end if;
  exception when unique_violation then raise exception 'That admission number is already used by another student.' using errcode = '22023';
  end;
  perform public.audit(p_school_id, 'save', 'student', v_id, jsonb_build_object('name', v_first || ' ' || v_last));
  return jsonb_build_object('id', v_id, 'studentNumber', v_num);
end $$;

create or replace function public.api_guardian_save(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_student uuid := public.j_uuid(p_payload, 'studentId', 'Student', true); v_gid uuid := public.j_uuid(p_payload, 'guardianId', 'Guardian'); v_rel text := coalesce(public.j_text(p_payload, 'relationship', 'Relationship', 40), 'Guardian'); v_primary boolean := public.j_bool(p_payload, 'isPrimary', false);
begin
  perform public.require_permission(p_school_id, 'students.edit');
  if not exists (select 1 from public.students where id = v_student and school_id = p_school_id) then raise exception 'That student was not found.' using errcode = '22023'; end if;
  if v_gid is null then
    v_gid := public.add_guardian(p_school_id, v_student, p_payload);
  else
    if not exists (select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id where sg.student_id = v_student and sg.guardian_id = v_gid and g.school_id = p_school_id) then raise exception 'That guardian is not linked to this student.' using errcode = '22023'; end if;
    update public.guardians set first_name = public.j_req(p_payload, 'firstName', 'Guardian first name', 80), last_name = public.j_req(p_payload, 'lastName', 'Guardian last name', 80), relationship = v_rel, phone = public.j_phone(p_payload, 'phone', 'Guardian phone'), email = public.j_email(p_payload, 'email', 'Guardian email'), occupation = public.j_text(p_payload, 'occupation', 'Occupation', 80), address = public.j_text(p_payload, 'address', 'Guardian address', 200) where id = v_gid;
    update public.student_guardians set relationship = v_rel, is_primary = v_primary, is_emergency_contact = public.j_bool(p_payload, 'isEmergency', false) where student_id = v_student and guardian_id = v_gid;
  end if;
  if v_primary then update public.student_guardians set is_primary = false where student_id = v_student and guardian_id <> v_gid; update public.student_guardians set is_primary = true where student_id = v_student and guardian_id = v_gid; end if;
  perform public.audit(p_school_id, 'save_guardian', 'student', v_student, jsonb_build_object('guardian', v_gid));
  return jsonb_build_object('id', v_gid);
end $$;

create or replace function public.api_guardian_unlink(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_student uuid := public.j_uuid(p_payload, 'studentId', 'Student', true); v_gid uuid := public.j_uuid(p_payload, 'guardianId', 'Guardian', true);
begin
  perform public.require_permission(p_school_id, 'students.edit');
  if not exists (select 1 from public.students where id = v_student and school_id = p_school_id) then raise exception 'That student was not found.' using errcode = '22023'; end if;
  delete from public.student_guardians where student_id = v_student and guardian_id = v_gid;
  if not found then raise exception 'That guardian is not linked to this student.' using errcode = '22023'; end if;
  delete from public.guardians g where g.id = v_gid and not exists (select 1 from public.student_guardians sg where sg.guardian_id = g.id);
  perform public.audit(p_school_id, 'unlink_guardian', 'student', v_student, jsonb_build_object('guardian', v_gid));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.api_student_enroll(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_student uuid := public.j_uuid(p_payload, 'studentId', 'Student', true); v_class uuid := public.j_uuid(p_payload, 'classId', 'Class', true); st text;
begin
  perform public.require_permission(p_school_id, 'students.edit');
  select enrollment_status into st from public.students where id = v_student and school_id = p_school_id;
  if st is null then raise exception 'That student was not found.' using errcode = '22023'; end if;
  if st <> 'active' then raise exception 'Only active students can be placed in a class. Change the status first.' using errcode = '22023'; end if;
  perform public.enroll_student(p_school_id, v_student, v_class);
  perform public.audit(p_school_id, 'enroll', 'student', v_student, jsonb_build_object('class', v_class));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.api_student_status(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_student uuid := public.j_uuid(p_payload, 'studentId', 'Student', true); v_new text := public.j_req(p_payload, 'status', 'Status', 20); v_note text := public.j_text(p_payload, 'note', 'Note', 300); v_last uuid;
begin
  perform public.require_permission(p_school_id, 'students.edit');
  if v_new not in ('active', 'transferred', 'withdrawn', 'graduated', 'inactive') then raise exception 'Status is not valid.' using errcode = '22023'; end if;
  update public.students set enrollment_status = v_new where id = v_student and school_id = p_school_id;
  if not found then raise exception 'That student was not found.' using errcode = '22023'; end if;
  if v_new in ('transferred', 'withdrawn', 'graduated') then
    update public.student_enrollments set status = v_new where student_id = v_student and status = 'active';
  elsif v_new = 'active' then
    select e.id into v_last from public.student_enrollments e join public.academic_years y on y.id = e.academic_year_id where e.student_id = v_student order by y.starts_on desc limit 1;
    if v_last is not null then update public.student_enrollments set status = 'active' where id = v_last and status in ('transferred', 'withdrawn'); end if;
  end if;
  perform public.audit(p_school_id, 'status', 'student', v_student, jsonb_build_object('status', v_new, 'note', v_note));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.api_students_promote(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_from uuid := public.j_uuid(p_payload, 'fromClassId', 'Current class', true); v_to uuid := public.j_uuid(p_payload, 'toClassId', 'New class', true); v_mode text := coalesce(public.j_text(p_payload, 'mode', 'Mode', 10), 'promote'); v_ids uuid[]; n int := 0; sid uuid; cf record; ct record;
begin
  perform public.require_permission(p_school_id, 'students.edit');
  if v_mode not in ('promote', 'repeat') then raise exception 'Mode must be promote or repeat.' using errcode = '22023'; end if;
  select * into cf from public.classes where id = v_from and school_id = p_school_id; if not found then raise exception 'The current class was not found.' using errcode = '22023'; end if;
  select * into ct from public.classes where id = v_to and school_id = p_school_id; if not found then raise exception 'The new class was not found.' using errcode = '22023'; end if;
  if ct.academic_year_id is not distinct from cf.academic_year_id then raise exception 'Choose a class in a different (later) academic year.' using errcode = '22023'; end if;
  if jsonb_typeof(p_payload -> 'studentIds') is distinct from 'array' or jsonb_array_length(p_payload -> 'studentIds') = 0 then raise exception 'Choose at least one student.' using errcode = '22023'; end if;
  if jsonb_array_length(p_payload -> 'studentIds') > 500 then raise exception 'At most 500 students at a time.' using errcode = '22023'; end if;
  select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(p_payload -> 'studentIds') x;
  for sid in select e.student_id from public.student_enrollments e join public.students s on s.id = e.student_id where e.class_id = v_from and e.status = 'active' and s.school_id = p_school_id and s.enrollment_status = 'active' and e.student_id = any (v_ids) loop
    update public.student_enrollments set status = case when v_mode = 'repeat' then 'repeated' else 'promoted' end where student_id = sid and class_id = v_from and status = 'active';
    perform public.enroll_student(p_school_id, sid, v_to);
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'None of the chosen students are active in the current class.' using errcode = '22023'; end if;
  perform public.audit(p_school_id, v_mode, 'class', v_from, jsonb_build_object('to', v_to, 'count', n));
  return jsonb_build_object('count', n);
end $$;

---------------------------------------------------------------------------------------------------
-- 12. Admissions
---------------------------------------------------------------------------------------------------
create or replace function public.api_applications_list(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_status text := public.j_text(p_payload, 'status', 'Status', 20); v_search text := public.j_text(p_payload, 'search', 'Search', 80); v_page int := coalesce(public.j_int(p_payload, 'page', 'Page', 1, 100000), 1); v_size int := coalesce(public.j_int(p_payload, 'pageSize', 'Page size', 1, 100), 25); v_pat text; v_rows jsonb; v_total bigint;
begin
  perform public.require_permission(p_school_id, 'admissions.view');
  if v_status is not null and v_status not in ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'enrolled', 'waitlisted') then raise exception 'Status is not valid.' using errcode = '22023'; end if;
  if v_search is not null then v_pat := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%'; end if;
  select coalesce(jsonb_agg(r.item order by r.rn), '[]'::jsonb), coalesce(max(r.total), 0) into v_rows, v_total from (
    select jsonb_build_object('id', a.id, 'applicationNumber', a.application_number, 'name', concat_ws(' ', a.first_name, a.middle_name, a.last_name), 'status', a.status, 'desiredClass', c.name, 'guardian', concat_ws(' ', a.guardian_first_name, a.guardian_last_name), 'guardianPhone', a.guardian_phone, 'submittedAt', a.submitted_at, 'createdAt', a.created_at, 'studentId', a.student_id) as item,
      row_number() over (order by a.created_at desc, a.id) as rn, count(*) over () as total
    from public.admission_applications a left join public.classes c on c.id = a.desired_class_id
    where a.school_id = p_school_id and (v_status is null or a.status::text = v_status)
      and (v_pat is null or concat_ws(' ', a.first_name, a.middle_name, a.last_name) ilike v_pat escape '\' or a.application_number ilike v_pat escape '\' or concat_ws(' ', a.guardian_first_name, a.guardian_last_name) ilike v_pat escape '\')
    order by a.created_at desc, a.id offset (v_page - 1) * v_size limit v_size
  ) r;
  return jsonb_build_object('rows', v_rows, 'total', v_total, 'page', v_page, 'pageSize', v_size,
    'counts', coalesce((select jsonb_object_agg(status::text, n) from (select status, count(*) n from public.admission_applications where school_id = p_school_id group by status) q), '{}'::jsonb));
end $$;

create or replace function public.api_application_get(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Application', true); a record;
begin
  perform public.require_permission(p_school_id, 'admissions.view');
  select a.*, c.name as class_name into a from public.admission_applications a left join public.classes c on c.id = a.desired_class_id where a.id = v_id and a.school_id = p_school_id;
  if not found then raise exception 'That application was not found.' using errcode = '22023'; end if;
  return jsonb_build_object('id', a.id, 'applicationNumber', a.application_number, 'status', a.status, 'firstName', a.first_name, 'middleName', a.middle_name, 'lastName', a.last_name, 'gender', a.gender, 'dateOfBirth', a.date_of_birth,
    'nationality', a.nationality, 'address', a.address, 'previousSchool', a.previous_school, 'previousClass', a.previous_class, 'desiredAcademicYearId', a.desired_academic_year_id, 'desiredClassId', a.desired_class_id, 'desiredClass', a.class_name,
    'guardianFirstName', a.guardian_first_name, 'guardianLastName', a.guardian_last_name, 'guardianRelationship', a.guardian_relationship, 'guardianPhone', a.guardian_phone, 'guardianEmail', a.guardian_email,
    'notes', a.notes, 'decisionNote', a.decision_note, 'submittedAt', a.submitted_at, 'reviewedAt', a.reviewed_at, 'studentId', a.student_id, 'createdAt', a.created_at);
end $$;

create or replace function public.check_application_complete(a public.admission_applications)
returns void language plpgsql immutable set search_path = public as $$
begin
  if a.date_of_birth is null then raise exception 'Date of birth is required before submitting.' using errcode = '22023'; end if;
  if a.desired_class_id is null then raise exception 'Choose the class applied for before submitting.' using errcode = '22023'; end if;
  if a.guardian_first_name is null or a.guardian_last_name is null or a.guardian_phone is null then raise exception 'The guardian name and phone are required before submitting.' using errcode = '22023'; end if;
end $$;

create or replace function public.api_application_save(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Application'); v_class uuid := public.j_uuid(p_payload, 'desiredClassId', 'Class applied for'); v_year uuid; v_dob date := public.j_date(p_payload, 'dateOfBirth', 'Date of birth'); v_gender text := public.j_text(p_payload, 'gender', 'Gender', 20);
  v_submit boolean := public.j_bool(p_payload, 'submit', false); cur record; rec public.admission_applications; v_num text; v_prefix text;
begin
  perform public.require_permission(p_school_id, case when v_id is null then 'admissions.create' else 'admissions.edit' end);
  if v_gender is not null and v_gender not in ('male', 'female', 'other', 'undisclosed') then raise exception 'Gender is not valid.' using errcode = '22023'; end if;
  if v_dob is not null and (v_dob > public.school_today(p_school_id) or v_dob < date '1950-01-01') then raise exception 'Date of birth is not realistic.' using errcode = '22023'; end if;
  if v_class is not null then
    select academic_year_id into v_year from public.classes where id = v_class and school_id = p_school_id;
    if not found then raise exception 'That class was not found.' using errcode = '22023'; end if;
  end if;
  if v_id is null then
    select coalesce(admission_number_prefix, 'ADM') into v_prefix from public.school_settings where school_id = p_school_id;
    v_num := 'APP-' || lpad(public.next_number(p_school_id, 'application')::text, 5, '0');
    insert into public.admission_applications(school_id, application_number, first_name, middle_name, last_name, gender, date_of_birth, nationality, address, previous_school, previous_class, desired_academic_year_id, desired_class_id,
      guardian_first_name, guardian_last_name, guardian_relationship, guardian_phone, guardian_email, notes, status, created_by)
    values (p_school_id, v_num, public.j_req(p_payload, 'firstName', 'First name', 80), public.j_text(p_payload, 'middleName', 'Middle name', 80), public.j_req(p_payload, 'lastName', 'Last name', 80), v_gender, v_dob, public.j_text(p_payload, 'nationality', 'Nationality', 60), public.j_text(p_payload, 'address', 'Address', 200), public.j_text(p_payload, 'previousSchool', 'Previous school', 120), public.j_text(p_payload, 'previousClass', 'Previous class', 60), v_year, v_class,
      public.j_text(p_payload, 'guardianFirstName', 'Guardian first name', 80), public.j_text(p_payload, 'guardianLastName', 'Guardian last name', 80), public.j_text(p_payload, 'guardianRelationship', 'Relationship', 40), public.j_phone(p_payload, 'guardianPhone', 'Guardian phone'), public.j_email(p_payload, 'guardianEmail', 'Guardian email'), public.j_text(p_payload, 'notes', 'Notes', 500), 'draft', auth.uid())
    returning * into rec;
  else
    select * into cur from public.admission_applications where id = v_id and school_id = p_school_id;
    if not found then raise exception 'That application was not found.' using errcode = '22023'; end if;
    if cur.status::text not in ('draft', 'submitted', 'under_review', 'waitlisted') then raise exception 'An application that is % cannot be edited.', replace(cur.status::text, '_', ' ') using errcode = '22023'; end if;
    update public.admission_applications set first_name = public.j_req(p_payload, 'firstName', 'First name', 80), middle_name = public.j_text(p_payload, 'middleName', 'Middle name', 80), last_name = public.j_req(p_payload, 'lastName', 'Last name', 80), gender = v_gender, date_of_birth = v_dob,
      nationality = public.j_text(p_payload, 'nationality', 'Nationality', 60), address = public.j_text(p_payload, 'address', 'Address', 200), previous_school = public.j_text(p_payload, 'previousSchool', 'Previous school', 120), previous_class = public.j_text(p_payload, 'previousClass', 'Previous class', 60),
      desired_academic_year_id = v_year, desired_class_id = v_class, guardian_first_name = public.j_text(p_payload, 'guardianFirstName', 'Guardian first name', 80), guardian_last_name = public.j_text(p_payload, 'guardianLastName', 'Guardian last name', 80),
      guardian_relationship = public.j_text(p_payload, 'guardianRelationship', 'Relationship', 40), guardian_phone = public.j_phone(p_payload, 'guardianPhone', 'Guardian phone'), guardian_email = public.j_email(p_payload, 'guardianEmail', 'Guardian email'), notes = public.j_text(p_payload, 'notes', 'Notes', 500)
    where id = v_id returning * into rec;
  end if;
  if v_submit and rec.status = 'draft' then
    perform public.check_application_complete(rec);
    update public.admission_applications set status = 'submitted', submitted_at = now() where id = rec.id;
  end if;
  perform public.audit(p_school_id, 'save', 'application', rec.id, jsonb_build_object('number', rec.application_number, 'submitted', v_submit));
  return jsonb_build_object('id', rec.id, 'applicationNumber', rec.application_number);
end $$;

create or replace function public.api_application_action(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Application', true); v_act text := public.j_req(p_payload, 'action', 'Action', 20); v_note text := public.j_text(p_payload, 'note', 'Note', 300); v_dup boolean := public.j_bool(p_payload, 'allowDuplicate', false);
  a public.admission_applications; st text; v_student uuid; v_num text; v_adm text; v_prefix text; d record; v_gid uuid;
begin
  if v_act not in ('submit', 'review', 'waitlist', 'approve', 'reject', 'enroll') then raise exception 'Action is not valid.' using errcode = '22023'; end if;
  perform public.require_permission(p_school_id, case when v_act = 'submit' then 'admissions.edit' else 'admissions.approve' end);
  select * into a from public.admission_applications where id = v_id and school_id = p_school_id for update;
  if not found then raise exception 'That application was not found.' using errcode = '22023'; end if;
  st := a.status::text;
  if v_act = 'submit' then
    if st <> 'draft' then raise exception 'Only a draft can be submitted.' using errcode = '22023'; end if;
    perform public.check_application_complete(a);
    update public.admission_applications set status = 'submitted', submitted_at = now() where id = v_id;
  elsif v_act = 'review' then
    if st <> 'submitted' then raise exception 'Only a submitted application can be put under review.' using errcode = '22023'; end if;
    update public.admission_applications set status = 'under_review', reviewed_at = now(), reviewed_by = auth.uid() where id = v_id;
  elsif v_act = 'waitlist' then
    if st not in ('submitted', 'under_review') then raise exception 'Only a submitted or reviewed application can be waitlisted.' using errcode = '22023'; end if;
    update public.admission_applications set status = 'waitlisted', reviewed_at = now(), reviewed_by = auth.uid(), decision_note = v_note where id = v_id;
  elsif v_act = 'approve' then
    if st not in ('submitted', 'under_review', 'waitlisted') then raise exception 'This application cannot be approved from its current status (%).', replace(st, '_', ' ') using errcode = '22023'; end if;
    perform public.check_application_complete(a);
    update public.admission_applications set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid(), decision_note = v_note where id = v_id;
  elsif v_act = 'reject' then
    if st not in ('submitted', 'under_review', 'waitlisted', 'approved') then raise exception 'This application cannot be rejected from its current status (%).', replace(st, '_', ' ') using errcode = '22023'; end if;
    if v_note is null then raise exception 'Write the reason for rejecting the application.' using errcode = '22023'; end if;
    update public.admission_applications set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid(), decision_note = v_note where id = v_id;
  else
    perform public.require_permission(p_school_id, 'students.create');
    if st <> 'approved' then raise exception 'Only an approved application can be enrolled.' using errcode = '22023'; end if;
    if a.desired_class_id is null then raise exception 'The application has no class. Edit it first.' using errcode = '22023'; end if;
    if not v_dup and a.date_of_birth is not null then
      select student_number into d from public.students where school_id = p_school_id and lower(first_name) = lower(a.first_name) and lower(last_name) = lower(a.last_name) and date_of_birth = a.date_of_birth limit 1;
      if found then raise exception 'A student with the same name and date of birth already exists (%). Confirm to enrol anyway.', d.student_number using errcode = '22023'; end if;
    end if;
    select coalesce(student_id_prefix, 'STU'), coalesce(admission_number_prefix, 'ADM') into v_prefix, v_adm from public.school_settings where school_id = p_school_id;
    v_num := coalesce(v_prefix, 'STU') || '-' || lpad(public.next_number(p_school_id, 'student')::text, 5, '0');
    insert into public.students(school_id, student_number, admission_number, first_name, middle_name, last_name, gender, date_of_birth, nationality, address)
    values (p_school_id, v_num, coalesce(v_adm, 'ADM') || '-' || lpad(public.next_number(p_school_id, 'admission')::text, 5, '0'), a.first_name, a.middle_name, a.last_name, a.gender, a.date_of_birth, a.nationality, a.address) returning id into v_student;
    if a.guardian_first_name is not null and a.guardian_last_name is not null then
      v_gid := public.add_guardian(p_school_id, v_student, jsonb_build_object('firstName', a.guardian_first_name, 'lastName', a.guardian_last_name, 'relationship', coalesce(a.guardian_relationship, 'Guardian'), 'phone', a.guardian_phone, 'email', a.guardian_email, 'isPrimary', true, 'isEmergency', true));
    end if;
    perform public.enroll_student(p_school_id, v_student, a.desired_class_id);
    update public.admission_applications set status = 'enrolled', student_id = v_student, reviewed_at = coalesce(reviewed_at, now()) where id = v_id;
    perform public.audit(p_school_id, 'enroll', 'application', v_id, jsonb_build_object('student', v_student));
    return jsonb_build_object('studentId', v_student, 'studentNumber', v_num);
  end if;
  perform public.audit(p_school_id, v_act, 'application', v_id, jsonb_build_object('note', v_note));
  return jsonb_build_object('ok', true);
end $$;

---------------------------------------------------------------------------------------------------
-- 13. Attendance
---------------------------------------------------------------------------------------------------
create or replace function public.can_mark_class(p_school uuid, p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_permission(p_school, 'attendance.approve') or exists (
    select 1 from public.teacher_assignments ta join public.employees e on e.id = ta.employee_id
    where ta.class_id = p_class and ta.school_id = p_school and e.profile_id = auth.uid() and e.is_active
  );
$$;

create or replace function public.api_attendance_sheet(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_class uuid := public.j_uuid(p_payload, 'classId', 'Class', true); v_date date; c record; v_today date := public.school_today(p_school_id); v_days smallint[];
begin
  perform public.require_permission(p_school_id, 'attendance.view');
  v_date := coalesce(public.j_date(p_payload, 'date', 'Date'), v_today);
  select * into c from public.classes where id = v_class and school_id = p_school_id;
  if not found then raise exception 'That class was not found.' using errcode = '22023'; end if;
  select working_days into v_days from public.school_settings where school_id = p_school_id;
  return jsonb_build_object('class', jsonb_build_object('id', c.id, 'name', c.name), 'date', v_date, 'today', v_today,
    'isSchoolDay', extract(isodow from v_date)::smallint = any (v_days),
    'canMark', public.has_permission(p_school_id, 'attendance.create') and public.can_mark_class(p_school_id, v_class) and v_date <= v_today and (v_date = v_today or public.has_permission(p_school_id, 'attendance.edit')),
    'students', coalesce((select jsonb_agg(jsonb_build_object('studentId', s.id, 'studentNumber', s.student_number, 'name', concat_ws(' ', s.first_name, s.middle_name, s.last_name), 'status', ar.status, 'note', ar.note) order by s.last_name, s.first_name)
      from public.student_enrollments e join public.students s on s.id = e.student_id and s.enrollment_status = 'active'
      left join public.attendance_records ar on ar.student_id = s.id and ar.attendance_date = v_date and ar.school_id = p_school_id
      where e.class_id = v_class and e.status = 'active' and e.school_id = p_school_id), '[]'::jsonb));
end $$;

create or replace function public.api_attendance_save(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_class uuid := public.j_uuid(p_payload, 'classId', 'Class', true); v_date date := public.j_date(p_payload, 'date', 'Date', true); v_today date := public.school_today(p_school_id); v_days smallint[]; e jsonb; v_sid uuid; v_status text; n int := 0; v_ids uuid[] := '{}';
begin
  perform public.require_permission(p_school_id, 'attendance.create');
  if not exists (select 1 from public.classes where id = v_class and school_id = p_school_id) then raise exception 'That class was not found.' using errcode = '22023'; end if;
  if not public.can_mark_class(p_school_id, v_class) then raise exception 'You can only take attendance for classes you teach.' using errcode = '42501'; end if;
  if v_date > v_today then raise exception 'Attendance cannot be taken for a future date.' using errcode = '22023'; end if;
  if v_date <> v_today then perform public.require_permission(p_school_id, 'attendance.edit'); end if;
  select working_days into v_days from public.school_settings where school_id = p_school_id;
  if not (extract(isodow from v_date)::smallint = any (v_days)) then raise exception 'That date is not a school day.' using errcode = '22023'; end if;
  if jsonb_typeof(p_payload -> 'entries') is distinct from 'array' or jsonb_array_length(p_payload -> 'entries') = 0 then raise exception 'There is no attendance to save.' using errcode = '22023'; end if;
  if jsonb_array_length(p_payload -> 'entries') > 500 then raise exception 'At most 500 students at a time.' using errcode = '22023'; end if;
  for e in select value from jsonb_array_elements(p_payload -> 'entries') loop
    v_sid := public.j_uuid(e, 'studentId', 'Student', true); v_status := public.j_req(e, 'status', 'Status', 10);
    if v_status not in ('present', 'absent', 'late', 'excused') then raise exception 'Status must be present, absent, late or excused.' using errcode = '22023'; end if;
    if v_sid = any (v_ids) then raise exception 'A student appears twice in the list.' using errcode = '22023'; end if;
    v_ids := v_ids || v_sid;
    if not exists (select 1 from public.student_enrollments en join public.students s on s.id = en.student_id where en.student_id = v_sid and en.class_id = v_class and en.status = 'active' and s.school_id = p_school_id and s.enrollment_status = 'active') then
      raise exception 'One of the students is not active in this class.' using errcode = '22023';
    end if;
    insert into public.attendance_records(school_id, student_id, class_id, attendance_date, status, note, marked_by, marked_at)
    values (p_school_id, v_sid, v_class, v_date, v_status::public.attendance_status, public.j_text(e, 'note', 'Note', 200), auth.uid(), now())
    on conflict (school_id, student_id, attendance_date) do update set status = excluded.status, note = excluded.note, class_id = excluded.class_id, marked_by = excluded.marked_by, marked_at = now();
    n := n + 1;
  end loop;
  perform public.audit(p_school_id, 'save', 'attendance', v_class, jsonb_build_object('date', v_date, 'count', n));
  return jsonb_build_object('saved', n);
end $$;

create or replace function public.api_attendance_summary(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_date date; v_today date := public.school_today(p_school_id); v_year uuid;
begin
  perform public.require_permission(p_school_id, 'attendance.view');
  v_date := coalesce(public.j_date(p_payload, 'date', 'Date'), v_today);
  select id into v_year from public.academic_years where school_id = p_school_id and is_current;
  return jsonb_build_object('date', v_date,
    'classes', coalesce((select jsonb_agg(jsonb_build_object('classId', c.id, 'name', c.name,
        'enrolled', (select count(*) from public.student_enrollments e join public.students s on s.id = e.student_id where e.class_id = c.id and e.status = 'active' and s.enrollment_status = 'active'),
        'present', (select count(*) from public.attendance_records a where a.class_id = c.id and a.attendance_date = v_date and a.status = 'present'),
        'absent', (select count(*) from public.attendance_records a where a.class_id = c.id and a.attendance_date = v_date and a.status = 'absent'),
        'late', (select count(*) from public.attendance_records a where a.class_id = c.id and a.attendance_date = v_date and a.status = 'late'),
        'excused', (select count(*) from public.attendance_records a where a.class_id = c.id and a.attendance_date = v_date and a.status = 'excused')) order by c.level_order, c.name)
      from public.classes c where c.school_id = p_school_id and c.academic_year_id = v_year), '[]'::jsonb),
    'absentees', coalesce((select jsonb_agg(jsonb_build_object('studentId', s.id, 'name', concat_ws(' ', s.first_name, s.last_name), 'className', c.name, 'status', a.status, 'note', a.note) order by c.name, s.last_name) from (select * from public.attendance_records where school_id = p_school_id and attendance_date = v_date and status in ('absent', 'late') limit 100) a join public.students s on s.id = a.student_id left join public.classes c on c.id = a.class_id), '[]'::jsonb),
    'trend', coalesce((select jsonb_agg(jsonb_build_object('date', t.d, 'rate', t.rate) order by t.d) from (
        select g::date as d, (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where status in ('present', 'late')) / count(*), 1) end from public.attendance_records a where a.school_id = p_school_id and a.attendance_date = g::date) as rate
        from generate_series(v_date - 13, v_date, interval '1 day') g) t), '[]'::jsonb));
end $$;

---------------------------------------------------------------------------------------------------
-- 14. Timetable
---------------------------------------------------------------------------------------------------
create or replace function public.api_timetable_setup(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_permission(p_school_id, 'timetable.view');
  return jsonb_build_object(
    'periods', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'sortOrder', p.sort_order, 'startTime', to_char(p.start_time, 'HH24:MI'), 'endTime', to_char(p.end_time, 'HH24:MI'), 'isBreak', p.is_break) order by p.sort_order) from public.timetable_periods p where p.school_id = p_school_id), '[]'::jsonb),
    'classrooms', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'capacity', r.capacity) order by r.name) from public.classrooms r where r.school_id = p_school_id), '[]'::jsonb),
    'workingDays', (select to_jsonb(working_days) from public.school_settings where school_id = p_school_id));
end $$;

create or replace function public.api_period_save(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Period'); v_name text := public.j_req(p_payload, 'name', 'Period name', 40); v_order int := public.j_int(p_payload, 'sortOrder', 'Order', 1, 50, true);
  v_s text := public.j_req(p_payload, 'startTime', 'Start time', 5); v_e text := public.j_req(p_payload, 'endTime', 'End time', 5); v_break boolean := public.j_bool(p_payload, 'isBreak', false); v_from time; v_to time; o record;
begin
  perform public.require_permission(p_school_id, case when v_id is null then 'timetable.create' else 'timetable.edit' end);
  if v_s !~ '^([01]\d|2[0-3]):[0-5]\d$' or v_e !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Times must look like 08:30.' using errcode = '22023'; end if;
  v_from := v_s::time; v_to := v_e::time;
  if v_to <= v_from then raise exception 'The end time must be after the start time.' using errcode = '22023'; end if;
  select name into o from public.timetable_periods where school_id = p_school_id and id is distinct from v_id and start_time < v_to and end_time > v_from limit 1;
  if found then raise exception 'This time overlaps the period "%".', o.name using errcode = '22023'; end if;
  begin
    if v_id is null then insert into public.timetable_periods(school_id, name, sort_order, start_time, end_time, is_break) values (p_school_id, v_name, v_order, v_from, v_to, v_break) returning id into v_id;
    else
      if v_break and exists (select 1 from public.timetable_entries where period_id = v_id) then raise exception 'Lessons are scheduled in this period, so it cannot become a break.' using errcode = '22023'; end if;
      update public.timetable_periods set name = v_name, sort_order = v_order, start_time = v_from, end_time = v_to, is_break = v_break where id = v_id and school_id = p_school_id;
      if not found then raise exception 'That period was not found.' using errcode = '22023'; end if;
    end if;
  exception when unique_violation then raise exception 'Another period already has order number %.', v_order using errcode = '22023';
  end;
  perform public.audit(p_school_id, 'save', 'period', v_id, jsonb_build_object('name', v_name));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.api_period_delete(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Period', true);
begin
  perform public.require_permission(p_school_id, 'timetable.delete');
  if exists (select 1 from public.timetable_entries where period_id = v_id) then raise exception 'Lessons are scheduled in this period. Remove them first.' using errcode = '22023'; end if;
  delete from public.timetable_periods where id = v_id and school_id = p_school_id;
  if not found then raise exception 'That period was not found.' using errcode = '22023'; end if;
  perform public.audit(p_school_id, 'delete', 'period', v_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.api_classroom_save(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Classroom'); v_name text := public.j_req(p_payload, 'name', 'Classroom name', 60); v_cap int := public.j_int(p_payload, 'capacity', 'Capacity', 1, 1000);
begin
  perform public.require_permission(p_school_id, case when v_id is null then 'timetable.create' else 'timetable.edit' end);
  begin
    if v_id is null then insert into public.classrooms(school_id, name, capacity) values (p_school_id, v_name, v_cap) returning id into v_id;
    else update public.classrooms set name = v_name, capacity = v_cap where id = v_id and school_id = p_school_id; if not found then raise exception 'That classroom was not found.' using errcode = '22023'; end if; end if;
  exception when unique_violation then raise exception 'A classroom with this name already exists.' using errcode = '22023';
  end;
  perform public.audit(p_school_id, 'save', 'classroom', v_id, jsonb_build_object('name', v_name));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.api_classroom_delete(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Classroom', true);
begin
  perform public.require_permission(p_school_id, 'timetable.delete');
  if exists (select 1 from public.timetable_entries where classroom_id = v_id) then raise exception 'This classroom is used in the timetable. Change those lessons first.' using errcode = '22023'; end if;
  delete from public.classrooms where id = v_id and school_id = p_school_id;
  if not found then raise exception 'That classroom was not found.' using errcode = '22023'; end if;
  perform public.audit(p_school_id, 'delete', 'classroom', v_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.api_timetable_get(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_class uuid := public.j_uuid(p_payload, 'classId', 'Class'); v_emp uuid := public.j_uuid(p_payload, 'employeeId', 'Teacher'); v_year uuid;
begin
  perform public.require_permission(p_school_id, 'timetable.view');
  if v_class is null and v_emp is null then raise exception 'Choose a class or a teacher.' using errcode = '22023'; end if;
  if v_class is not null then
    select academic_year_id into v_year from public.classes where id = v_class and school_id = p_school_id;
    if not found then raise exception 'That class was not found.' using errcode = '22023'; end if;
  else select id into v_year from public.academic_years where school_id = p_school_id and is_current; end if;
  return jsonb_build_object('yearId', v_year, 'entries', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'classId', t.class_id, 'className', c.name, 'dayOfWeek', t.day_of_week, 'periodId', t.period_id, 'subjectId', t.subject_id, 'subject', s.name,
      'employeeId', t.employee_id, 'teacher', e.first_name || ' ' || e.last_name, 'classroomId', t.classroom_id, 'classroom', r.name))
    from public.timetable_entries t join public.classes c on c.id = t.class_id join public.subjects s on s.id = t.subject_id left join public.employees e on e.id = t.employee_id left join public.classrooms r on r.id = t.classroom_id
    where t.school_id = p_school_id and t.academic_year_id = v_year and (v_class is null or t.class_id = v_class) and (v_emp is null or t.employee_id = v_emp)), '[]'::jsonb));
end $$;

create or replace function public.api_timetable_entry_save(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Lesson'); v_class uuid := public.j_uuid(p_payload, 'classId', 'Class', true); v_day int := public.j_int(p_payload, 'dayOfWeek', 'Day', 1, 7, true); v_period uuid := public.j_uuid(p_payload, 'periodId', 'Period', true);
  v_sub uuid := public.j_uuid(p_payload, 'subjectId', 'Subject', true); v_emp uuid := public.j_uuid(p_payload, 'employeeId', 'Teacher'); v_room uuid := public.j_uuid(p_payload, 'classroomId', 'Classroom'); c record; p record; v_days smallint[]; x record;
begin
  perform public.require_permission(p_school_id, case when v_id is null then 'timetable.create' else 'timetable.edit' end);
  select * into c from public.classes where id = v_class and school_id = p_school_id; if not found then raise exception 'That class was not found.' using errcode = '22023'; end if;
  select * into p from public.timetable_periods where id = v_period and school_id = p_school_id; if not found then raise exception 'That period was not found.' using errcode = '22023'; end if;
  if p.is_break then raise exception 'No lesson can be placed in a break.' using errcode = '22023'; end if;
  select working_days into v_days from public.school_settings where school_id = p_school_id;
  if not (v_day::smallint = any (v_days)) then raise exception 'That day is not a school day.' using errcode = '22023'; end if;
  if not exists (select 1 from public.class_subjects where class_id = v_class and subject_id = v_sub) then raise exception 'That subject is not taught in this class. Add it to the class first (Academics).' using errcode = '22023'; end if;
  if v_emp is not null and not exists (select 1 from public.employees where id = v_emp and school_id = p_school_id and is_active and employment_type = 'teacher') then raise exception 'Choose an active teacher.' using errcode = '22023'; end if;
  if v_room is not null and not exists (select 1 from public.classrooms where id = v_room and school_id = p_school_id) then raise exception 'That classroom was not found.' using errcode = '22023'; end if;
  if v_id is not null and not exists (select 1 from public.timetable_entries where id = v_id and school_id = p_school_id and class_id = v_class) then raise exception 'That lesson was not found.' using errcode = '22023'; end if;
  if exists (select 1 from public.timetable_entries where class_id = v_class and day_of_week = v_day and period_id = v_period and id is distinct from v_id) then raise exception 'This class already has a lesson in that period.' using errcode = '22023'; end if;
  if v_emp is not null then
    select cc.name as class_name, ss.name as subject_name into x from public.timetable_entries t join public.classes cc on cc.id = t.class_id join public.subjects ss on ss.id = t.subject_id where t.academic_year_id = c.academic_year_id and t.employee_id = v_emp and t.day_of_week = v_day and t.period_id = v_period and t.id is distinct from v_id limit 1;
    if found then raise exception 'Clash: this teacher already teaches % in class % at that time.', x.subject_name, x.class_name using errcode = '22023'; end if;
  end if;
  if v_room is not null then
    select cc.name as class_name, ss.name as subject_name into x from public.timetable_entries t join public.classes cc on cc.id = t.class_id join public.subjects ss on ss.id = t.subject_id where t.academic_year_id = c.academic_year_id and t.classroom_id = v_room and t.day_of_week = v_day and t.period_id = v_period and t.id is distinct from v_id limit 1;
    if found then raise exception 'Clash: this classroom is already used by class % (%) at that time.', x.class_name, x.subject_name using errcode = '22023'; end if;
  end if;
  begin
    if v_id is null then insert into public.timetable_entries(school_id, academic_year_id, class_id, day_of_week, period_id, subject_id, employee_id, classroom_id) values (p_school_id, c.academic_year_id, v_class, v_day, v_period, v_sub, v_emp, v_room) returning id into v_id;
    else update public.timetable_entries set day_of_week = v_day, period_id = v_period, subject_id = v_sub, employee_id = v_emp, classroom_id = v_room where id = v_id; end if;
  exception when unique_violation then raise exception 'That time is already taken (teacher, classroom or class). Reload and try again.' using errcode = '22023';
  end;
  perform public.audit(p_school_id, 'save', 'timetable', v_id, jsonb_build_object('class', v_class, 'day', v_day));
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.api_timetable_entry_delete(p_school_id uuid, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.j_uuid(p_payload, 'id', 'Lesson', true);
begin
  perform public.require_permission(p_school_id, 'timetable.delete');
  delete from public.timetable_entries where id = v_id and school_id = p_school_id;
  if not found then raise exception 'That lesson was not found.' using errcode = '22023'; end if;
  perform public.audit(p_school_id, 'delete', 'timetable', v_id);
  return jsonb_build_object('ok', true);
end $$;

---------------------------------------------------------------------------------------------------
-- 15. Who may call what
---------------------------------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'api\_%' or p.proname in ('claim_invitations', 'has_permission', 'storage_school', 'my_schools', 'get_dashboard_overview', 'create_school_with_owner')) loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('next_number', 'audit', 'school_today', 'require_permission', 'seed_default_roles', 'enroll_student', 'add_guardian', 'check_application_complete', 'can_mark_class', 'j_text', 'j_req', 'j_uuid', 'j_date', 'j_int', 'j_bool', 'j_email', 'j_phone') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;
