// "Tes" button: one tiny call to a provider + model (recorded in ai_usage as task "test").
import { accountFrom } from "@/lib/account";
import { testModel } from "@/lib/ai/client";
import { agentFail } from "@/lib/ai/http";
import { allowCheck, clientIp } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  if (!allowCheck(clientIp(req))) return Response.json({ error: "Terlalu banyak percobaan. Coba lagi nanti." }, { status: 429 });
  const b = (await req.json().catch(() => null)) ?? {};
  if (!b.provider_id || !b.model) return Response.json({ error: "provider_id dan model wajib." }, { status: 400 });
  try { return Response.json(await testModel(accountFrom(req), b.provider_id, b.model)); }
  catch (e) { return agentFail(e, "ai test failed:"); }
}
