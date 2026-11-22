// Agent (tab Agent in Studio Motion): prompts for the two thinking steps that run on Ciora (the HTML model chosen in Koneksi):
// 1) plan = read the owner's command (Indonesian or English) into search parameters,
// 2) ideas = turn a live Adobe Stock research result into N clearly different, sellable motion ideas.
// The rest of the pipeline reuses existing parts: /api/research (Apify, cost confirmed in the browser),
// /api/motion/generate (HTML code), /api/motion/metadata (SEO), the Batch queue (render + CSV). Pure.

export const ASSET_TYPES = ["video", "vector", "illustration", "photo", "all"];

export function planSystem() {
  return `Kamu adalah agent riset microstock di StockScope. Ubah perintah pemilik menjadi parameter riset Adobe Stock.
Balas HANYA JSON:
{"keyword": "...", "asset": "video|vector|illustration|photo|all", "count": n, "aspect": "16:9|9:16|1:1", "duration": n, "style": "..."}
Aturan:
- keyword: frasa pencarian Adobe Stock dalam bahasa Inggris, 1–4 kata, huruf kecil, tanpa merek dagang (contoh: "gold particles background").
- asset: jenis aset yang diriset. Hasil akhirnya animasi video (motion), jadi pakai "video" kecuali perintah jelas minta jenis lain.
- count: jumlah video yang diminta (1–20). Kalau tidak disebut: 5.
- aspect: 16:9 kecuali disebut vertikal/story/reels (9:16) atau kotak/square (1:1).
- duration: detik per video (5–30). Kalau tidak disebut: 10.
- style: catatan gaya/warna/suasana dari perintah (bahasa Indonesia, boleh kosong).`;
}

export const planUser = (command) => `Perintah pemilik:\n"""${String(command).slice(0, 1500)}"""`;

const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
export function normalizePlan(p, command = "") {
  const kw = String(p?.keyword || "").toLowerCase().replace(/[^a-z0-9 -]+/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 5).join(" ");
  return {
    keyword: kw || String(command).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim().split(/\s+/).slice(0, 3).join(" "),
    asset: ASSET_TYPES.includes(p?.asset) ? p.asset : "video",
    count: clampInt(p?.count, 1, 20, 5),
    aspect: ["16:9", "9:16", "1:1"].includes(p?.aspect) ? p.aspect : "16:9",
    duration: clampInt(p?.duration, 5, 30, 10),
    style: String(p?.style || "").slice(0, 300),
  };
}

const nameOf = (x) => (x == null ? "" : typeof x === "string" ? x : x.name || x.label || "");
// Compact view of analyze() for the model: only what helps choose ideas (keeps the prompt small and cheap).
export function researchDigest(d) {
  if (!d) return null;
  const s = d.summary || {};
  const b = d.brief || {};
  return {
    keyword: d.params?.query || "",
    asset: d.params?.asset || "",
    sample: s.count, avgDlPerMonth: s.avgVelocity, recentDlPerMonth: s.avgRecentVelocity, aiSharePct: s.aiShare,
    top5DominancePct: s.dominance, opportunityScore: s.opportunityScore, verdict: s.verdict?.text || "",
    insights: (d.insights || []).map((i) => i.text).slice(0, 6),
    fastKeywords: (d.goldenKeywords || []).slice(0, 12).map((k) => `${k.keyword} (${k.avgVelocity} dl/bln)`),
    topKeywords: (d.keywords || []).slice(0, 25).map((k) => k.keyword),
    bestTitles: [...(d.assets || [])].sort((a, b2) => (b2.dlPerMonth || 0) - (a.dlPerMonth || 0)).slice(0, 10)
      .map((a) => `${a.title} — ${a.dlPerMonth ?? "?"} dl/bln`),
    brief: { format: nameOf(b.format), orientation: nameOf(b.orientation), category: nameOf(b.category), ai: b.ai?.text || "",
      elements: (b.elements || []).map((e) => e.keyword), avoid: (b.avoid || []).map((e) => e.keyword), phrases: (b.phrases || []).map((p) => p.phrase || p) },
  };
}

