import { useCallback, useEffect, useState } from "react";
import { getDashboardOverview } from "./dashboardService";
import type { DashboardOverview } from "./types";

export function useDashboard(schoolId: string | undefined) {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(Boolean(schoolId));
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true); setError(null);
    try { setData(await getDashboardOverview(schoolId)); } catch (err) { setError(err instanceof Error ? err.message : "Unable to load dashboard data."); }
    finally { setLoading(false); }
  }, [schoolId]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { data, loading, error, refresh };
}
