import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";

type StatCardProps = {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  tone?: "blue" | "green" | "amber" | "violet";
  loading?: boolean;
};

const tones = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
};

export function StatCard({ label, value, detail, icon: Icon, tone = "blue", loading }: StatCardProps) {
  return (
    <article className="surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label">{label}</p>
          {loading ? <div className="mt-3 h-8 w-20 animate-pulse rounded bg-slate-100" /> : <p className="mt-1.5 text-2xl font-bold tracking-tight text-ink">{value}</p>}
          {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
        </div>
        <span className={cn("grid h-10 w-10 place-items-center rounded-xl", tones[tone])}><Icon size={20} /></span>
      </div>
    </article>
  );
}