export function ideasSystem() {
  return `Kamu adalah agent kreatif microstock video. Dari data riset Adobe Stock, rancang ide animasi loop yang LAKU dan bisa dibuat dengan HTML/CSS/Canvas/SVG (tanpa video, foto, atau aset luar).
Jawab dalam format JSON Lines: SATU objek JSON per baris, tanpa teks lain, tanpa markdown.
Baris 1: {"insight": "..."}  ← 2–3 kalimat bahasa Indonesia: apa yang laku di niche ini dan celahnya (sebut angka dari data).
Baris berikutnya, satu per ide: {"name": "...", "title": "...", "idea": "..."}
Aturan ide:
- Tepat sejumlah yang diminta, tiap ide JELAS BERBEDA (komposisi, gerak, palet, elemen), bukan variasi warna saja.
- name: nama file a-z0-9 dan tanda hubung, maksimal 20 karakter, unik.
- title: judul kerja bahasa Inggris 5–10 kata, frasa pencarian utama di depan, tanpa koma, tanpa merek.
- idea: brief animasi bahasa Indonesia 2–3 kalimat padat: elemen, gerak, palet warna (hex), latar, loop mulus. Ikuti keyword yang cepat laku, hindari yang disebut "avoid".
- Hindari merek dagang, logo, tokoh terkenal, dan SVG SMIL (tidak ikut terekam). CSS 3D (perspective, rotateX/Y, kubus/kartu berputar) boleh dan ikut terekam.
- Ide harus ringan dirender dengan Canvas 2D: maksimal 60 partikel atau elemen, glow lembut, tanpa blur berat. Kesan 3D boleh dengan CSS 3D atau skala 2D di canvas.
Langsung mulai menulis, jangan berpikir panjang.`;
}

