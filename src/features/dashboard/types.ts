export type TrendPoint = { label: string; value: number; income?: number; expense?: number };
export type DashboardOverview = {
  stats: { students: number; male_students: number; female_students: number; teachers: number; employees: number; classes: number; subjects: number; departments: number; present_today: number; absent_today: number; late_today: number; attendance_rate: number; invoiced: number; collected: number; outstanding: number; collected_today: number; };
  enrollment_trend: TrendPoint[];
  finance_trend: TrendPoint[];
  recent_admissions: { id: string; full_name: string; status: string; submitted_at: string | null }[];
  upcoming_events: { id: string; title: string; starts_at: string; category: string | null }[];
  recent_payments: { id: string; receipt_number: string | null; amount: number; paid_at: string; payer_name: string | null }[];
  notifications: { id: string; title: string; body: string | null; created_at: string }[];
};
