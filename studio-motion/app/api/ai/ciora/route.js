// "Koneksi → AI": API key (sent once in x-ai-key, stored encrypted), live model list with agent/coding tags,
// model choice for HTML code + SEO metadata, and an agent test (real tool call). Responses never contain the key.
import { accountFrom } from "@/lib/account";
import { CIORA_BASE, cioraConn, cioraModelIds, cioraModels, cioraTest, saveCioraChoice } from "@/lib/ai/ciora";
import { addProvider, listProviders, patchProvider, removeProvider } from "@/lib/ai/store";
import { allowCheck, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL_RE = /^[\w./:@-]{1,160}$/;
const view = (conn) => (conn ? { source: conn.source, hint: conn.hint, base: conn.base } : null);
const err = (e, label) => { console.error(label, e.message); return Response.json({ error: e.message }, { status: e.status || 500 }); };

export async function GET(req) {
  const account = accountFrom(req);
  try {
    const conn = await cioraConn(account);
    const fresh = new URL(req.url).searchParams.get("fresh") === "1";
    const r = await cioraModels(account, conn, { fresh });
    return Response.json({ key: view(conn), canStore: !!process.env.MCP_SECRET, ...r });
  } catch (e) { return err(e, "ciora get failed:"); }
}

// { action: "key" } + header x-ai-key | { action: "test", model } | { action: "choice", html?, meta? }
export async function POST(req) {
  const account = accountFrom(req);
  const b = (await req.json().catch(() => null)) ?? {};
  try {
    if (b.action === "key") {
      if (!allowCheck(clientIp(req))) return Response.json({ error: "Terlalu banyak percobaan. Coba lagi nanti." }, { status: 429 });
      const key = (req.headers.get("x-ai-key") ?? "").trim();
      if (key.length < 8) return Response.json({ error: "API key terlalu pendek." }, { status: 400 });
      // Check the key first (GET /models), so a typo is never stored.
      let ids;
      try { ids = await cioraModelIds({ base: CIORA_BASE, key }, { fresh: true }); }
      catch (e) { return Response.json({ error: e.message }, { status: e.status === 401 ? 400 : 502 }); }
      const old = (await listProviders(account)).filter((r) => r.provider === "ciora" && !r.fromEnv);
      const saved = await addProvider(account, { provider: "ciora", label: "Ciora", baseUrl: CIORA_BASE, key });
      await patchProvider(account, saved.id, { status: "ok", last_error: null, checked_at: new Date().toISOString() });
      for (const r of old) await removeProvider(account, r.id);
      return Response.json({ ok: true, models: ids.length });
    }
    if (b.action === "test") {
      if (!allowCheck(clientIp(req))) return Response.json({ error: "Terlalu banyak percobaan. Coba lagi nanti." }, { status: 429 });
      const model = String(b.model || "");
      if (!MODEL_RE.test(model)) return Response.json({ error: "Model tidak valid." }, { status: 400 });
      const conn = await cioraConn(account);
      if (!conn) return Response.json({ error: "Masukkan API key Ciora dulu." }, { status: 409 });
      const t = await cioraTest(conn, model);
      await saveCioraChoice(account, { verified: { [model]: { agent: t.agent, ms: t.ms, at: new Date().toISOString() } } }).catch(() => {});
      return Response.json(t);
    }
    if (b.action === "choice") {
      const patch = {};
      for (const k of ["html", "meta"]) if (b[k] !== undefined) {
        if (b[k] && !MODEL_RE.test(String(b[k]))) return Response.json({ error: "Model tidak valid." }, { status: 400 });
        patch[k] = String(b[k] || "");
      }
      return Response.json({ ok: true, choice: await saveCioraChoice(account, patch) });
    }
    return Response.json({ error: "Aksi tidak dikenal." }, { status: 400 });
  } catch (e) { return err(e, "ciora post failed:"); }
}

export async function DELETE(req) {
  const account = accountFrom(req);
  try {
    const rows = (await listProviders(account)).filter((r) => r.provider === "ciora" && !r.fromEnv);
    for (const r of rows) await removeProvider(account, r.id);
    return Response.json({ ok: true, removed: rows.length });
  } catch (e) { return err(e, "ciora delete failed:"); }
}
