// Stock metadata rules + CSV builders, the same rules as the owner's Mac pipeline (aset.js meta / platforms.py):
// title 5+ words, ≤70 characters, no comma; exactly 40 keywords of a-z 0-9 space hyphen, most important first;
// no trademarks (lib/brands.js); file name ≤30 characters a-z0-9- including the extension.
// CSV formats = platforms.py: Adobe (Filename,Title,Keywords,Category,Releases), Shutterstock (Filename,Description,
// Keywords,Categories,Illustration,Mature Content,Editorial; never AI-generated content), Vecteezy (Filename without
// extension,Title,Description,Keywords ≤30 comma-joined,License pro). Pure: safe in the browser and on the server.
import { BRAND_RE, brandHits } from "./brands.js";

export const KW_COUNT = 40;
export const TITLE_MAX = 70;

export const ADOBE_CATS = { 1: "Animals", 2: "Buildings and Architecture", 3: "Business", 4: "Drinks", 5: "The Environment", 6: "States of Mind",
  7: "Food", 8: "Graphic Resources", 9: "Hobbies and Leisure", 10: "Industry", 11: "Landscapes", 12: "Lifestyle", 13: "People", 14: "Plants and Flowers",
  15: "Culture and Religion", 16: "Science", 17: "Social Issues", 18: "Sports", 19: "Technology", 20: "Transport", 21: "Travel" };

export const SS_CATS = ["Abstract", "Animals/Wildlife", "Arts", "Backgrounds/Textures", "Beauty/Fashion", "Buildings/Landmarks", "Business/Finance",
  "Celebrities", "Education", "Food and drink", "Healthcare/Medical", "Holidays", "Industrial", "Interiors", "Miscellaneous", "Nature", "Objects",
  "Parks/Outdoor", "People", "Religion", "Science", "Signs/Symbols", "Sports/Recreation", "Technology", "Transportation", "Vintage"];

export const cleanKeyword = (k) => { const s = String(k ?? "").toLowerCase().replace(/[^a-z0-9 -]+/g, " ").replace(/\s+/g, " ").trim(); return /^-*$/.test(s) ? "" : s; };

// Normalize what a model returned: trims, dedupes, strips brands and bad characters. Does not invent keywords.
export function normalizeMeta(m) {
  const title = String(m?.title ?? "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const seen = new Set(), keywords = [];
  for (const raw of Array.isArray(m?.keywords) ? m.keywords : String(m?.keywords ?? "").split(",")) {
    const k = cleanKeyword(raw);
    if (!k || seen.has(k) || BRAND_RE.test(k)) continue;
    seen.add(k); keywords.push(k);
  }
  const cat = Number(m?.adobe_category ?? m?.adobeCategory);
  const ss = (Array.isArray(m?.shutterstock_categories ?? m?.ssCategories) ? (m.shutterstock_categories ?? m.ssCategories) : [])
    .map((c) => SS_CATS.find((s) => s.toLowerCase() === String(c).toLowerCase())).filter(Boolean);
  return { title: title.charAt(0).toUpperCase() + title.slice(1), keywords, adobeCategory: ADOBE_CATS[cat] ? cat : null, ssCategories: [...new Set(ss)].slice(0, 2) };
}

// null when the metadata is ready for the CSVs, else the problem (Indonesian; also sent back to the model).
export function metaError(m) {
  if (!m.title) return "judul kosong";
  if (m.title.length > TITLE_MAX) return `judul ${m.title.length} karakter (maks ${TITLE_MAX})`;
  if (m.title.split(/\s+/).length < 5) return "judul kurang dari 5 kata";
  const b = brandHits(m.title);
  if (b.length) return `judul memuat merek: ${b.join(", ")}`;
  if (m.keywords.length < KW_COUNT) return `keyword hanya ${m.keywords.length} yang valid (perlu tepat ${KW_COUNT}, unik, tanpa merek)`;
  if (!m.adobeCategory) return "kategori Adobe (angka 1-21) tidak valid";
  if (!m.ssCategories.length) return "kategori Shutterstock tidak valid";
  return null;
}

// Trim to exactly 40 once valid.
export const finalMeta = (m) => ({ ...m, keywords: m.keywords.slice(0, KW_COUNT) });

// File name ≤30 characters including the extension, a-z0-9-.
export function stockFilename(name, ext = "mp4") {
  const room = 30 - ext.length - 1;
  const base = String(name || "video").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, room).replace(/-+$/, "");
  return `${base || "video"}.${ext}`;
}

const cell = (v) => {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

// rows: [{ filename, title, keywords[], adobeCategory, ssCategories[], ai, kind ("video"|"image"|"vector") }]
export function adobeCsv(rows) {
  return csv([["Filename", "Title", "Keywords", "Category", "Releases"], ...rows.map((r) => [r.filename, r.title, r.keywords.join(", "), r.adobeCategory, ""])]);
}
export function shutterstockCsv(rows) {
  const ok = rows.filter((r) => !r.ai);
  return csv([["Filename", "Description", "Keywords", "Categories", "Illustration", "Mature Content", "Editorial"],
    ...ok.map((r) => [r.filename, r.title, r.keywords.slice(0, 50).join(", "), r.ssCategories.join(","), r.kind === "vector" ? "Yes" : "No", "No", "No"])]);
}
export function vecteezyCsv(rows) {
  return csv([["Filename", "Title", "Description", "Keywords", "License"],
    ...rows.map((r) => [r.filename.replace(/\.[a-z0-9]+$/, ""), r.title, r.title, [...new Set(r.keywords.map((k) => k.replace(/-/g, " ")))].slice(0, 30).join(","), "pro"])]);
}
