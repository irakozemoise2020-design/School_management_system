// EduNexus business API
// All browser-to-database domain operations pass through this authenticated
// Edge Function. It deliberately uses the caller's JWT, so PostgreSQL RLS
// remains the final authorization boundary.
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json; charset=utf-8",
};

type ApiRequest = { operation?: unknown; payload?: unknown };
type CreateSchoolPayload = {
  organizationName?: unknown;
  schoolName?: unknown;
  schoolCode?: unknown;
  campusName?: unknown;
  country?: unknown;
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function requiredText(value: unknown, name: string, maxLength = 160) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${name} is required and must be no longer than ${maxLength} characters.`);
  }
  return value.trim();
}

function schoolId(value: unknown) {
  const id = requiredText(value, "schoolId", 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("schoolId must be a UUID.");
  }
  return id;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Use POST." }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return respond({ error: "Authentication is required." }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) return respond({ error: "Your session is invalid or expired." }, 401);

    const body = await request.json() as ApiRequest;
    const operation = requiredText(body.operation, "operation", 80);

    if (operation === "schools.list") {
      const { data, error } = await supabase.rpc("my_schools");
      if (error) return respond({ error: error.message }, 400);
      return respond({ data: data ?? [] });
    }

    if (operation === "schools.create") {
      const payload = (body.payload ?? {}) as CreateSchoolPayload;
      const { data, error } = await supabase.rpc("create_school_with_owner", {
        p_organization_name: requiredText(payload.organizationName, "organizationName"),
        p_school_name: requiredText(payload.schoolName, "schoolName"),
        p_school_code: requiredText(payload.schoolCode, "schoolCode", 16).toUpperCase(),
        p_campus_name: requiredText(payload.campusName, "campusName"),
        p_country: requiredText(payload.country, "country", 80),
      });
      if (error) return respond({ error: error.message }, 400);
      return respond({ data: { schoolId: data } }, 201);
    }

    if (operation === "dashboard.get") {
      const payload = (body.payload ?? {}) as { schoolId?: unknown };
      const { data, error } = await supabase.rpc("get_dashboard_overview", { p_school_id: schoolId(payload.schoolId) });
      if (error) return respond({ error: error.message }, 403);
      return respond({ data });
    }

    return respond({ error: "Unknown API operation." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request.";
    return respond({ error: message }, 400);
  }
});
