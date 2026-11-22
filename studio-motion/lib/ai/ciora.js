// Ciora AI gateway (https://ciora.id/v1, OpenAI-compatible: POST /chat/completions, GET /models, Bearer key).
// Server only. The key comes from the "Koneksi → AI" tab (stored encrypted in ai_providers, provider "ciora"),
// else env CIORA_API_KEY (+ CIORA_BASE_URL), else an ANTHROPIC_API_KEY whose ANTHROPIC_BASE_URL points at ciora.id.
// The chosen models live in ai_settings.tasks.ciora = { html, meta, verified: { <model>: { agent, ms, at } } }.
import { modelInfo, pickDefault } from "./catalog.js";
import { getSettings, listProviders, providerWithKey, saveSettings } from "./store.js";

export const CIORA_BASE = "https://ciora.id/v1";

const clean = (u) => String(u || "").trim().replace(/\/+$/, "");
const withV1 = (u) => (/\/v1$/.test(u) ? u : `${u}/v1`);

// { base, key, source: "tersimpan" | "env", hint, id? } or null.
export async function cioraConn(account) {
  try {
    const rows = await listProviders(account);
    const row = rows.find((r) => r.provider === "ciora" && !r.fromEnv && r.enabled);
    if (row) {
      const p = await providerWithKey(account, row.id);
      if (p?.key) return { base: clean(p.base_url) || CIORA_BASE, key: p.key, source: "tersimpan", hint: p.hint, id: p.id };
    }
  } catch { /* tables missing or Supabase down: fall back to env */ }
  if (process.env.CIORA_API_KEY) {
    const k = process.env.CIORA_API_KEY;
    return { base: withV1(clean(process.env.CIORA_BASE_URL) || "https://ciora.id"), key: k, source: "env", hint: k.slice(-4) };
  }
  if (process.env.ANTHROPIC_API_KEY && /ciora\.id/i.test(process.env.ANTHROPIC_BASE_URL || "")) {
    const k = process.env.ANTHROPIC_API_KEY;
    return { base: withV1(clean(process.env.ANTHROPIC_BASE_URL)), key: k, source: "env", hint: k.slice(-4) };
  }
  return null;
}

const headers = (conn) => ({ Authorization: `Bearer ${conn.key}`, "Content-Type": "application/json" });

function fail(status, raw, j) {
  const msg = j?.error?.message || String(raw || "").slice(0, 200);
  const text = status === 401 || status === 403 ? `API key Ciora ditolak: ${msg}` : status === 402 ? `Saldo Ciora habis: ${msg}`
    : status === 429 ? "Terlalu banyak permintaan ke Ciora, coba lagi sebentar." : status === 404 ? `Model tidak ada di Ciora: ${msg}` : `Ciora menjawab ${status}: ${msg}`;
  return Object.assign(new Error(text), { status: status === 401 || status === 403 ? 401 : 502 });
}

// Live model ids (1 h memo per key).
const memo = new Map();
export async function cioraModelIds(conn, { fresh = false } = {}) {
  const k = conn.key.slice(-12);
  const m = memo.get(k);
  if (!fresh && m && Date.now() - m.at < 3600e3) return m.ids;
  const r = await fetch(`${conn.base}/models`, { headers: headers(conn), cache: "no-store" });
  const raw = await r.text();
  let j; try { j = JSON.parse(raw); } catch { j = null; }
  if (!r.ok) throw fail(r.status, raw, j);
  const ids = [...new Set((j?.data || j?.models || []).map((x) => String(x.id || x.name || "")).filter(Boolean))];
  memo.set(k, { at: Date.now(), ids });
  return ids;
}

// Saved choice (+ verified agent tests) and the defaults when nothing is chosen yet.
export async function cioraChoice(account, ids = []) {
  let c = {};
  try { c = (await getSettings(account)).tasks?.ciora || {}; } catch { c = {}; }
  return {
    html: c.html || process.env.CIORA_MODEL || pickDefault(ids, "html"),
    meta: c.meta || process.env.CIORA_META_MODEL || pickDefault(ids, "meta"),
    verified: c.verified || {},
  };
}

