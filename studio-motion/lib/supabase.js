// Minimal Supabase REST (PostgREST) client for server routes only. The secret key bypasses RLS:
// never import this from client components.
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
export const hasDb = !!(URL_ && KEY);

export async function rest(pathname, { method = "GET", body, prefer } = {}) {
  const headers = { apikey: KEY, "Content-Type": "application/json" };
  // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys only in apikey.
  if (KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${KEY}`;
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${URL_}/rest/v1/${pathname}`, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
