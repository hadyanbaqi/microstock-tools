// Kantong token Apify (Pengaturan Apify). Behind the site login (middleware). Tokens never leave the server:
// responses carry only label, last 4 characters, account and credit.
import { weakSecret } from "@/lib/secretStore";
import { addToken, listRows, poolAvailable, poolSummary, refreshToken, removeToken, updateToken, viewRow } from "@/lib/tokenPool";
import { allowCheck, clientIp } from "@/lib/ratelimit";
import { userTokenFrom } from "@/lib/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isId = (v) => /^[0-9a-f-]{36}$/i.test(String(v ?? ""));
const fail = (e, msg) => {
  console.error(msg, e.message);
  if (/fetch failed|supabase|ENOTFOUND|ECONNREFUSED/i.test(e.message) && !e.status)
    return Response.json({ error: "Database (Supabase) tidak bisa dihubungi." }, { status: 503 });
  return Response.json({ error: e.status ? e.message : "Gagal memproses token." }, { status: e.status ?? 502 });
};

// List + summary. ?summary=1 returns only the counts (top bar, Beranda checklist).
export async function GET(req) {
  if (!poolAvailable()) return Response.json({ available: false, tokens: [], count: 0, usable: 0, leftUsd: null, serverToken: !!process.env.APIFY_TOKEN });
  try {
    const summary = await poolSummary();
    if (new URL(req.url).searchParams.get("summary")) return Response.json(summary);
    const tokens = (await listRows()).map(viewRow);
    return Response.json({ ...summary, tokens, serverToken: !!process.env.APIFY_TOKEN, weakSecret: weakSecret() });
  } catch (e) { return fail(e, "token pool list failed:"); }
}

// Add one token (sent in the x-apify-token header like everywhere else); body { label }.
export async function POST(req) {
  if (!poolAvailable()) return Response.json({ error: "Perlu Supabase dan MCP_SECRET di server." }, { status: 503 });
  if (!allowCheck(clientIp(req))) return Response.json({ error: "Terlalu banyak percobaan. Coba lagi nanti." }, { status: 429 });
  const token = userTokenFrom(req);
  if (!token) return Response.json({ error: "Format token tidak valid." }, { status: 400 });
  const body = (await req.json().catch(() => null)) ?? {};
  try { return Response.json({ token: await addToken(token, body.label) }); }
  catch (e) { return fail(e, "token pool add failed:"); }
}

// Body { id, label?, enabled?, refresh? }: rename, switch on/off, or re-read credit from Apify.
export async function PATCH(req) {
  const body = (await req.json().catch(() => null)) ?? {};
  if (!isId(body.id)) return Response.json({ error: "ID token tidak valid." }, { status: 400 });
  try {
    let row = await updateToken(body.id, body);
    if (body.refresh || body.enabled === true) row = await refreshToken(body.id);
    if (!row) return Response.json({ error: "Token tidak ditemukan." }, { status: 404 });
    return Response.json({ token: row });
  } catch (e) { return fail(e, "token pool update failed:"); }
}

export async function DELETE(req) {
  const id = new URL(req.url).searchParams.get("id");
  if (!isId(id)) return Response.json({ error: "ID token tidak valid." }, { status: 400 });
  try { await removeToken(id); return Response.json({ ok: true }); }
  catch (e) { return fail(e, "token pool delete failed:"); }
}