export async function saveCioraChoice(account, patch) {
  const s = await getSettings(account);
  const cur = s.tasks?.ciora || {};
  const ciora = { ...cur, ...patch, verified: { ...(cur.verified || {}), ...(patch.verified || {}) } };
  await saveSettings(account, { preset: s.preset || "seimbang", tasks: { ...(s.tasks || {}), ciora }, monthly_budget_usd: s.monthly_budget_usd ?? null });
  return ciora;
}

// Model list for the UI: live ids (or the catalog) enriched with family, agent/coding tags, price, note.
export async function cioraModels(account, conn, opts) {
  let ids = [], live = false, error = null;
  if (conn) {
    try { ids = await cioraModelIds(conn, opts); live = ids.length > 0; } catch (e) { error = e.message; }
  }
  const choice = await cioraChoice(account, ids);
  const list = (live ? ids : modelInfo.catalogIds()).map((id) => ({ ...modelInfo(id), verified: choice.verified[id] || null }));
  return { live, error, models: list, choice };
}

// A model name sent by the browser counts only if this Ciora account really lists it; otherwise the saved choice is used
// (so a crafted request cannot pick a far more expensive model than the owner chose).
export async function allowedModel(conn, asked, fallback) {
  if (!asked || !conn) return fallback;
  try { return (await cioraModelIds(conn)).includes(asked) ? asked : fallback; } catch { return fallback; }
}

// One chat call → { text, usage }.
export async function cioraChat(conn, { model, system, messages, maxTokens = 2000, temperature = 0.5, json = false, timeoutMs = 120e3 }) {
  const body = { model, max_tokens: maxTokens, temperature, messages: system ? [{ role: "system", content: system }, ...messages] : messages };
  if (json) body.response_format = { type: "json_object" };
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let r;
  try { r = await fetch(`${conn.base}/chat/completions`, { method: "POST", signal: ctrl.signal, cache: "no-store", headers: headers(conn), body: JSON.stringify(body) }); }
  catch (e) { throw Object.assign(new Error(e.name === "AbortError" ? `Ciora terlalu lama menjawab (model ${model}, lebih dari ${Math.round(timeoutMs / 1000)} detik). Pilih model yang lebih cepat di Koneksi → AI (hindari model "thinking").` : `Ciora tidak bisa dihubungi: ${e.message}`), { status: 504 }); }
  finally { clearTimeout(timer); }
  const raw = await r.text();
  let j; try { j = JSON.parse(raw); } catch { j = null; }
  if (!r.ok) {
    if (json && r.status === 400 && /response_format|json/i.test(raw)) return cioraChat(conn, { model, system, messages, maxTokens, temperature, json: false, timeoutMs });
    throw fail(r.status, raw, j);
  }
  return { text: j?.choices?.[0]?.message?.content ?? "", usage: j?.usage ?? null };
}

