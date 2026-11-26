import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json; charset=utf-8",
};

// Every operation the browser may ask for. Each one maps to a database function `api_<name>` that checks
// the caller's permission itself; anything not in this list is refused here.
const OPERATIONS = new Set([
  "me", "lookups",
  "members_list", "invite_create", "invite_revoke", "member_update",
  "years_list", "year_save", "year_delete", "term_save", "term_delete",
  "classes_list", "class_save", "class_delete",
  "departments_list", "department_save", "department_delete",
  "subjects_list", "subject_save", "subject_delete", "class_subjects_get", "class_subjects_set",
  "assignments_list", "assignment_save", "assignment_delete",
  "staff_list", "staff_save", "settings_get", "settings_save",
  "students_list", "student_get", "student_save", "guardian_save", "guardian_unlink", "student_enroll", "student_status", "students_promote",
  "applications_list", "application_get", "application_save", "application_action",
  "attendance_sheet", "attendance_save", "attendance_summary",
  "timetable_setup", "period_save", "period_delete", "classroom_save", "classroom_delete", "timetable_get", "timetable_entry_save", "timetable_entry_delete",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function requiredText(value: unknown, name: string, maxLength = 160) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${name} is required and must be no longer than ${maxLength} characters.`);
  }
  return value.trim();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 42501 = "not allowed"; everything else the database says is a problem with the request.
function failure(error: { message: string; code?: string }) {
  return respond({ error: error.message }, error.code === "42501" ? 403 : 400);
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

    const body = await request.json();
    if (!isObject(body)) return respond({ error: "Invalid request." }, 400);
    const operation = requiredText(body.operation, "operation", 80);
    const payload = body.payload === undefined || body.payload === null ? {} : body.payload;
    if (!isObject(payload)) return respond({ error: "payload must be an object." }, 400);

    if (operation === "schools.list") {
      // Anyone who was invited by email gets their access the first time they sign in.
      const claim = await supabase.rpc("claim_invitations");
      if (claim.error) return failure(claim.error);
      const { data, error } = await supabase.rpc("my_schools");
      if (error) return failure(error);
      return respond({ data: data ?? [] });
    }

    if (operation === "schools.create") {
      const { data, error } = await supabase.rpc("create_school_with_owner", {
        p_organization_name: requiredText(payload.organizationName, "organizationName"),
        p_school_name: requiredText(payload.schoolName, "schoolName"),
        p_school_code: requiredText(payload.schoolCode, "schoolCode", 16).toUpperCase(),
        p_campus_name: requiredText(payload.campusName, "campusName"),
        p_country: requiredText(payload.country, "country", 80),
      });
      if (error) return failure(error);
      return respond({ data: { schoolId: data } }, 201);
    }

    if (operation === "dashboard.get") {
      const schoolId = requiredText(payload.schoolId, "schoolId", 36);
      if (!UUID.test(schoolId)) return respond({ error: "schoolId must be a UUID." }, 400);
      const { data, error } = await supabase.rpc("get_dashboard_overview", { p_school_id: schoolId });
      if (error) return failure(error);
      return respond({ data });
    }

    if (OPERATIONS.has(operation)) {
      const schoolId = requiredText(payload.schoolId, "schoolId", 36);
      if (!UUID.test(schoolId)) return respond({ error: "schoolId must be a UUID." }, 400);
      const { schoolId: _ignored, ...rest } = payload;
      const { data, error } = await supabase.rpc(`api_${operation}`, { p_school_id: schoolId, p_payload: rest });
      if (error) return failure(error);
      return respond({ data });
    }

    return respond({ error: "Unknown API operation." }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request.";
    return respond({ error: message }, 400);
  }
});