const slug0 = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20).replace(/-+$/, "");
// One streamed line → { insight } | { idea } | null. used = Set of names already taken (keeps names unique).
export function parseIdeaLine(line, used) {
  const t = String(line || "").trim().replace(/^```\w*|```$/g, "").replace(/,\s*$/, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let o; try { o = JSON.parse(t.slice(a, b + 1)); } catch { return null; }
  if (typeof o.insight === "string" && !o.idea) return { insight: o.insight.trim().slice(0, 1200) };
  const idea = String(o.idea || "").trim().slice(0, 1500);
  if (idea.length < 20) return null;
  let name = slug0(o.name || o.title) || `video-${used.size + 1}`, k = 2;
  while (used.has(name)) { const suf = `-${k++}`; name = name.slice(0, 20 - suf.length).replace(/-+$/, "") + suf; }
  used.add(name);
  return { idea: { name, title: String(o.title || "").replace(/,/g, " ").replace(/\s+/g, " ").trim().slice(0, 70), idea } };
}

// Same idea reworded by the model: compared on content words so a paid HTML call is not spent on a near copy.
const wordsOf = (s) => new Set(String(s).toLowerCase().split(/[^a-z0-9#]+/).filter((w) => w.length > 3));
export function tooSimilar(idea, others) {
  const a = wordsOf(idea);
  return others.some((o) => { const b = wordsOf(o), both = [...a].filter((w) => b.has(w)).length; return both / Math.max(1, a.size + b.size - both) > 0.6; });
}

// Which plan fields the command really states; the rest follow the current Studio settings.
export function commandStates(command) {
  const raw = String(command || "").toLowerCase();
  return { aspect: /9\s*:\s*16|16\s*:\s*9|1\s*:\s*1|vertikal|vertical|portrait|story|reels|tiktok|shorts|kotak|square|landscape|horizontal/.test(raw), duration: /\d\s*(?:detik|dtk|second|sec|s\b)/.test(raw) };
}

export function ideasUser({ command, plan, digest, background = "code" }) {
  return `Perintah pemilik: """${String(command).slice(0, 1500)}"""
Jumlah ide: ${plan.count}. Rasio: ${plan.aspect}. Durasi loop: ${plan.duration} detik.${plan.style ? ` Gaya: ${plan.style}.` : ""}${background === "alpha" ? " Latar: transparan, jadi rancang objek terang tanpa latar penuh." : /^#[0-9a-f]{6}$/i.test(background) ? ` Latar: warna solid ${background}, jadi objek dilarang memakai warna itu atau warna yang mirip.` : ""}
Data riset (Adobe Stock, keyword "${plan.keyword}"):
${digest ? JSON.stringify(digest) : "Tidak ada data riset (pakai pengetahuan umum pasar video stock, sebutkan bahwa ini tanpa data)."}`;
}

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20).replace(/-+$/, "");
export function normalizeIdeas(d, count) {
  const used = new Set();
  const ideas = (Array.isArray(d?.ideas) ? d.ideas : []).map((x, i) => {
    let name = slug(x?.name || x?.title) || `video-${i + 1}`, k = 2;
    while (used.has(name)) { const suf = `-${k++}`; name = name.slice(0, 20 - suf.length).replace(/-+$/, "") + suf; }
    used.add(name);
    return { name, title: String(x?.title || "").replace(/,/g, " ").replace(/\s+/g, " ").trim().slice(0, 70), idea: String(x?.idea || "").trim().slice(0, 1500) };
  }).filter((x) => x.idea.length >= 20).slice(0, count);
  return { insight: String(d?.insight || "").trim().slice(0, 1200), ideas };
}

// Instant command reader (no AI call, runs in the browser): "riset gold particles, buat 5 video vertikal 15 detik".
// The keyword is what remains after the command words; the owner can still edit everything on the plan card.
const FILLER = new Set(("riset risetkan cari carikan cek analisa analisis buat buatkan bikin bikinkan tolong saya mau ingin minta " +
  "dong ya untuk utk di dan yang dengan dari ke pada niche celah ide video videos loop loops animasi motion clip klip " +
  "detik dtk second seconds sec s buah aja saja lalu terus kemudian juga please make create research find about " +
  "vertikal vertical portrait story stories reels tiktok shorts kotak square landscape horizontal " +
  "durasi berdurasi selama lama of the a an with for and").split(" "));
const ID_EN = { latar: "background", belakang: "", emas: "gold", partikel: "particles", cahaya: "light", garis: "lines", abstrak: "abstract",
  teknologi: "technology", bisnis: "business", alam: "nature", air: "water", api: "fire", asap: "smoke", bintang: "stars", awan: "clouds",
  gelombang: "waves", laut: "ocean", pantai: "beach", langit: "sky", gunung: "mountain", hutan: "forest", makanan: "food", kopi: "coffee", malam: "night", pagi: "morning", biru: "blue", hijau: "green", merah: "red", hitam: "black", putih: "white", ungu: "purple", pemandangan: "landscape", bunga: "flowers", hujan: "rain", salju: "snow", kota: "city", lampu: "lights", warna: "colorful", mewah: "luxury" };
export function parseCommand(command) {
  const raw = String(command || "").toLowerCase();
  const num = (re) => { const m = raw.match(re); return m ? +m[1] : null; };
  // (?<!\d)(\d{1,3}): "100 video" must read as 100 (then clamp to 20), not as "00".
  const count = num(/(?<!\d)(\d{1,3})\s*(?:video|videos|buah|klip|clip|animasi|ide)/) ?? num(/buat(?:kan)?\s+(\d{1,3})/) ?? 5;
  const duration = num(/(?<!\d)(\d{1,3})\s*(?:detik|dtk|second|sec|s\b)/) ?? 10;
  const aspect = /9\s*:\s*16|vertikal|vertical|portrait|story|reels|tiktok|shorts/.test(raw) ? "9:16" : /1\s*:\s*1|kotak|square/.test(raw) ? "1:1" : "16:9";
  const asset = /\bvector|vektor\b/.test(raw) ? "vector" : /ilustrasi|illustration/.test(raw) ? "illustration" : /\bfoto|photo\b/.test(raw) ? "photo" : "video";
  const quoted = raw.match(/["“'']([^"”'']{3,60})["”'']/);
  const first = quoted ? quoted[1] : raw.split(/[,.;\n]/)[0];
  const words = first.replace(/\d+\s*:\s*\d+/g, " ").replace(/[^a-z0-9 -]+/g, " ").split(/\s+/)
    .filter((w) => w && !FILLER.has(w) && !/^\d+$/.test(w)).map((w) => (w in ID_EN ? ID_EN[w] : w)).filter(Boolean);
  const rest = raw.split(/[,.;\n]/).slice(1).join(", ").trim();
  // No topic left after removing the command words ("buat 5 video"): keyword stays empty so the UI asks for one.
  return { ...normalizePlan({ keyword: words.slice(0, 4).join(" "), asset, count, aspect, duration, style: rest.slice(0, 300) }, ""), keyword: words.slice(0, 4).join(" ").replace(/[^a-z0-9 -]+/g, " ").replace(/\s+/g, " ").trim() };
}
