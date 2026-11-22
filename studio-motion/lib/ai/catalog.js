// Model catalog for the AI gateway behind ANTHROPIC_* (Ciora). Prices = Ciora's model page (27 Oct 2026, Rupiah per
// 1M tokens: input / output); the live list from {base}/models is merged in by /api/motion/models, so models missing
// here still show (price unknown). Update the prices here when Ciora changes them. Pure: also used in the browser.
//   rec: "html" = recommended for HTML animation code, "meta" = for SEO metadata; tier: hemat | seimbang | premium | gratis
export const CATALOG = [
  { id: "anthropic/claude-haiku-5.5", name: "Claude Haiku 5.5", in: 36300, out: 80300, rec: ["meta", "html"], tier: "seimbang", note: "Paling pas harga/kualitas: rapi ikut aturan, kode HTML bagus." },
  { id: "an/claude-opus-4-6-thinking", name: "Claude Opus 4.6 (thinking)", in: 88000, out: 330000, rec: ["html"], tier: "premium", note: "HTML terbaik untuk motion detail; diskon 47% di Ciora." },
  { id: "anthropic/claude-opus-4.5", name: "Claude Opus 4.5", in: 146300, out: 630300, rec: [], tier: "premium", note: "Kuat, tapi lebih mahal dari Opus 4.6 di Ciora." },
  { id: "anthropic/claude-fable-5.1", name: "Claude Fable 5.1", in: 245300, out: 1125300, rec: [], tier: "premium", note: "Penulisan ekspresif; mahal untuk metadata/HTML." },
  { id: "anthropic/claude-fable-5", name: "Claude Fable 5", in: 267300, out: 1235300, rec: [], tier: "premium", note: "Mahal; tidak perlu untuk tugas ini." },
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5", in: 47300, out: 135300, rec: [], tier: "seimbang", note: "Lebih mahal dan lebih lama dari Haiku 5.5." },
  { id: "anthropic/claude-opus-4.1", name: "Claude Opus 4.1", in: 355300, out: 1675300, rec: [], tier: "premium", note: "Model lama, termahal." },
  { id: "ciora/gemini-3.8-flash", name: "Gemini 3.8 Flash", in: 1980, out: 5500, rec: ["meta"], tier: "hemat", note: "Super murah (diskon 95%); metadata cepat. Bisa jadi hanya jalan lewat format OpenAI." },
  { id: "ciora-coding-free", name: "Ciora Coding Free", in: 0, out: 0, rec: [], tier: "gratis", note: "Gratis untuk coba-coba kode; kualitas di bawah Claude." },
  { id: "ciora-ai-free", name: "Ciora AI Free", in: 0, out: 0, rec: [], tier: "gratis", note: "Gratis serbaguna; cocok untuk tes." },
  { id: "ciora-vision-free", name: "Ciora Vision Free", in: 0, out: 0, rec: [], tier: "gratis", note: "Gratis, khusus membaca gambar." },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", name: "Nemotron 3 Ultra (free)", in: 0, out: 0, rec: [], tier: "gratis", note: "Gratis, reasoning besar; bisa lambat." },
];

// Typical token use per job, for the price estimate shown next to each model.
export const USAGE = { html: { in: 2500, out: 12000 }, meta: { in: 1800, out: 700 } };

export const estimateIdr = (m, task) => (m.in == null ? null : Math.round((USAGE[task].in * m.in + USAGE[task].out * m.out) / 1e6));
export const fmtIdr = (n) => (n == null ? "harga ?" : n === 0 ? "gratis" : `±Rp ${n.toLocaleString("id-ID")}`);

// Catalog merged with the live id list (ids only): known first (recommended first for the task), then unknown ones.
export function mergeModels(liveIds, task) {
  const known = new Map(CATALOG.map((m) => [m.id, m]));
  const list = [...CATALOG.filter((m) => !liveIds?.length || liveIds.includes(m.id))];
  for (const id of liveIds || []) if (!known.has(id)) list.push({ id, name: id, in: null, out: null, rec: [], tier: "?", note: "Belum ada data harga di katalog." });
  const score = (m) => (m.rec.includes(task) ? 0 : m.in == null ? 3 : m.tier === "gratis" ? 2 : 1);
  return list.sort((a, b) => score(a) - score(b) || (a.in ?? 1e12) - (b.in ?? 1e12));
}

// ---------------------------------------------------------------- model info (Ciora tab) ----------------------------------------------------------------
// Ciora's /models gives ids only, so family and abilities are read from the id. agent = supports tool calling (needed
// for the research agent), coding = good at writing HTML/JS animation code. true = known, null = unknown (use "Tes",
// which really calls a tool and stores the result). Pure: also used in the browser.
const FAMILIES = [
  [/claude|anthropic\/|^an\//i, "Anthropic", true, true],
  [/gemini/i, "Google Gemini", true, true],
  [/qwen.*coder|qwen3/i, "Qwen", true, true],
  [/qwen/i, "Qwen", true, null],
  [/deepseek/i, "DeepSeek", true, true],
  [/devstral|codestral/i, "Mistral", true, true],
  [/mistral|magistral|ministral/i, "Mistral", true, null],
  [/minimax/i, "MiniMax", true, true],
  [/glm|zhipu|z-ai/i, "GLM (Zhipu)", true, true],
  [/kimi|moonshot/i, "Kimi (Moonshot)", true, true],
  [/gpt|openai\/|o[34]-/i, "OpenAI", true, true],
  [/grok/i, "xAI Grok", true, true],
  [/llama/i, "Meta Llama", null, null],
  [/nemotron|nvidia/i, "NVIDIA", null, null],
  [/ciora-coding/i, "Ciora", null, true],
  [/ciora-vision/i, "Ciora", false, false],
  [/ciora/i, "Ciora", null, null],
];

const prettyName = (id) => id.replace(/^[^/]+\//, "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/:Free$/i, " (free)");

export function modelInfo(id) {
  const known = CATALOG.find((m) => m.id === id);
  const fam = FAMILIES.find(([re]) => re.test(id)) || [null, "Lainnya", null, null];
  const free = /free/i.test(id) || known?.tier === "gratis";
  return {
    id, name: known?.name || prettyName(id), family: fam[1], anthropic: fam[1] === "Anthropic",
    agent: fam[2], coding: /coder|coding|codestral|devstral/i.test(id) ? true : fam[3],
    in: known?.in ?? (free ? 0 : null), out: known?.out ?? (free ? 0 : null),
    tier: known?.tier || (free ? "gratis" : "?"), note: known?.note || "", rec: known?.rec || [],
  };
}
modelInfo.catalogIds = () => CATALOG.map((m) => m.id);

// Default model when nothing is chosen: non-Anthropic first (owner's choice: Ciora for the other models).
const PREF = {
  html: [/qwen.*coder/i, /deepseek.*(v3|chat|coder)/i, /glm-?4\.[5-9]|glm-?5/i, /kimi-?k2/i, /minimax-?m/i, /gemini.*pro/i, /gpt-?5/i, /devstral|codestral/i, /gemini.*flash/i, /ciora-coding/i],
  meta: [/gemini.*flash/i, /deepseek.*(v3|chat)/i, /qwen/i, /gpt.*mini/i, /glm/i, /ciora-ai-free/i],
};
export function pickDefault(ids, task) {
  const pool = (ids && ids.length ? ids : modelInfo.catalogIds()).filter((id) => !modelInfo(id).anthropic && !/vision/i.test(id));
  for (const re of PREF[task] || []) { const hit = pool.find((id) => re.test(id)); if (hit) return hit; }
  return pool[0] || (ids || [])[0] || "";
}
