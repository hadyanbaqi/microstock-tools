import { htmlPrompt, ASPECTS } from "@/lib/htmlMotion.mjs";
import { messagesUrl } from "@/lib/ai/anthropic";
import { accountFrom } from "@/lib/account";
import { allowedModel, cioraChoice, cioraConn, cioraStream } from "@/lib/ai/ciora";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Studio Motion "Buat dengan AI": turns a text idea and/or a reference image into one HTML animation with the Claude API
// and streams the code back as plain text (the editor fills while it is written). Behind the site password (middleware).
// Needs ANTHROPIC_API_KEY on the server (set by the owner in Vercel); without it GET reports enabled:false and the UI
// falls back to "Salin prompt". The key never reaches the browser.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MAX_IMG = 5_000_000;


// Ciora (key from Koneksi, model chosen there) first; the Claude path through ANTHROPIC_* stays as fallback.
export async function GET(req) {
  const conn = await cioraConn(accountFrom(req));
  if (conn) return Response.json({ enabled: true, provider: "ciora", model: (await cioraChoice(accountFrom(req))).html });
  return Response.json({ enabled: Boolean(process.env.ANTHROPIC_API_KEY), provider: "anthropic", model: MODEL });
}

export async function POST(req) {
  const account = accountFrom(req);
  const conn = await cioraConn(account);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!conn && !key) return Response.json({ error: "Belum ada API key AI. Masukkan key Ciora di Koneksi → AI (atau pakai Salin prompt).", code: "NO_KEY" }, { status: 501 });
  let body; try { body = await req.json(); } catch { return Response.json({ error: "Permintaan tidak valid." }, { status: 400 }); }
  const asked = /^[\w./:@-]{1,160}$/.test(String(body.model || "")) ? String(body.model) : "";
  const model = conn ? await allowedModel(conn, asked, (await cioraChoice(account)).html) : asked || MODEL;
  const idea = String(body.idea || "").slice(0, 4000).trim(), aspect = Object.hasOwn(ASPECTS, body.aspect) ? body.aspect : "16:9";
  const duration = Math.min(60, Math.max(5, Math.round(Number(body.duration) || 10)));
  const img = typeof body.image === "string" ? body.image : "";
  const m = img.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (img && (!m || img.length > MAX_IMG)) return Response.json({ error: "Gambar harus PNG/JPG/WEBP di bawah ±3,5 MB." }, { status: 400 });
  if (!idea && !m) return Response.json({ error: "Tulis ide atau unggah gambar dulu." }, { status: 400 });

  const content = [];
  if (m) content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  content.push({ type: "text", text: (m ? "Gambar terlampir adalah referensi gaya/gerak yang diinginkan: tiru suasana, warna, komposisi dan elemennya sebagai animasi orisinal (bukan salinan karya orang, tanpa teks merek atau logo).\n\n" : "")
    + htmlPrompt({ idea: idea || "animasi dari gambar referensi", aspect, duration, background: String(body.background || "code") })
    + "\n\nBuat animasi yang rapi, kaya detail, dan layak dijual sebagai video stock. Mulai jawaban langsung dengan <!DOCTYPE html> dan akhiri dengan </html>, tanpa penjelasan dan tanpa blok markdown." });

  if (conn) {
    if (!model) return Response.json({ error: "Pilih model dulu di Koneksi → AI." }, { status: 409 });
    const parts = content.map((c) => (c.type === "image" ? { type: "image_url", image_url: { url: `data:${c.source.media_type};base64,${c.source.data}` } } : c));
    try {
      const stream = await cioraStream(conn, { model, maxTokens: 16000, messages: [{ role: "user", content: m ? parts : parts[0].text }] });
      return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-model": model } });
    } catch (e) { return Response.json({ error: e.message }, { status: [401, 402, 429, 504].includes(e.status) ? e.status : 502 }); }
  }

  let r;
  try { r = await fetch(messagesUrl(), {
    method: "POST",
    // x-api-key for Anthropic; Bearer too for Anthropic-compatible gateways (e.g. Ciora, ANTHROPIC_BASE_URL=https://ciora.id/v1).
    headers: { "content-type": "application/json", "x-api-key": key, authorization: `Bearer ${key}`, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 16000, stream: true, messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(90e3), // until the response starts
  }); } catch (e) { return Response.json({ error: `API Claude tidak bisa dihubungi: ${e.name === "TimeoutError" ? "tidak menjawab dalam 90 detik" : e.message}` }, { status: 504 }); }
  if (!r.ok || !r.body) {
    const t = await r.text().catch(() => "");
    const msg = r.status === 401 ? "Kunci API Claude ditolak (cek ANTHROPIC_API_KEY)." : r.status === 429 ? "Batas pemakaian API Claude tercapai, coba lagi sebentar." : `API Claude gagal (${r.status}). ${t.slice(0, 200)}`;
    return Response.json({ error: msg }, { status: 502 });
  }
  // Server-sent events → plain text stream of the generated code.
  const reader = r.body.getReader(), dec = new TextDecoder(), enc = new TextEncoder();
  let buf = "";
  const stream = new ReadableStream({
    async pull(ctrl) {
      // Keep reading until there is text: a pull that returns without enqueuing is never called again.
      for (;;) {
        const { value, done } = await reader.read();
        if (done) { ctrl.close(); return; }
        buf += dec.decode(value, { stream: true });
        let sent = false, i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith("data:")) continue;
          try { const ev = JSON.parse(line.slice(5)); if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") { ctrl.enqueue(enc.encode(ev.delta.text)); sent = true; }
            if (ev.type === "message_delta" && ev.delta?.stop_reason === "max_tokens") { ctrl.enqueue(enc.encode("\n<!-- CVE_ERROR Jawaban terpotong: batas token model tercapai -->")); sent = true; }
            if (ev.type === "error") { ctrl.enqueue(enc.encode(`\n<!-- CVE_ERROR ${ev.error?.message || "error"} -->`)); sent = true; } } catch {}
        }
        if (sent) return;
      }
    },
    cancel() { reader.cancel().catch(() => {}); },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-model": model } });
}