// Streamed chat → ReadableStream of plain text (OpenAI SSE: choices[0].delta.content).
export async function cioraStream(conn, { model, system, messages, maxTokens = 16000, temperature = 0.6, reasoning, idleMs = 90e3, deadlineMs = 280e3 }) {
  const body = { model, max_tokens: maxTokens, temperature, stream: true, messages: system ? [{ role: "system", content: system }, ...messages] : messages };
  if (reasoning) body.reasoning_effort = reasoning; // less "thinking" before the first token; dropped if the model refuses it
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 90e3); // until the first byte
  let r;
  try { r = await fetch(`${conn.base}/chat/completions`, { method: "POST", cache: "no-store", headers: headers(conn), body: JSON.stringify(body), signal: ctrl.signal }); }
  catch (e) { throw Object.assign(new Error(e.name === "AbortError" ? `Ciora belum mulai menjawab setelah 90 detik (model ${model}). Coba model lain yang lebih cepat.` : `Ciora tidak bisa dihubungi: ${e.message}`), { status: 504 }); }
  finally { clearTimeout(timer); }
  if (!r.ok || !r.body) {
    const raw = await r.text().catch(() => "");
    let j; try { j = JSON.parse(raw); } catch { j = null; }
    if (reasoning && r.status === 400 && /reason/i.test(raw)) return cioraStream(conn, { model, system, messages, maxTokens, temperature, idleMs, deadlineMs });
    throw fail(r.status, raw, j);
  }
  const reader = r.body.getReader(), dec = new TextDecoder(), enc = new TextEncoder(), started = Date.now();
  let buf = "";
  // Stops cleanly before the platform kills the function, so the browser gets a reason instead of a dropped connection.
  const giveUp = (ctrl, why) => { ctrl.enqueue(enc.encode(`\n<!-- CVE_ERROR ${why} Coba model lain di Koneksi → AI. -->`)); ctrl.close(); reader.cancel().catch(() => {}); };
  const nextChunk = (ms) => { let t; return Promise.race([reader.read(), new Promise((res) => { t = setTimeout(() => res({ timedOut: true }), ms); })]).finally(() => clearTimeout(t)); };
  return new ReadableStream({
    async pull(ctrl) {
      // Keep reading until there is text: a pull that returns without enqueuing is never called again, so a chunk with no
      // text (role, thinking, keep-alive, [DONE]) would hang the stream until the function times out.
      for (;;) {
        const left = deadlineMs - (Date.now() - started);
        if (left <= 0) { giveUp(ctrl, `Model ${model} terlalu lama menjawab.`); return; }
        const { value, done, timedOut } = await nextChunk(Math.min(idleMs, left));
        if (timedOut) { giveUp(ctrl, left <= idleMs ? `Model ${model} terlalu lama menjawab.` : `Model ${model} berhenti mengirim jawaban.`); return; }
        if (done) { ctrl.close(); return; }
        buf += dec.decode(value, { stream: true });
        let sent = false, i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const ev = JSON.parse(data);
            const t = ev.choices?.[0]?.delta?.content;
            if (t) { ctrl.enqueue(enc.encode(t)); sent = true; }
            if (ev.choices?.[0]?.finish_reason === "length") { ctrl.enqueue(enc.encode(`\n<!-- CVE_ERROR Jawaban terpotong: batas token model tercapai -->`)); sent = true; }
            if (ev.error) { ctrl.enqueue(enc.encode(`\n<!-- CVE_ERROR ${ev.error.message || "error"} -->`)); sent = true; }
          } catch { /* partial line */ }
        }
        if (sent) return;
      }
    },
    cancel() { reader.cancel().catch(() => {}); },
  });
}

// "Tes" in the Ciora tab: can this model act as an agent (call a tool) and answer at all? Tiny call.
export async function cioraTest(conn, model) {
  const t0 = Date.now();
  const tools = [{ type: "function", function: { name: "simpan_ide", description: "Simpan satu ide video stock.",
    parameters: { type: "object", properties: { judul: { type: "string" } }, required: ["judul"] } } }];
  const r = await fetch(`${conn.base}/chat/completions`, { method: "POST", cache: "no-store", headers: headers(conn),
    body: JSON.stringify({ model, max_tokens: 200, temperature: 0, tools, tool_choice: "auto",
      messages: [{ role: "user", content: "Panggil fungsi simpan_ide dengan judul 'gold particles loop'. Jangan menjawab dengan teks." }] }) });
  const raw = await r.text();
  let j; try { j = JSON.parse(raw); } catch { j = null; }
  const ms = Date.now() - t0;
  if (!r.ok) {
    if (r.status === 400 && /tool/i.test(raw)) return { agent: false, ms, note: "Model ini tidak mendukung tool calling." };
    throw fail(r.status, raw, j);
  }
  const msg = j?.choices?.[0]?.message || {};
  const call = (msg.tool_calls || [])[0];
  const agent = !!call && call.function?.name === "simpan_ide";
  return { agent, ms, note: agent ? "Bisa memanggil tool (siap jadi agent)." : `Menjawab teks, tidak memanggil tool${msg.content ? `: “${String(msg.content).slice(0, 60)}”` : ""}.` };
}
