import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { schoolApi } from "../../lib/api";
import type { Lookups, Me } from "../../lib/types";
import { useAuth } from "../auth/AuthProvider";

export type School = { id: string; name: string; code: string; logo_path: string | null; currency_code: string; role_name: string; role_key: string; };
export type ApiFn = <T>(operation: string, payload?: Record<string, unknown>) => Promise<T>;
type SchoolContextValue = {
  schools: School[]; school: School | null; setSchoolId: (schoolId: string) => void; loading: boolean; refresh: () => Promise<void>;
  /** Calls the school-scoped API: the selected school is added automatically. */
  api: ApiFn;
  permissions: string[]; can: (...keys: string[]) => boolean; me: Me | null; accessLoading: boolean; accessError: string | null;
  lookups: Lookups | null; refreshLookups: (yearId?: string) => Promise<void>;
};
const SchoolContext = createContext<SchoolContextValue | undefined>(undefined);

export function SchoolProvider({ children }: { children: ReactNode }) {
  const { session, configured } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => localStorage.getItem("edunexus.school-id"));
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!configured || !session) { setSchools([]); return; }
    setLoading(true);
    try { setSchools(await schoolApi<School[]>("schools.list")); } catch { setSchools([]); }
    setLoading(false);
  }, [configured, session]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (schools.length && !schools.some((item) => item.id === selectedId)) setSelectedId(schools[0].id); }, [schools, selectedId]);
  const school = useMemo(() => schools.find((item) => item.id === selectedId) ?? null, [schools, selectedId]);
  const schoolId = school?.id ?? null;

  const api = useCallback(function <T>(operation: string, payload: Record<string, unknown> = {}) {
    if (!schoolId) return Promise.reject(new Error("No school is selected."));
    return schoolApi<T>(operation, { ...payload, schoolId });
  }, [schoolId]) as ApiFn;

  const refreshLookups = useCallback(async (yearId?: string) => {
    if (!schoolId) return;
    setLookups(await schoolApi<Lookups>("lookups", { schoolId, yearId }));
  }, [schoolId]);

  useEffect(() => {
    let alive = true;
    setMe(null); setLookups(null); setAccessError(null);
    if (!schoolId) { setAccessLoading(false); return; }
    setAccessLoading(true);
    Promise.all([schoolApi<Me>("me", { schoolId }), schoolApi<Lookups>("lookups", { schoolId })]).then(
      ([nextMe, nextLookups]) => { if (alive) { setMe(nextMe); setLookups(nextLookups); setAccessLoading(false); } },
      (error: unknown) => { if (alive) { setAccessError(error instanceof Error ? error.message : "Unable to load your access."); setAccessLoading(false); } },
    );
    return () => { alive = false; };
  }, [schoolId]);

  const permissions = useMemo(() => me?.permissions ?? [], [me]);
  const can = useCallback((...keys: string[]) => keys.some((key) => permissions.includes(key)), [permissions]);
  const value = useMemo<SchoolContextValue>(() => ({
    schools, school, setSchoolId: (id) => { setSelectedId(id); localStorage.setItem("edunexus.school-id", id); }, loading, refresh,
    api, permissions, can, me, accessLoading, accessError, lookups, refreshLookups,
  }), [schools, school, loading, refresh, api, permissions, can, me, accessLoading, accessError, lookups, refreshLookups]);
  return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>;
}
export function useSchool() { const value = useContext(SchoolContext); if (!value) throw new Error("useSchool must be used within SchoolProvider"); return value; }
