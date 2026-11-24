import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { schoolApi } from "../../lib/api";
import { useAuth } from "../auth/AuthProvider";

export type School = { id: string; name: string; code: string; logo_path: string | null; currency_code: string; role_name: string; role_key: string; };
type SchoolContextValue = { schools: School[]; school: School | null; setSchoolId: (schoolId: string) => void; loading: boolean; refresh: () => Promise<void>; };
const SchoolContext = createContext<SchoolContextValue | undefined>(undefined);

export function SchoolProvider({ children }: { children: ReactNode }) {
  const { session, configured } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => localStorage.getItem("edunexus.school-id"));
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    if (!configured || !session) { setSchools([]); return; }
    setLoading(true);
    try { setSchools(await schoolApi<School[]>("schools.list")); } catch { setSchools([]); }
    setLoading(false);
  }, [configured, session]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (schools.length && !schools.some((item) => item.id === selectedId)) setSelectedId(schools[0].id); }, [schools, selectedId]);
  const value = useMemo<SchoolContextValue>(() => ({ schools, school: schools.find((item) => item.id === selectedId) ?? null, setSchoolId: (id) => { setSelectedId(id); localStorage.setItem("edunexus.school-id", id); }, loading, refresh }), [schools, selectedId, loading, refresh]);
  return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>;
}
export function useSchool() { const value = useContext(SchoolContext); if (!value) throw new Error("useSchool must be used within SchoolProvider"); return value; }
