import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type ApiEnvelope<T> = { data?: T; error?: string };

// The name Supabase gave the deployed function (shown in its web address). Override with VITE_API_FUNCTION if yours differs.
const FUNCTION_NAME = (import.meta.env.VITE_API_FUNCTION as string | undefined) || "swift-api";

export class SchoolApiError extends Error {
  constructor(message: string) { super(message); this.name = "SchoolApiError"; }
}

/** Calls the authenticated Supabase Edge Function rather than a table or RPC directly. */
export async function schoolApi<T>(operation: string, payload?: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<ApiEnvelope<T>>(FUNCTION_NAME, { body: { operation, payload } });
  if (error) {
    // A non-2xx answer carries the real reason in its body; show that instead of a generic message.
    if (error instanceof FunctionsHttpError) {
      try {
        const body = (await error.context.json()) as ApiEnvelope<T>;
        if (body?.error) throw new SchoolApiError(body.error);
      } catch (inner) {
        if (inner instanceof SchoolApiError) throw inner;
      }
    }
    throw new SchoolApiError(error.message);
  }
  if (data?.error) throw new SchoolApiError(data.error);
  if (data?.data === undefined) throw new SchoolApiError("The server returned no data.");
  return data.data;
}
