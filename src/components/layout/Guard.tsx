import type { ReactNode } from "react";
import { useSchool } from "../../features/schools/SchoolContext";
import { Spinner } from "../ui/kit";

/** Shows the page only when the signed-in role holds the permission; the database enforces it regardless. */
export function Guard({ need, children }: { need: string; children: ReactNode }) {
  const { can, accessLoading, accessError, school } = useSchool();
  if (accessLoading) return <Spinner label="Checking your access…" />;
  if (accessError) return <div className="surface p-8"><h1 className="text-xl font-bold text-ink">Could not load your access</h1><p className="mt-2 text-sm text-slate-500">{accessError}</p></div>;
  if (!can(need)) return <div className="surface p-8"><h1 className="text-xl font-bold text-ink">You do not have access to this page</h1><p className="mt-2 text-sm text-slate-500">Your role ({school?.role_name ?? "none"}) does not include it. Ask the school owner if you need it.</p></div>;
  return <>{children}</>;
}
