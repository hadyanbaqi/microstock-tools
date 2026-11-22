// Studio Motion: SEO metadata (title, 40 keywords, Adobe + Shutterstock categories) for queued videos, written by the
// owner's AI gateway (Ciora/Claude through ANTHROPIC_* env, ANTHROPIC_META_MODEL optional) with lib/ai/metaPrompt.js.
// Every answer is checked with lib/stockMeta.js; a wrong one gets the error back and one retry. Behind the site password.
import { anthropicModel, anthropicReady, anthropicText, parseJsonLoose } from "@/lib/ai/anthropic";
import { metaSystem, metaUser } from "@/lib/ai/metaPrompt";
import { accountFrom } from "@/lib/account";
import { allowedModel, cioraChat, cioraChoice, cioraConn } from "@/lib/ai/ciora";
import { finalMeta, metaError, normalizeMeta } from "@/lib/stockMeta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_ITEMS = 20, PARALLEL = 3;

export async function GET(req) {
  const conn = await cioraConn(accountFrom(req));
  if (conn) return Response.json({ enabled: true, provider: "ciora", model: (await cioraChoice(accountFrom(req))).meta });
  return Response.json({ enabled: anthropicReady(), provider: "anthropic", model: anthropicModel("meta") });
}

async function one(item, research, kind, ai, model, conn) {
  const system = metaSystem();
  const messages = [{ role: "user", content: metaUser({ item, research, kind, ai }) }];
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text } = conn
      ? await cioraChat(conn, { system, messages, model, maxTokens: 1500, temperature: attempt ? 0.2 : 0.5, json: true })
      : await anthropicText({ system, messages, model, maxTokens: 1500, temperature: attempt ? 0.2 : 0.5 });
    const data = parseJsonLoose(text);
    if (data === undefined) last = "jawaban bukan JSON";
    else {
      const m = normalizeMeta(data);
      last = metaError(m);
      if (!last) return finalMeta(m);
    }
    messages.push({ role: "assistant", content: text || "{}" }, { role: "user", content: `Belum sesuai aturan: ${last}. Kirim ulang HANYA JSON yang benar (tepat 40 keyword unik).` });
  }
  throw Object.assign(new Error(`Metadata belum valid: ${last}`), { status: 422 });
}

// Body { items: [{ id, name, idea?, html? }], research?: { keyword, keywords[], titles[] }, kind?: "video", ai?: false }
export async function POST(req) {
  const account = accountFrom(req);
  const conn = await cioraConn(account);
  if (!conn && !anthropicReady()) return Response.json({ error: "Belum ada API key AI. Masukkan key Ciora di Koneksi → AI.", code: "NO_KEY" }, { status: 501 });
  const b = await req.json().catch(() => ({}));
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, MAX_ITEMS).map((x) => ({
    id: String(x.id ?? ""), name: String(x.name ?? "").slice(0, 40), idea: String(x.idea ?? "").slice(0, 2000), html: String(x.html ?? "").slice(0, 400_000) }));
  if (!items.length) return Response.json({ error: "Tidak ada video yang dipilih." }, { status: 400 });
  const research = b.research && typeof b.research === "object" ? {
    keyword: String(b.research.keyword ?? "").slice(0, 80),
    keywords: (Array.isArray(b.research.keywords) ? b.research.keywords : []).map(String).slice(0, 80),
    titles: (Array.isArray(b.research.titles) ? b.research.titles : []).map(String).slice(0, 8),
  } : null;
  const kind = ["video", "image", "vector"].includes(b.kind) ? b.kind : "video";
  const asked = /^[\w./:@-]{1,160}$/.test(String(b.model || "")) ? String(b.model) : "";
  const model = conn ? await allowedModel(conn, asked, (await cioraChoice(account)).meta) : asked || anthropicModel("meta");
  if (!model) return Response.json({ error: "Pilih model metadata dulu di Koneksi → AI." }, { status: 409 });
  const results = new Array(items.length);
  let next = 0;
  // Stop starting new items near the function limit, or after an error that every next call would repeat (bad key,
  // no credit, rate limit): calls already made are billed, so keep what finished and return it instead of timing out.
  const deadline = Date.now() + 230e3;
  let halt = "";
  async function worker() {
    while (next < items.length) {
      const i = next++, it = items[i];
      if (halt || Date.now() > deadline) { results[i] = { id: it.id, error: halt || "Waktu habis: ulangi untuk nomor ini." }; continue; }
      try { results[i] = { id: it.id, meta: await one(it, research, kind, !!b.ai, model, conn) }; }
      catch (e) {
        results[i] = { id: it.id, error: e.message };
        if ([401, 402, 403, 429].includes(e.status)) halt = `Dihentikan: ${e.message}`;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
  return Response.json({ model, results });
}
