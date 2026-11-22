// Themes scanned by "Perbarui tren" (Tren Keyword). Queries are English because Adobe Stock metadata is.
export const THEMES = [
  { id: "bisnis", label: "Bisnis", query: "business" },
  { id: "teknologi", label: "Teknologi & AI", query: "technology" },
  { id: "kesehatan", label: "Kesehatan", query: "healthcare medical" },
  { id: "makanan", label: "Makanan", query: "food" },
  { id: "alam", label: "Alam", query: "nature landscape" },
  { id: "keluarga", label: "Gaya hidup & keluarga", query: "lifestyle family" },
  { id: "pendidikan", label: "Pendidikan", query: "education" },
  { id: "keuangan", label: "Keuangan", query: "finance money" },
  { id: "latar", label: "Latar & tekstur", query: "background texture" },
  { id: "liburan", label: "Liburan & musiman", query: "holiday celebration" },
  { id: "fashion", label: "Kecantikan & fashion", query: "beauty fashion" },
  { id: "olahraga", label: "Olahraga", query: "sport fitness" },
  { id: "perjalanan", label: "Perjalanan", query: "travel" },
  { id: "industri", label: "Industri", query: "industry construction" },
  { id: "lingkungan", label: "Lingkungan", query: "sustainability environment" },
];

export const themeById = (id) => THEMES.find((t) => t.id === id);

// Per theme, three samples of 40: newest uploads (supply), all-time best-sellers (demand) and the most relevant
// assets (Adobe ranks recent sellers high here, so new assets that already sell show up for the "naik" label).
export const PER_ORDER = 40;
export const ITEMS_PER_THEME = PER_ORDER * 3;
// Apify actor price used for estimates shown to users: kawsar/adobe-stock-scraper, $0.60 per 1.000 results on the
// free plan (+ ±$0.0007 per run) ≈ $0.06 per 100 assets.
export const COST_PER_100 = 0.06;
export const SCAN_COST = +((THEMES.length * ITEMS_PER_THEME * COST_PER_100) / 100).toFixed(2);
