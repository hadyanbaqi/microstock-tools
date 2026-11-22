"use client";
import { CONTENT_TYPES, typeInfo } from "@/lib/contentTypes";
import { COST_PER_100 } from "@/lib/themes";
import { FilterPill } from "./ui";

// Actor "Sort By" options. relevance/downloads/newest are confirmed; recent/featured/undiscovered
// follow the actor's labels and are unverified. "trending" is ours (see apiOrder in util.js).
const SORTS = [
  ["downloads", "Terlaris"],
  ["trending", "Sedang naik"],
  ["newest", "Terbaru"],
  ["relevance", "Relevansi"],
  ["recent", "Terkini"],
  ["featured", "Unggulan Adobe"],
  ["undiscovered", "Belum terjamah"],
];
const SORT_HINTS = {
  trending: "Sedang naik: aset terbaru, lalu diurutkan dari yang paling cepat laku.",
  undiscovered: "Belum terjamah: aset bagus yang jarang dilihat, cocok mencari celah niche.",
  featured: "Unggulan Adobe: pilihan kurasi, contoh gaya yang disukai reviewer.",
  newest: "Terbaru: lihat apa yang sedang di-upload kontributor lain.",
};
const TYPES = [["all", "Semua (sering hanya foto)"], ...CONTENT_TYPES.map((t) => [t.id, t.label])];
const AI = [["", "Semua"], ["only", "Hanya AI"], ["exclude", "Tanpa AI"]];
const MAX = [30, 60, 100, 200, 300].map((v) => [v, `${v} aset`]);

// Search filters sent to Apify, as one compact row of pills (type, sort, AI, sample size) + the cost.
export default function SearchFilters({ form, setForm }) {
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: k === "maxItems" ? Number(v) : v }));
  const cost = String(+((form.maxItems * COST_PER_100) / 100).toFixed(2)).replace(".", ",");
  const hint = SORT_HINTS[form.order] ?? (form.asset !== "all" ? typeInfo(form.asset)?.tip
    : "Jenis “Semua”: kalau hasilnya hanya foto, pilih Vektor, Ilustrasi, atau Video untuk melihat format lain.");
  return (
    <div className="ftoolbar-wrap">
      <div className="ftoolbar" role="group" aria-label="Filter pencarian">
        <FilterPill label="Jenis" value={form.asset} def="vector" onChange={set("asset")} options={TYPES} />
        <FilterPill label="Urutkan" value={form.order} def="downloads" onChange={set("order")} options={SORTS} />
        <FilterPill label="AI" value={form.ai} def="" onChange={set("ai")} options={AI} />
        <FilterPill label="Jumlah" value={form.maxItems} def={60} onChange={set("maxItems")} options={MAX} />
        <span className="fcost" title="Perkiraan biaya Apify bila data belum tersimpan">≈ ${cost} · tersimpan permanen</span>
      </div>
      {hint && <p className="hint ftoolbar-hint">{hint}</p>}
    </div>
  );
}
