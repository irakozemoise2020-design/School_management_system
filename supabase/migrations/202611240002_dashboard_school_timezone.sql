-- Phase 1 fix: "today" must follow the school's own time zone (Africa/Kigali), not the database's UTC clock.
-- Without this, between 00:00 and 02:00 in Kigali the dashboard showed yesterday's attendance and collections.

create or replace function public.get_dashboard_overview(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text; v_today date; v_stats jsonb; v_enrollment jsonb; v_finance jsonb; v_admissions jsonb; v_events jsonb; v_payments jsonb; v_notifications jsonb;
begin
  select timezone into v_tz from public.schools where id = p_school_id;
  v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;
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
  return jsonb_build_object('stats', v_stats, 'enrollment_trend', v_enrollment, 'finance_trend', v_finance, 'recent_admissions', v_admissions, 'upcoming_events', v_events, 'recent_payments', v_payments, 'notifications', v_notifications);
end;
$$;

revoke all on function public.get_dashboard_overview(uuid) from public, anon;
grant execute on function public.get_dashboard_overview(uuid) to authenticated;
