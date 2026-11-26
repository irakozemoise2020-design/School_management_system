export type Option = [string, string];

export const GENDERS: Option[] = [["female", "Female"], ["male", "Male"], ["other", "Other"], ["undisclosed", "Prefer not to say"]];
export const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const STATUS_LABEL: Record<string, string> = { active: "Active", transferred: "Transferred", withdrawn: "Withdrawn", graduated: "Graduated", inactive: "Inactive", draft: "Draft", submitted: "Submitted", under_review: "Under review", approved: "Approved", rejected: "Rejected", enrolled: "Enrolled", waitlisted: "Waitlisted", promoted: "Promoted", repeated: "Repeated" };

export function toOptions<T extends { id: string }>(items: T[], label: (item: T) => string): Option[] {
  return items.map((item) => [item.id, label(item)] as Option);
}

export function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function todayIso() {
  return new Date().toLocaleDateString("en-CA");
}

export type Year = { id: string; name: string; isCurrent: boolean; startsOn: string; endsOn: string };
export type ClassLite = { id: string; name: string; yearId: string; levelOrder: number };
export type Lookups = {
  currentYearId: string | null;
  yearId: string | null;
  years: Year[];
  classes: ClassLite[];
  subjects: { id: string; name: string; code: string | null }[];
  teachers: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  classrooms: { id: string; name: string }[];
};
export type Me = { permissions: string[]; role: string | null; roleKey: string | null; userId: string; workingDays: number[] };
