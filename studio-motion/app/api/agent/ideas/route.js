// Agent step 3: live research digest → insight + N motion ideas, streamed as JSON Lines straight to the browser
// (one idea per line), so each idea shows up and starts its HTML code while the model is still writing the next one.
import { accountFrom } from "@/lib/account";
import { cioraChoice, cioraConn, cioraStream } from "@/lib/ai/ciora";
import { ideasSystem, ideasUser, normalizePlan } from "@/lib/ai/agentPrompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req) {
  const account = accountFrom(req);
  const b = await req.json().catch(() => ({}));
  const command = String(b.command || "").slice(0, 1500);
  const plan = normalizePlan(b.plan || {}, command);
  const digest = b.digest && typeof b.digest === "object" ? b.digest : null;
  if (digest && JSON.stringify(digest).length > 20000) return Response.json({ error: "Data riset terlalu besar." }, { status: 400 });
  const conn = await cioraConn(account);
  if (!conn) return Response.json({ error: "Belum ada API key Ciora.", code: "NO_KEY" }, { status: 409 });
  const model = (await cioraChoice(account)).html;
  try {
    const stream = await cioraStream(conn, { model, system: ideasSystem(), maxTokens: 4000 + plan.count * 800, temperature: 0.8, reasoning: "low",
      messages: [{ role: "user", content: ideasUser({ command, plan, digest, background: String(b.background || "code") }) }] });
    return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-model": model } });
  } catch (e) { return Response.json({ error: `${e.message} (model ${model})` }, { status: e.status || 502 }); }
}
