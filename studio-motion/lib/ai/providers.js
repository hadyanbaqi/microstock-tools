// AI providers the agent can use. All speak the OpenAI-compatible API (POST {base}/chat/completions, GET {base}/models),
// so switching provider = another base URL + key. OpenRouter also does images (chat with modalities) and video
// (async /videos jobs) on the same key: used from stage 4.
//
// Keys come from the account's stored providers (Supabase ai_providers, encrypted) or, for the owner, from env:
// OPENROUTER_API_KEY, CIORA_API_KEY (+ CIORA_BASE_URL), AI_CUSTOM_API_KEY + AI_CUSTOM_BASE_URL.

export const PROVIDERS = {
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/settings/keys",
    note: "Satu key untuk teks, vision, gambar, dan video. Biaya tiap panggilan dilaporkan langsung.",
    envKey: "OPENROUTER_API_KEY",
    // OpenRouter asks apps to identify themselves (optional, shows in their dashboard).
    headers: { "HTTP-Referer": "https://stockscope-theta.vercel.app", "X-Title": "StockScope" },
    reportsCost: true,
    video: true,
  },
  ciora: {
    label: "Ciora AI",
    baseUrl: "https://ciora.id/v1", // OpenAI-compatible (docs: ciora.id/docs/quickstart); also CIORA_BASE_URL
    keyUrl: "https://ciora.id",
    note: "Gateway hemat (harga dalam rupiah, ada model gratis). Pihak ketiga: pakai untuk tugas ringan.",
    envKey: "CIORA_API_KEY",
    envBase: "CIORA_BASE_URL",
    headers: {},
    reportsCost: false,
    video: false,
  },
  custom: {
    label: "Kustom (OpenAI-compatible)",
    baseUrl: "",
    keyUrl: "",
    note: "Endpoint apa saja yang kompatibel OpenAI: isi base URL sampai /v1.",
    envKey: "AI_CUSTOM_API_KEY",
    envBase: "AI_CUSTOM_BASE_URL",
    headers: {},
    reportsCost: false,
    video: false,
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);

// Agent tasks. need = model capability required to be offered for the task.
export const TASKS = {
  prompt: { label: "Prompt Studio", hint: "Riset → konsep → prompt gambar/video", need: "text" },
  metadata: { label: "Metadata otomatis", hint: "Judul, 40 keyword, kategori dari gambar/frame video", need: "vision" },
  quality: { label: "Cek kualitas", hint: "Jari aneh, teks rusak, logo, artefak", need: "vision" },
  image: { label: "Generate gambar (opsional)", hint: "Kosongkan bila generate manual (mis. Digen)", need: "image" },
  video: { label: "Generate video (opsional)", hint: "Kosongkan bila generate manual", need: "video" },
};
export const TASK_IDS = Object.keys(TASKS);

// Validate a base URL entered by the user: https only (http for localhost), no trailing slash.
export function cleanBaseUrl(u) {
  const s = String(u ?? "").trim().replace(/\/+$/, "");
  if (!s) return "";
  let url;
  try { url = new URL(s); } catch { return null; }
  if (url.username || url.password || url.search || url.hash) return null;
  const h = url.hostname;
  // Cloud metadata / private-network literals are never a model API.
  if (/^(169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?f[cd][0-9a-f]{2}:|\[?fe80:)/i.test(h) || h === "metadata.google.internal") return null;
  const local = ["localhost", "127.0.0.1"].includes(h);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
  return s;
}
