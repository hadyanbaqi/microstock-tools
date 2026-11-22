// Pengaturan Agent: AI providers of the account (OpenRouter, Ciora, custom). Keys never leave the server: the key is
// sent once in the x-ai-key header when adding, stored encrypted; responses carry only label, base URL, last 4.
import { accountFrom } from "@/lib/account";
import { agentFail } from "@/lib/ai/http";
import { listModels } from "@/lib/ai/models";
import { PROVIDERS } from "@/lib/ai/providers";
import { addProvider, listProviders, patchProvider, providerWithKey, removeProvider, viewProvider } from "@/lib/ai/store";
import { allowCheck, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const catalog = Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, baseUrl: p.baseUrl, keyUrl: p.keyUrl, note: p.note, video: p.video }));

export async function GET(req) {
  try {
    const rows = await listProviders(accountFrom(req));
    return Response.json({ catalog, providers: rows.map(viewProvider), canStore: !!process.env.MCP_SECRET });
  } catch (e) { return agentFail(e, "ai providers list failed:"); }
}

// Body { provider, label?, baseUrl? } + header x-ai-key. The key is checked (GET /models) before it is stored.
export async function POST(req) {
  if (!allowCheck(clientIp(req))) return Response.json({ error: "Terlalu banyak percobaan. Coba lagi nanti." }, { status: 429 });
  const account = accountFrom(req);
  const key = (req.headers.get("x-ai-key") ?? "").trim();
  const body = (await req.json().catch(() => null)) ?? {};
  try {
    const saved = await addProvider(account, { ...body, key });
    const row = await providerWithKey(account, saved.id);
    try {
      const models = await listModels(row, { fresh: true });
      await patchProvider(account, saved.id, { status: "ok", last_error: null, checked_at: new Date().toISOString() });
      return Response.json({ provider: viewProvider({ ...saved, status: "ok" }), models: models.length });
    } catch (e) {
      await patchProvider(account, saved.id, { status: "ditolak", last_error: e.message, checked_at: new Date().toISOString() });
      return Response.json({ provider: viewProvider({ ...saved, status: "ditolak", last_error: e.message }), warning: `Tersimpan, tapi daftar model gagal dibaca: ${e.message}` });
    }
  } catch (e) { return agentFail(e, "ai provider add failed:"); }
}

// Body { id, label?, enabled? }
export async function PATCH(req) {
  const body = (await req.json().catch(() => null)) ?? {};
  if (!body.id) return Response.json({ error: "id wajib." }, { status: 400 });
  try { await patchProvider(accountFrom(req), body.id, body); return Response.json({ ok: true }); }
  catch (e) { return agentFail(e, "ai provider update failed:"); }
}

export async function DELETE(req) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id wajib." }, { status: 400 });
  try { await removeProvider(accountFrom(req), id); return Response.json({ ok: true }); }
  catch (e) { e.status ??= 400; return agentFail(e, "ai provider delete failed:"); }
}
