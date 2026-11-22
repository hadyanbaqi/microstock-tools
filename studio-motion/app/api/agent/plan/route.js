// Agent step 1: the owner's command → research parameters (Ciora, the HTML/agent model chosen in Koneksi).
import { accountFrom } from "@/lib/account";
import { cioraChat, cioraChoice, cioraConn } from "@/lib/ai/ciora";
import { normalizePlan, planSystem, planUser } from "@/lib/ai/agentPrompt";
import { parseJsonLoose } from "@/lib/ai/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: is the agent ready (Ciora key + model)?
export async function GET(req) {
  const account = accountFrom(req);
  const conn = await cioraConn(account);
  if (!conn) return Response.json({ ready: false, reason: "Belum ada API key Ciora. Buka Koneksi → AI." });
  const c = await cioraChoice(account);
  return Response.json({ ready: !!c.html, model: c.html, metaModel: c.meta, reason: c.html ? "" : "Pilih model di Koneksi → AI." });
}

export async function POST(req) {
  const account = accountFrom(req);
  const b = await req.json().catch(() => ({}));
  const command = String(b.command || "").trim();
  if (command.length < 3) return Response.json({ error: "Tulis perintahnya dulu." }, { status: 400 });
  const conn = await cioraConn(account);
  if (!conn) return Response.json({ error: "Belum ada API key Ciora. Buka Koneksi → AI.", code: "NO_KEY" }, { status: 409 });
  const model = (await cioraChoice(account)).html;
  if (!model) return Response.json({ error: "Pilih model di Koneksi → AI." }, { status: 409 });
  try {
    const { text } = await cioraChat(conn, { model, system: planSystem(), messages: [{ role: "user", content: planUser(command) }], maxTokens: 400, temperature: 0.1, json: true });
    const plan = normalizePlan(parseJsonLoose(text) || {}, command);
    if (!plan.keyword) return Response.json({ error: "Keyword tidak terbaca dari perintah. Sebutkan topiknya, mis. “riset gold particles”." }, { status: 422 });
    return Response.json({ plan, model });
  } catch (e) { return Response.json({ error: e.message }, { status: e.status || 502 }); }
}
