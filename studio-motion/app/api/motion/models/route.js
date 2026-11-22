// Model list for Studio Motion (HTML + metadata). With a Ciora key (Koneksi → AI): Ciora's live models with
// agent/coding tags, defaults = the models chosen in that tab. Without: the Claude path (ANTHROPIC_*) with the catalog.
import { accountFrom } from "@/lib/account";
import { anthropicModel, anthropicReady } from "@/lib/ai/anthropic";
import { CATALOG, modelInfo } from "@/lib/ai/catalog";
import { cioraConn, cioraModels } from "@/lib/ai/ciora";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const account = accountFrom(req);
  const conn = await cioraConn(account);
  if (conn) {
    const r = await cioraModels(account, conn);
    return Response.json({ enabled: true, provider: "ciora", live: r.live, error: r.error, ids: r.models.map((m) => m.id), models: r.models,
      defaults: { html: r.choice.html, meta: r.choice.meta } });
  }
  if (!anthropicReady()) return Response.json({ enabled: false, live: false, ids: [], models: [], defaults: {} });
  return Response.json({ enabled: true, provider: "anthropic", live: false, ids: CATALOG.map((m) => m.id), models: CATALOG.map((m) => modelInfo(m.id)),
    defaults: { html: anthropicModel("html"), meta: anthropicModel("meta") } });
}
