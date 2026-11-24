import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

// The fallback URL/key are never used for a request: all calls are gated by isSupabaseConfigured.
export const supabase = createClient(
  url ?? "https://not-configured.supabase.co",
  anonKey ?? "not-configured",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);
