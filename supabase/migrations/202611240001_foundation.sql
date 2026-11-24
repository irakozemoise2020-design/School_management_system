-- EduNexus Phase 1 foundation
-- Apply with: supabase db push (or paste into the Supabase SQL editor).
-- This migration deliberately contains no service-role secret and all staff-facing
-- data access is constrained by school membership and row-level security.

create extension if not exists pgcrypto;

create type public.application_status as enum ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'enrolled');
create type public.attendance_status as enum ('present', 'absent', 'late', 'excused');
create type public.payment_status as enum ('pending', 'confirmed', 'reversed', 'refunded');
create type public.invoice_status as enum ('draft', 'issued', 'part_paid', 'paid', 'void', 'overdue');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 2),
  code text not null check (code ~ '^[A-Z0-9-]{2,16}$'),
  logo_path text,
  country text not null default 'Rwanda',
  timezone text not null default 'Africa/Kigali',
  currency_code char(3) not null default 'RWF',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  code text,
  address text,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_path text,
  locale text not null default 'en' check (locale in ('en', 'rw', 'fr')),
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z_]{3,64}$'),
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, key)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z_\.]{3,120}$'),
  module text not null,
  action text not null check (action in ('view', 'create', 'edit', 'delete', 'approve', 'export', 'print')),
  description text
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table public.user_school_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  campus_id uuid references public.campuses(id) on delete set null,
  role_id uuid not null references public.roles(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, school_id, role_id)
);

create table public.school_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  admission_number_prefix text,
  student_id_prefix text,
  default_language text not null default 'en' check (default_language in ('en', 'rw', 'fr')),
  allow_parent_self_registration boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null check (ends_on > starts_on),
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);
create unique index academic_year_one_current_per_school on public.academic_years(school_id) where is_current;

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null check (ends_on > starts_on),
  created_at timestamptz not null default now(),
  unique (academic_year_id, name)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  code text,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  campus_id uuid references public.campuses(id) on delete set null,
  academic_year_id uuid references public.academic_years(id) on delete set null,
  name text not null,
  level_order integer not null default 0,
  capacity integer check (capacity > 0),
  created_at timestamptz not null default now(),
  unique (school_id, academic_year_id, name)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  name text not null,
  code text,
  created_at timestamptz not null default now(),
  unique (school_id, name)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  campus_id uuid references public.campuses(id) on delete set null,
  student_number text not null,
  admission_number text,
  first_name text not null,
  middle_name text,
  last_name text not null,
  gender text check (gender in ('male', 'female', 'other', 'undisclosed')),
  date_of_birth date,
  nationality text,
  email text,
  phone text,
  address text,
  photo_path text,
  enrollment_status text not null default 'active' check (enrollment_status in ('active', 'transferred', 'withdrawn', 'graduated', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, student_number),
  unique (school_id, admission_number)
);

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  relationship text,
  phone text,
  email text,
  occupation text,
  address text,
  portal_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_guardians (
  student_id uuid not null references public.students(id) on delete cascade,
  guardian_id uuid not null references public.guardians(id) on delete cascade,
  relationship text not null,
  is_primary boolean not null default false,
  is_emergency_contact boolean not null default false,
  primary key (student_id, guardian_id)
);

create table public.admission_applications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  campus_id uuid references public.campuses(id) on delete set null,
  application_number text not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  gender text check (gender in ('male', 'female', 'other', 'undisclosed')),
  date_of_birth date,
  desired_academic_year_id uuid references public.academic_years(id) on delete set null,
  desired_class_id uuid references public.classes(id) on delete set null,
  status public.application_status not null default 'draft',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  decision_note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, application_number)
);

create table public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  class_id uuid references public.classes(id) on delete set null,
  enrollment_date date not null default current_date,
  status text not null default 'active' check (status in ('active', 'promoted', 'repeated', 'transferred', 'withdrawn', 'graduated')),
  created_at timestamptz not null default now(),
  unique (student_id, academic_year_id)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  campus_id uuid references public.campuses(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  employee_number text not null,
  first_name text not null,
  last_name text not null,
  employment_type text not null default 'staff',
  department_id uuid references public.departments(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, employee_number)
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  attendance_date date not null,
  status public.attendance_status not null,
  note text,
  marked_by uuid references public.profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (school_id, student_id, attendance_date)
);

create table public.student_invoices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  invoice_number text not null,
  status public.invoice_status not null default 'draft',
  issued_on date,
  due_on date,
  total_amount numeric(14,2) not null check (total_amount >= 0),
  balance_due numeric(14,2) not null check (balance_due >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, invoice_number)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  receipt_number text,
  external_reference text,
  amount numeric(14,2) not null check (amount > 0),
  method text not null default 'cash',
  status public.payment_status not null default 'pending',
  paid_at timestamptz not null default now(),
  received_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, receipt_number),
  unique nulls not distinct (school_id, external_reference)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  reference text,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  expense_date date not null default current_date,
  status text not null default 'posted' check (status in ('draft', 'approved', 'posted', 'void')),
  created_at timestamptz not null default now()
);

