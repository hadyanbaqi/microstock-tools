// Model list of one provider (?provider=<id>, &fresh=1 to skip the 1-hour cache), with prices and capabilities.
import { accountFrom } from "@/lib/account";
import { agentFail } from "@/lib/ai/http";
import { listModels } from "@/lib/ai/models";
import { providerWithKey } from "@/lib/ai/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const q = new URL(req.url).searchParams;
  try {
    const p = await providerWithKey(accountFrom(req), q.get("provider"));
    if (!p) return Response.json({ error: "Penyedia tidak ditemukan." }, { status: 404 });
    if (!p.key) return Response.json({ error: "Key tidak bisa dibuka. Simpan ulang key-nya." }, { status: 409 });
    return Response.json({ models: await listModels(p, { fresh: !!q.get("fresh") }) });
  } catch (e) { return agentFail(e, "ai models failed:"); }
}
