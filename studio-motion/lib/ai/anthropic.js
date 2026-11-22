// Anthropic Messages API (or an Anthropic-compatible gateway such as Ciora: ANTHROPIC_BASE_URL=https://ciora.id/v1).
// Server only: ANTHROPIC_API_KEY never reaches the browser.
export const anthropicReady = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const anthropicModel = (kind) => (kind === "meta" && process.env.ANTHROPIC_META_MODEL) || process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

// ANTHROPIC_BASE_URL may be given with or without the trailing /v1.
export function messagesUrl(base = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com") {
  const b = base.replace(/\/+$/, "");
  return /\/v1$/.test(b) ? `${b}/messages` : `${b}/v1/messages`;
}

export function anthropicHeaders() {
  const key = process.env.ANTHROPIC_API_KEY;
  return { "content-type": "application/json", "x-api-key": key, authorization: `Bearer ${key}`, "anthropic-version": "2023-06-01" };
}

// One non-streamed call; returns { text, usage }.
export async function anthropicText({ system, messages, model, maxTokens = 2000, temperature = 0.4, timeoutMs = 90e3 }) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let r;
  try {
    r = await fetch(messagesUrl(), { method: "POST", signal: ctrl.signal, cache: "no-store", headers: anthropicHeaders(),
      body: JSON.stringify({ model, max_tokens: maxTokens, temperature, system, messages }) });
  } catch (e) {
    throw Object.assign(new Error(e.name === "AbortError" ? "AI terlalu lama menjawab." : `AI tidak bisa dihubungi: ${e.message}`), { status: 504 });
  } finally { clearTimeout(timer); }
  const raw = await r.text();
  let j; try { j = JSON.parse(raw); } catch { j = null; }
  if (!r.ok) {
    const msg = j?.error?.message || raw.slice(0, 200);
    throw Object.assign(new Error(r.status === 401 ? "Kunci API ditolak (cek ANTHROPIC_API_KEY)." : r.status === 429 ? "Batas pemakaian API tercapai, coba lagi sebentar." : `API gagal (${r.status}): ${msg}`), { status: r.status === 401 ? 401 : 502 });
  }
  // Anthropic shape (content blocks); tolerate an OpenAI-shaped answer from a gateway.
  const text = Array.isArray(j?.content) ? j.content.filter((b) => b.type === "text").map((b) => b.text).join("") : j?.choices?.[0]?.message?.content ?? "";
  return { text, usage: j?.usage ?? null };
}

export function parseJsonLoose(text) {
  const t = String(text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(t); } catch { /* try the outermost object */ }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* invalid */ } }
  return undefined;
}
