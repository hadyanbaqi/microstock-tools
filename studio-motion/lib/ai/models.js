// Model lists from a provider (GET {base}/models, OpenAI shape { data: [...] }), normalized for the settings UI:
// { id, name, context, priceIn, priceOut (USD per 1M tokens, null = unknown), free, caps: { text, vision, image, video } }.
// OpenRouter fills pricing + architecture.input/output_modalities; other gateways may only give ids (caps unknown =
// null: offered everywhere with a "?" so the user can still choose). OpenRouter video models come from /videos/models.
import { PROVIDERS } from "./providers.js";

const TTL = 60 * 60e3;
const memo = new Map();

const perM = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && v !== null && v !== "" ? +(n * 1e6).toFixed(4) : null; // "-1" = variable price: unknown
};

function normalize(m) {
  const arch = m.architecture || {};
  const inMods = arch.input_modalities || m.input_modalities || null;
  const outMods = arch.output_modalities || m.output_modalities || null;
  const p = m.pricing || {};
  const priceIn = perM(p.prompt ?? p.input), priceOut = perM(p.completion ?? p.output);
  const known = Array.isArray(inMods) || Array.isArray(outMods);
  return {
    id: String(m.id),
    name: m.name || m.id,
    context: m.context_length || m.context_window || null,
    priceIn, priceOut,
    free: (priceIn === 0 && priceOut === 0) || /:free$|-free$/i.test(m.id),
    caps: known
      ? { text: (outMods || ["text"]).includes("text"), vision: (inMods || []).includes("image"), image: (outMods || []).includes("image"), video: false }
      : { text: true, vision: null, image: null, video: false },
  };
}

function normalizeVideo(m) {
  // Prices per second differ by resolution (pricing_skus); keep the lowest as "from".
  let from = null;
  for (const s of m.pricing_skus || m.pricing || []) {
    const v = Number(s.price ?? s.amount ?? s.usd);
    if (Number.isFinite(v) && (from === null || v < from)) from = v;
  }
  return { id: String(m.id), name: m.name || m.id, context: null, priceIn: null, priceOut: null, perSecond: from, free: false,
    caps: { text: false, vision: false, image: false, video: true } };
}

async function getJson(url, key, extraHeaders) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, ...extraHeaders }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    const e = new Error(res.status === 401 || res.status === 403 ? "API key ditolak penyedia." : `Penyedia menjawab ${res.status}.`);
    e.status = res.status; throw e;
  }
  return res.json();
}

// provider = row with base_url, key, provider (from store.providerWithKey).
export async function listModels(provider, { fresh = false } = {}) {
  const cacheKey = `${provider.id}|${provider.base_url}`;
  const hit = memo.get(cacheKey);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.models;
  const def = PROVIDERS[provider.provider] || {};
  const j = await getJson(`${provider.base_url}/models`, provider.key, def.headers);
  const models = (j.data || j.models || []).map(normalize);
  if (def.video) {
    try {
      const v = await getJson(`${provider.base_url}/videos/models`, provider.key, def.headers);
      models.push(...(v.data || v.models || []).map(normalizeVideo));
    } catch { /* video list is optional */ }
  }
  models.sort((a, b) => a.id.localeCompare(b.id));
  memo.set(cacheKey, { at: Date.now(), models });
  return models;
}

export const findModel = async (provider, id) => (await listModels(provider)).find((m) => m.id === id) || null;

// Model offered for a task? null caps (unknown) count as yes.
export function fits(model, need) {
  const c = model.caps;
  if (need === "text") return c.text !== false;
  if (need === "vision") return c.vision !== false && c.text !== false;
  if (need === "image") return c.image !== false && c.video !== true && (c.image === true || c.image === null);
  if (need === "video") return c.video === true;
  return true;
}

// Presets: pick a model per task from the list. Patterns are tried in order, then the cheapest that fits.
const PREFER = {
  hemat: { text: [/flash-lite|flash|haiku|mini|free/i], vision: [/flash-lite|flash|vision-free|haiku/i], image: [/seedream.*flash|muse|flash.*image/i], video: [/wan|seedance.*fast|lite/i] },
  seimbang: { text: [/gemini.*flash(?!-lite)/i, /haiku/i], vision: [/gemini.*flash(?!-lite)/i, /haiku/i], image: [/seedream|nano.?banana/i], video: [/seedance|wan|veo.*lite/i] },
  kualitas: { text: [/claude.*(sonnet|opus)/i, /gpt-5(?!.*mini)/i, /gemini.*pro/i], vision: [/claude.*(sonnet|opus)/i, /gemini.*pro/i, /gpt-5(?!.*mini)/i], image: [/nano.?banana.*pro|gpt.?image/i], video: [/veo.*fast|kling|seedance.*2\.5/i] },
};

const price = (m) => (m.priceIn ?? 99) + (m.priceOut ?? 99) + (m.perSecond ?? 0) * 100;

export function pickModel(models, need, preset) {
  // Generation tasks only take models that say so; text/vision also accept unknown caps.
  const pool = models.filter((m) => (need === "image" || need === "video" ? m.caps[need] === true : fits(m, need)));
  if (!pool.length) return null;
  const pats = (PREFER[preset] || PREFER.seimbang)[need] || [];
  for (const re of pats) {
    const hits = pool.filter((m) => re.test(m.id) && (preset !== "hemat" || m.priceIn !== null));
    if (hits.length) return hits.sort((a, b) => price(a) - price(b))[0].id;
  }
  const sorted = [...pool].sort((a, b) => price(a) - price(b));
  return (preset === "kualitas" ? sorted[sorted.length - 1] : sorted[0]).id;
}
