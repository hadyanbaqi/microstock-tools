// SEO prompt for stock metadata (Adobe Stock first, also Shutterstock/Vecteezy). Used by /api/motion/metadata with the
// owner's AI gateway (Ciora via ANTHROPIC_BASE_URL). The answer is checked by lib/stockMeta.js; on a bad answer the
// model gets the error and one retry.
import { ADOBE_CATS, KW_COUNT, SS_CATS, TITLE_MAX } from "../stockMeta.js";

const KIND_WORDS = {
  video: "Ini VIDEO motion graphics (animasi HTML yang dirender, BUKAN buatan AI generatif, bukan rekaman kamera). Keyword format yang relevan: motion graphics, animation, animated, loop, seamless loop, 4k, footage, background, overlay (pakai hanya yang benar).",
  image: "Ini GAMBAR/foto. Keyword format yang relevan: photo, background, concept, copy space (pakai hanya yang benar).",
  vector: "Ini VEKTOR. Keyword format yang relevan: vector, illustration, icon, set, isolated, flat, editable (pakai hanya yang benar).",
};

export function metaSystem() {
  return `Kamu spesialis SEO metadata microstock (Adobe Stock, Shutterstock, Vecteezy) yang paham cara pembeli mencari.
Tugasmu: menulis metadata yang membuat aset mudah ditemukan DAN akurat (Adobe menolak/menurunkan aset dengan keyword yang menyesatkan).

ATURAN JUDUL (title)
- Bahasa Inggris natural, deskriptif, seperti kalimat pendek yang menjelaskan isi aset; ${TITLE_MAX} karakter atau kurang; minimal 5 kata; TANPA koma dan tanpa tanda kutip.
- Taruh frasa pencarian utama di depan (kata yang paling mungkin diketik pembeli), lalu subjek, gaya/gerak, dan kegunaan.
- Jangan keyword stuffing, jangan huruf kapital semua, jangan kata promosi (best, amazing, beautiful), jangan nomor seri.

ATURAN KEYWORD (keywords)
- TEPAT ${KW_COUNT} keyword, masing-masing huruf kecil, hanya a-z 0-9 spasi dan tanda hubung, tanpa duplikat.
- URUTAN PENTING: 10 keyword pertama paling berpengaruh di Adobe Stock. Urutkan: frasa utama → subjek/objek yang terlihat → aksi/gerak → gaya visual & warna → konsep/emosi → kegunaan (background, overlay, presentation, intro) → format.
- Campur 1–3 kata: frasa spesifik (mis. "gold particles") + kata tunggal pentingnya ("gold", "particles").
- Hanya yang benar-benar ada atau tersirat jelas di aset. Gunakan bahasa Inggris (Amerika), bentuk tunggal kecuali bentuk jamak lebih umum dicari.
- DILARANG: merek dagang, nama orang/karakter/tempat terkenal, nama software, kata "ai generated" atau "generative ai" (kecuali aset memang AI dan diminta), keyword yang tidak relevan.
- Manfaatkan data riset (keyword yang laku untuk topik ini) bila relevan dengan isi aset; jangan memaksakan yang tidak cocok.

KATEGORI
- adobe_category: SATU angka 1–21: ${Object.entries(ADOBE_CATS).map(([k, v]) => `${k} ${v}`).join(", ")}.
- shutterstock_categories: 1–2 dari daftar persis: ${SS_CATS.join(", ")}.

FORMAT JAWABAN
Hanya JSON, tanpa penjelasan dan tanpa markdown:
{"title": "...", "keywords": ["...", "... (${KW_COUNT} item)"], "adobe_category": 8, "shutterstock_categories": ["Backgrounds/Textures"]}`;
}

// item: { name, idea, html? }  research: { keyword, keywords: [string] (ranked, best first), titles: [string] }
export function metaUser({ item, research, kind = "video", ai = false }) {
  const parts = [KIND_WORDS[kind] || KIND_WORDS.video];
  if (ai) parts.push("Aset ini dibuat dengan AI generatif; tetap jangan menulis kata AI di judul/keyword kecuali memang bagian dari topik.");
  if (research?.keyword) parts.push(`Topik riset: "${research.keyword}".`);
  if (research?.keywords?.length) parts.push(`Keyword yang laku untuk topik ini (urut dari terkuat, ambil yang relevan saja): ${research.keywords.slice(0, 60).join(", ")}.`);
  if (research?.titles?.length) parts.push(`Contoh judul aset terlaris (gaya saja, JANGAN disalin): ${research.titles.slice(0, 5).join(" | ")}.`);
  parts.push(`Nama file: ${item.name || "-"}.`);
  if (item.idea) parts.push(`Deskripsi/ide aset: ${String(item.idea).slice(0, 1500)}`);
  if (item.html) parts.push(`Ringkasan isi dari kode animasinya (judul, teks, warna, elemen): ${summarizeHtml(item.html)}`);
  parts.push("Tulis metadatanya sekarang.");
  return parts.join("\n");
}

// What a model can learn from an HTML animation without the whole file: <title>, comments, visible text, colours, element words.
export function summarizeHtml(html) {
  const h = String(html || "");
  const title = (h.match(/<title>([^<]{0,120})<\/title>/i) || [])[1] || "";
  const comments = [...h.matchAll(/<!--([\s\S]{0,200}?)-->/g)].map((m) => m[1].trim()).filter((c) => c && !/VIDEO \d|SELESAI/i.test(c)).slice(0, 4);
  const text = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  const colors = [...new Set((h.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|hsla?\([^)]*\)|rgba?\([^)]*\)/gi) || []).slice(0, 12))];
  const words = [...new Set((h.match(/\b(particle|star|sparkle|glow|neon|grid|wave|circle|line|dot|bokeh|light|ring|orbit|gradient|confetti|bubble|smoke|fire|snow|rain|hexagon|triangle|square|icon|text|logo|chart|graph|map|globe|heart|leaf|flower|ribbon|frame|border|glitch|noise|tunnel|spiral|burst|ray|beam|cloud|planet|city|sun|moon)s?\b/gi) || []).map((w) => w.toLowerCase()))].slice(0, 20);
  return [title && `judul: ${title}`, comments.length && `komentar: ${comments.join(" / ")}`, text && `teks: ${text}`,
    colors.length && `warna: ${colors.join(" ")}`, words.length && `elemen: ${words.join(", ")}`].filter(Boolean).join("; ") || "(tidak ada petunjuk)";
}