create table public.school_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  campus_id uuid references public.campuses(id) on delete set null,
  title text not null,
  category text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  channel text not null default 'in_app',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index campuses_school_id_idx on public.campuses(school_id);
create index user_school_assignments_user_school_idx on public.user_school_assignments(user_id, school_id) where is_active;
create index students_school_name_idx on public.students(school_id, last_name, first_name);
create index guardians_school_portal_user_idx on public.guardians(school_id, portal_user_id);
create index applications_school_status_idx on public.admission_applications(school_id, status, submitted_at desc);
create index enrollments_school_year_idx on public.student_enrollments(school_id, academic_year_id);
create index attendance_school_date_idx on public.attendance_records(school_id, attendance_date);
create index invoices_school_status_idx on public.student_invoices(school_id, status, due_on);
create index payments_school_paid_idx on public.payments(school_id, paid_at desc) where status = 'confirmed';
create index expenses_school_date_idx on public.expenses(school_id, expense_date);
create index events_school_starts_idx on public.school_events(school_id, starts_at);
create index notifications_recipient_idx on public.notifications(recipient_id, created_at desc);
create index audit_logs_school_created_idx on public.audit_logs(school_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
create trigger organizations_set_updated_at before update on public.organizations for each row execute procedure public.set_updated_at();
create trigger schools_set_updated_at before update on public.schools for each row execute procedure public.set_updated_at();
create trigger campuses_set_updated_at before update on public.campuses for each row execute procedure public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger school_settings_set_updated_at before update on public.school_settings for each row execute procedure public.set_updated_at();
create trigger academic_years_set_updated_at before update on public.academic_years for each row execute procedure public.set_updated_at();
create trigger students_set_updated_at before update on public.students for each row execute procedure public.set_updated_at();
create trigger guardians_set_updated_at before update on public.guardians for each row execute procedure public.set_updated_at();
create trigger admission_applications_set_updated_at before update on public.admission_applications for each row execute procedure public.set_updated_at();
create trigger employees_set_updated_at before update on public.employees for each row execute procedure public.set_updated_at();
create trigger invoices_set_updated_at before update on public.student_invoices for each row execute procedure public.set_updated_at();

-- SECURITY DEFINER helpers centralize tenant checks. Do not allow callers to set search_path.
create or replace function public.has_school_access(p_school_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_school_assignments usa
    where usa.user_id = auth.uid() and usa.school_id = p_school_id and usa.is_active
  );
$$;

create or replace function public.my_schools()
returns table (id uuid, name text, code text, logo_path text, currency_code char(3), role_name text, role_key text)
language sql stable security definer set search_path = public as $$
  select distinct on (s.id) s.id, s.name, s.code, s.logo_path, s.currency_code, r.name, r.key
  from public.user_school_assignments usa
  join public.schools s on s.id = usa.school_id and s.is_active
  join public.roles r on r.id = usa.role_id
  where usa.user_id = auth.uid() and usa.is_active
  order by s.id, r.name;
$$;

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
  insert into public.roles(organization_id, key, name, is_system) values(v_org, 'school_owner', 'School Owner', true) returning id into v_role;
  insert into public.roles(organization_id, key, name, is_system) values(v_org, 'school_administrator', 'School Administrator', true);
  insert into public.roles(organization_id, key, name, is_system) values(v_org, 'teacher', 'Teacher', true);
  insert into public.user_roles(user_id, role_id) values(auth.uid(), v_role);
  insert into public.user_school_assignments(user_id, school_id, campus_id, role_id) values(auth.uid(), v_school, v_campus, v_role);
  insert into public.audit_logs(school_id, actor_id, action, entity_type, entity_id, metadata)
  values(v_school, auth.uid(), 'create', 'school', v_school, jsonb_build_object('source', 'onboarding'));
  return v_school;
end;
$$;

create or replace function public.get_dashboard_overview(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_stats jsonb; v_enrollment jsonb; v_finance jsonb; v_admissions jsonb; v_events jsonb; v_payments jsonb; v_notifications jsonb;
begin
  if not public.has_school_access(p_school_id) then raise exception 'You are not assigned to this school' using errcode = '42501'; end if;
  select jsonb_build_object(
    'students', (select count(*) from public.students where school_id = p_school_id and enrollment_status = 'active'),
    'male_students', (select count(*) from public.students where school_id = p_school_id and enrollment_status = 'active' and gender = 'male'),
    'female_students', (select count(*) from public.students where school_id = p_school_id and enrollment_status = 'active' and gender = 'female'),
    'teachers', (select count(*) from public.employees where school_id = p_school_id and is_active and employment_type = 'teacher'),
    'employees', (select count(*) from public.employees where school_id = p_school_id and is_active),
    'classes', (select count(*) from public.classes where school_id = p_school_id),
    'subjects', (select count(*) from public.subjects where school_id = p_school_id),
    'departments', (select count(*) from public.departments where school_id = p_school_id),
    'present_today', (select count(*) from public.attendance_records where school_id = p_school_id and attendance_date = current_date and status = 'present'),
    'absent_today', (select count(*) from public.attendance_records where school_id = p_school_id and attendance_date = current_date and status = 'absent'),
    'late_today', (select count(*) from public.attendance_records where school_id = p_school_id and attendance_date = current_date and status = 'late'),
    'attendance_rate', coalesce((select round(100.0 * count(*) filter (where status in ('present', 'late')) / nullif(count(*), 0), 1) from public.attendance_records where school_id = p_school_id and attendance_date = current_date), 0),
    'invoiced', coalesce((select sum(total_amount) from public.student_invoices where school_id = p_school_id and status <> 'void'), 0),
    'collected', coalesce((select sum(amount) from public.payments where school_id = p_school_id and status = 'confirmed'), 0),
    'outstanding', coalesce((select sum(balance_due) from public.student_invoices where school_id = p_school_id and status <> 'void'), 0),
    'collected_today', coalesce((select sum(amount) from public.payments where school_id = p_school_id and status = 'confirmed' and paid_at::date = current_date), 0)
  ) into v_stats;
  select coalesce(jsonb_agg(row.item order by row.month_start), '[]'::jsonb) into v_enrollment from (
    select m.month_start, jsonb_build_object('label', to_char(m.month_start, 'Mon'), 'value', count(se.id)) as item
    from generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month') m(month_start)
    left join public.student_enrollments se on se.school_id = p_school_id and date_trunc('month', se.enrollment_date::timestamp) = m.month_start
    group by m.month_start
  ) row;
  select coalesce(jsonb_agg(row.item order by row.month_start), '[]'::jsonb) into v_finance from (
    select m.month_start, jsonb_build_object('label', to_char(m.month_start, 'Mon'), 'income', coalesce((select sum(p.amount) from public.payments p where p.school_id = p_school_id and p.status = 'confirmed' and date_trunc('month', p.paid_at) = m.month_start), 0), 'expense', coalesce((select sum(e.amount) from public.expenses e where e.school_id = p_school_id and e.status = 'posted' and date_trunc('month', e.expense_date::timestamp) = m.month_start), 0)) as item
    from generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month') m(month_start)
  ) row;
  select coalesce(jsonb_agg(jsonb_build_object('id', row.id, 'full_name', row.full_name, 'status', row.status, 'submitted_at', row.submitted_at) order by row.submitted_at desc), '[]'::jsonb) into v_admissions from (select id, concat_ws(' ', first_name, middle_name, last_name) as full_name, status::text, submitted_at from public.admission_applications where school_id = p_school_id order by submitted_at desc nulls last limit 5) row;
  select coalesce(jsonb_agg(jsonb_build_object('id', row.id, 'title', row.title, 'starts_at', row.starts_at, 'category', row.category) order by row.starts_at), '[]'::jsonb) into v_events from (select id, title, starts_at, category from public.school_events where school_id = p_school_id and starts_at >= now() order by starts_at limit 5) row;
  select coalesce(jsonb_agg(jsonb_build_object('id', row.id, 'receipt_number', row.receipt_number, 'amount', row.amount, 'paid_at', row.paid_at, 'payer_name', row.payer_name) order by row.paid_at desc), '[]'::jsonb) into v_payments from (select p.id, p.receipt_number, p.amount, p.paid_at, concat_ws(' ', s.first_name, s.last_name) as payer_name from public.payments p left join public.students s on s.id = p.student_id where p.school_id = p_school_id and p.status = 'confirmed' order by p.paid_at desc limit 5) row;
  select coalesce(jsonb_agg(jsonb_build_object('id', row.id, 'title', row.title, 'body', row.body, 'created_at', row.created_at) order by row.created_at desc), '[]'::jsonb) into v_notifications from (select id, title, body, created_at from public.notifications where school_id = p_school_id and (recipient_id is null or recipient_id = auth.uid()) order by created_at desc limit 5) row;
  return jsonb_build_object('stats', v_stats, 'enrollment_trend', v_enrollment, 'finance_trend', v_finance, 'recent_admissions', v_admissions, 'upcoming_events', v_events, 'recent_payments', v_payments, 'notifications', v_notifications);
end;
$$;

-- Turn on RLS for every application table. Direct browser access is allowed only
-- where a policy explicitly permits it; privileged workflows belong in Edge Functions.
alter table public.organizations enable row level security;
alter table public.schools enable row level security;
alter table public.campuses enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_school_assignments enable row level security;
alter table public.school_settings enable row level security;
alter table public.academic_years enable row level security;
alter table public.terms enable row level security;
alter table public.departments enable row level security;
alter table public.classes enable row level security;
alter table public.subjects enable row level security;
alter table public.students enable row level security;
alter table public.guardians enable row level security;
alter table public.student_guardians enable row level security;
alter table public.admission_applications enable row level security;
alter table public.student_enrollments enable row level security;
alter table public.employees enable row level security;
alter table public.attendance_records enable row level security;
alter table public.student_invoices enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.school_events enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy assignments_select_own on public.user_school_assignments for select to authenticated using (user_id = auth.uid());
create policy user_roles_select_own on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy schools_select_assigned on public.schools for select to authenticated using (public.has_school_access(id));
create policy campuses_select_assigned on public.campuses for select to authenticated using (public.has_school_access(school_id));
create policy settings_select_assigned on public.school_settings for select to authenticated using (public.has_school_access(school_id));
create policy years_select_assigned on public.academic_years for select to authenticated using (public.has_school_access(school_id));
create policy terms_select_assigned on public.terms for select to authenticated using (public.has_school_access(school_id));
create policy departments_select_assigned on public.departments for select to authenticated using (public.has_school_access(school_id));
create policy classes_select_assigned on public.classes for select to authenticated using (public.has_school_access(school_id));
create policy subjects_select_assigned on public.subjects for select to authenticated using (public.has_school_access(school_id));
create policy students_select_assigned on public.students for select to authenticated using (public.has_school_access(school_id));
create policy guardians_select_assigned on public.guardians for select to authenticated using (public.has_school_access(school_id));
create policy enrollments_select_assigned on public.student_enrollments for select to authenticated using (public.has_school_access(school_id));
create policy admissions_select_assigned on public.admission_applications for select to authenticated using (public.has_school_access(school_id));
create policy employees_select_assigned on public.employees for select to authenticated using (public.has_school_access(school_id));
create policy attendance_select_assigned on public.attendance_records for select to authenticated using (public.has_school_access(school_id));
create policy invoices_select_assigned on public.student_invoices for select to authenticated using (public.has_school_access(school_id));
create policy payments_select_assigned on public.payments for select to authenticated using (public.has_school_access(school_id));
create policy expenses_select_assigned on public.expenses for select to authenticated using (public.has_school_access(school_id));
create policy events_select_assigned on public.school_events for select to authenticated using (public.has_school_access(school_id));
create policy notifications_select_recipient on public.notifications for select to authenticated using (public.has_school_access(school_id) and (recipient_id is null or recipient_id = auth.uid()));
create policy audit_logs_select_assigned on public.audit_logs for select to authenticated using (school_id is not null and public.has_school_access(school_id));

-- Student relationship table is safe only through its parent student's tenant policy.
create policy student_guardians_select_assigned on public.student_guardians for select to authenticated using (exists (select 1 from public.students s where s.id = student_id and public.has_school_access(s.school_id)));

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on function public.create_school_with_owner(text, text, text, text, text) from public, anon;
revoke all on function public.my_schools() from public, anon;
revoke all on function public.get_dashboard_overview(uuid) from public, anon;
grant execute on function public.create_school_with_owner(text, text, text, text, text) to authenticated;
grant execute on function public.my_schools() to authenticated;
grant execute on function public.get_dashboard_overview(uuid) to authenticated;

-- Storage buckets are private. Files must be stored under <school-id>/<entity>/<file>.
insert into storage.buckets (id, name, public) values ('school-documents', 'school-documents', false), ('school-media', 'school-media', false)
on conflict (id) do nothing;
create policy school_documents_select on storage.objects for select to authenticated using (bucket_id in ('school-documents', 'school-media') and public.has_school_access((storage.foldername(name))[1]::uuid));
create policy school_documents_insert on storage.objects for insert to authenticated with check (bucket_id in ('school-documents', 'school-media') and public.has_school_access((storage.foldername(name))[1]::uuid));
create policy school_documents_update on storage.objects for update to authenticated using (bucket_id in ('school-documents', 'school-media') and public.has_school_access((storage.foldername(name))[1]::uuid));
create policy school_documents_delete on storage.objects for delete to authenticated using (bucket_id in ('school-documents', 'school-media') and public.has_school_access((storage.foldername(name))[1]::uuid));
