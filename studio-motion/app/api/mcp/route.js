// Personal MCP endpoint (Streamable HTTP, JSON responses, stateless). Claude connects with
// https://<site>/api/mcp?key=<MCP_SECRET>. Every request without the right key is refused.
import { safeEqual } from "@/lib/auth";
import { TOOLS } from "@/lib/mcpTools";
import { clientIp, makeLimiter } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const badTry = makeLimiter(20, 15 * 60e3);

function authorized(req) {
  const secret = process.env.MCP_SECRET ?? "";
  if (secret.length < 24) return false; // unset or too weak: stay closed
  const url = new URL(req.url);
  const given = url.searchParams.get("key") || (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return safeEqual(given, secret);
}

const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(msg) {
  const { id, method } = msg ?? {};
  const params = msg?.params ?? {};
  if (!method) return rpcError(id, -32600, "Invalid request");
  if (id === undefined || id === null) return null; // notifications (e.g. notifications/initialized): no reply
  if (method === "initialize") {
    const v = VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : VERSIONS[0];
    return { jsonrpc: "2.0", id, result: { protocolVersion: v, capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "stockscope", version: "1.0.0" },
      instructions: "Riset microstock Adobe Stock milik pribadi. Metrik utama: dl_per_bulan (kecepatan jual). Pakai hasil tersimpan bila ada; pencarian baru berbayar dan dibatasi per hari (cek_kuota). Video: pemilik mengirim ide/gambar dari Studio Motion (permintaan_video); jawab dengan buat_video (html + permintaan_id)." } };
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } };
  if (method === "tools/call") {
    const tool = TOOLS.find((t) => t.name === params.name);
    if (!tool) return rpcError(id, -32602, `Tool tidak dikenal: ${params.name}`);
    try {
      const out = await tool.run(params.arguments ?? {});
      // A tool may attach images (e.g. the reference image of a video request) as MCP image content.
      const images = Array.isArray(out?.__images) ? out.__images : []; if (images.length) delete out.__images;
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(out) }, ...images.map((im) => ({ type: "image", data: im.data, mimeType: im.mimeType }))] } };
    } catch (e) {
      console.error("mcp tool failed:", params.name, e.code ?? "", e.message);
      const text = e.code === "BAD_TOKEN" ? "Token Apify di server ditolak." : e.code === "NO_CREDIT" ? "Kredit Apify habis."
        : /fetch failed|ENOTFOUND|ECONNREFUSED/i.test(e.message) ? "Database Supabase tidak bisa dihubungi (kemungkinan project di-pause; Restore di dashboard Supabase)." : e.message;
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } };
    }
  }
  return rpcError(id, -32601, `Method tidak didukung: ${method}`);
}

async function safeHandle(msg) {
  try { return await handle(msg); }
  catch (e) { console.error("mcp handler failed:", e.message); return rpcError(msg?.id, -32603, "Internal error"); }
}

export async function POST(req) {
  if (!authorized(req)) {
    if (!badTry(clientIp(req))) return new Response("Too many requests", { status: 429 });
    return Response.json(rpcError(null, -32001, "Unauthorized"), { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body) return Response.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  if (Array.isArray(body)) {
    // Bounded and sequential: a batch must not bypass the daily search limit by running many paid calls at once.
    if (body.length > 10) return Response.json(rpcError(null, -32600, "Batch maksimal 10 pesan"), { status: 400 });
    const out = [];
    for (const m of body) { const r = await safeHandle(m); if (r) out.push(r); }
    return out.length ? Response.json(out) : new Response(null, { status: 202 });
  }
  const out = await safeHandle(body);
  return out ? Response.json(out) : new Response(null, { status: 202 });
}

// No server-initiated stream: this server only answers requests.
export async function GET(req) {
  if (!authorized(req)) {
    if (!badTry(clientIp(req))) return new Response("Too many requests", { status: 429 });
    return Response.json(rpcError(null, -32001, "Unauthorized"), { status: 401 });
  }
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
export const DELETE = GET;
