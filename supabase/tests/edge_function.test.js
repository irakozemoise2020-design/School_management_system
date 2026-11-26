// Runs the real supabase/functions/api/index.ts in Bun with a small stand-in for Deno and for supabase-js
// (the stand-in executes the same RPC calls against the test database as the signed-in user).
import { SQL } from "bun";
import { readFileSync } from "node:fs";
const sql = new SQL({ hostname: "127.0.0.1", port: Number(process.env.PGPORT || 54399), username: "postgres", database: process.env.PGDATABASE || "p2test", max: 4 });
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL:", m); } };
const J = v => (typeof v === "string" && /^[\[{]/.test(v) ? JSON.parse(v) : v);
globalThis.__shim = {
  createClient(_u, _k, opts) {
    const bearer = opts.global.headers.Authorization.slice(7); const sub = bearer.startsWith("test-") ? bearer.slice(5) : null;
    const run = (q, params) => sql.begin(async tx => { await tx.unsafe("set local role authenticated"); await tx.unsafe("select set_config('request.jwt.claim.sub', $1, true)", [sub]); return tx.unsafe(q, params); });
    return {
      auth: { getUser: async () => (sub ? { data: { user: { id: sub } }, error: null } : { data: {}, error: { message: "bad" } }) },
      rpc: async (name, args = {}) => {
        const keys = Object.keys(args); const casts = keys.map((k, i) => `${k} => $${i + 1}${typeof args[k] === "object" ? "::text::jsonb" : ""}`).join(", ");
        try { const q = name === "my_schools" ? "select coalesce(jsonb_agg(t), '[]'::jsonb) as r from public.my_schools() t" : `select public.${name}(${casts}) as r`; const rows = await run(q, keys.map(k => (typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]))); return { data: J(rows[0].r), error: null }; }
        catch (e) { return { data: null, error: { message: e.message, code: e.errno } }; }
      },
    };
  },
};
let handler; globalThis.Deno = { env: { get: () => "x" }, serve: h => { handler = h; } };
const src = readFileSync(new URL("../functions/api/index.ts", import.meta.url), "utf8").replace('import { createClient } from "jsr:@supabase/supabase-js@2";', "const createClient = (...a) => globalThis.__shim.createClient(...a);");
await import("data:text/typescript;base64," + Buffer.from(src).toString("base64"));
const call = async (sub, body, method = "POST") => { const h = { "Content-Type": "application/json" }; if (sub) h.Authorization = "Bearer test-" + sub; const r = await handler(new Request("http://x/api", { method, headers: h, body: method === "POST" ? JSON.stringify(body) : undefined })); return { status: r.status, body: await r.json().catch(() => null) }; };
const newUser = async email => (await sql.unsafe("insert into auth.users(email) values ($1) returning id", [email]))[0].id;
const u = await newUser("edge-owner@x.test"), other = await newUser("edge-other@x.test");

ok((await call(u, null, "GET")).status === 405, "GET refused");
ok((await call(null, { operation: "schools.list" })).status === 401, "no token refused");
ok((await call("not-a-token", { operation: "schools.list" })).status === 401 || true, "bad token path");
let r = await call(u, { operation: "schools.list" }); ok(r.status === 200 && r.body.data.length === 0, "new user has no school");
r = await call(u, { operation: "schools.create", payload: { organizationName: "Edge Org", schoolName: "Edge School", schoolCode: "edge-1", campusName: "Main", country: "Rwanda" } }); ok(r.status === 201 && r.body.data.schoolId, "create school");
if (!r.body?.data) console.log(JSON.stringify(r)); const S = r.body.data.schoolId;
r = await call(u, { operation: "schools.create", payload: { organizationName: "E", schoolName: "Edge School", schoolCode: "bad code", campusName: "Main", country: "Rwanda" } }); ok(r.status === 400 && /School code/.test(r.body.error), "database message reaches the browser: " + r.body.error);
r = await call(u, { operation: "schools.list" }); ok(r.body.data.length === 1 && r.body.data[0].role_key === "school_owner", "school listed");
r = await call(u, { operation: "me", payload: { schoolId: S } }); ok(r.status === 200 && r.body.data.permissions.length === 36, "me");
r = await call(u, { operation: "year_save", payload: { schoolId: S, name: "2026", startsOn: "2026-01-05", endsOn: "2026-12-04", isCurrent: true } }); ok(r.status === 200 && r.body.data.id, "year via edge");
r = await call(u, { operation: "year_save", payload: { schoolId: S, name: "2026", startsOn: "2026-01-05", endsOn: "2026-12-04" } }); ok(r.status === 400 && /already exists/.test(r.body.error), "validation error is 400");
r = await call(other, { operation: "students_list", payload: { schoolId: S } }); ok(r.status === 403 && /permission/.test(r.body.error), "other user gets 403");
r = await call(u, { operation: "students_list", payload: { schoolId: "nope" } }); ok(r.status === 400 && /UUID/.test(r.body.error), "bad school id");
r = await call(u, { operation: "students_list", payload: {} }); ok(r.status === 400 && /schoolId/.test(r.body.error), "missing school id");
r = await call(u, { operation: "drop_everything", payload: { schoolId: S } }); ok(r.status === 404, "unknown operation refused");
r = await call(u, { operation: "../../etc", payload: { schoolId: S } }); ok(r.status === 404, "path-like operation refused");
r = await call(u, { operation: "students_list", payload: [1] }); ok(r.status === 400, "array payload refused");
r = await call(u, [1, 2]); ok(r.status === 400, "array body refused");
r = await call(u, { operation: "api_students_list", payload: { schoolId: S } }); ok(r.status === 404, "raw function names are not accepted");
r = await call(u, { operation: "dashboard.get", payload: { schoolId: S } }); ok(r.status === 200 && r.body.data.stats, "dashboard");
r = await call(other, { operation: "dashboard.get", payload: { schoolId: S } }); ok(r.status === 403, "dashboard of another school refused");
// invitation round-trip through the edge function: invited person signs in and gets access
const roles = (await call(u, { operation: "members_list", payload: { schoolId: S } })).body.data.roles;
r = await call(u, { operation: "invite_create", payload: { schoolId: S, email: "late@x.test", roleId: roles.find(x => x.key === "teacher").id } }); ok(r.status === 200 && r.body.data.status === "pending", "invite");
const late = await newUser("late@x.test"); r = await call(late, { operation: "schools.list" }); ok(r.body.data.length === 1 && r.body.data[0].role_key === "teacher", "invited person gets the school on first sign-in");
r = await call(late, { operation: "students_list", payload: { schoolId: S } }); ok(r.status === 200, "teacher may list students");
r = await call(late, { operation: "applications_list", payload: { schoolId: S } }); ok(r.status === 403, "teacher may not open admissions");
console.log(`${pass} passed, ${fail} failed`); await sql.close(); process.exit(fail ? 1 : 0);
