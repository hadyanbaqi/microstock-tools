"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import AssetModal from "./AssetModal";
import { ago, downloadCsv, fmt, fmtDate, fmtVel, slug, store } from "./util";
import { typeLabel } from "@/lib/contentTypes";
import { FilterPill } from "./ui";

const VIEW_KEY = "stockscope:view";
const PAGE = 24;
// Sort values offered in the dropdown; other combinations come from clicking table headers.
const SORT_OPTIONS = ["dlPerMonth:-1", "downloads:-1", "ageMonths:1", "ageMonths:-1", "conversion:-1", "views:-1", "downloads:1"];
const KW_SHOW = 6; // keywords on a card; the detail modal shows all
const AGES = {
  all: ["Semua umur", () => true],
  "0-6": ["≤ 6 bulan", (m) => m !== null && m <= 6],
  "6-12": ["6–12 bulan", (m) => m !== null && m > 6 && m <= 12],
  "12-24": ["1–2 tahun", (m) => m !== null && m > 12 && m <= 24],
  "24+": ["> 2 tahun", (m) => m !== null && m > 24],
};
export const EMPTY_FILTERS = { text: "", type: "", orientation: "", ai: "all", age: "all", minDl: "", category: "", creator: "" };

const creatorKey = (a) => String(a.creatorId ?? a.creator);
// Performance score → tier (same thresholds as the opportunity score colours).
const tier = (p) => (p >= 60 ? ["hi", "Cepat laku"] : p >= 35 ? ["mid", "Sedang"] : ["lo", "Lambat"]);
const adobeContributorUrl = (id) => `https://stock.adobe.com/contributor/${id}`;

// Filterable list of the fetched assets, as cards (thumbnail, contributor, title, keywords) or a table.
export default function AssetList({ data, filters, setFilters, initialSort, onCreator, hideCreator }) {
  const [sort, setSort] = useState({ key: initialSort ?? "dlPerMonth", dir: -1 });
  const [view, setView] = useState("grid");
  const [limit, setLimit] = useState(PAGE);
  const [detail, setDetail] = useState(null);
  const closeDetail = useCallback(() => setDetail(null), []);

  useEffect(() => { const v = store(VIEW_KEY); if (v) setView(v); }, []);
  useEffect(() => setLimit(PAGE), [filters, sort]);
  const changeView = (v) => { setView(v); store(VIEW_KEY, v); };
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const setV = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));

  const creators = useMemo(() => {
    const m = new Map();
    for (const a of data.assets) {
      const e = m.get(creatorKey(a)) ?? { key: creatorKey(a), name: a.creator, n: 0 };
      e.n++;
      m.set(e.key, e);
    }
    return [...m.values()].sort((x, y) => y.n - x.n);
  }, [data]);

  const assets = useMemo(() => {
    const q = filters.text.toLowerCase().trim();
    const min = Number(filters.minDl) || 0;
    const ageOk = AGES[filters.age]?.[1] ?? AGES.all[1];
    return data.assets
      .filter((a) => !filters.type || a.type === filters.type)
      .filter((a) => !filters.orientation || a.orientation === filters.orientation)
      .filter((a) => filters.ai === "all" || (filters.ai === "ai") === a.isAI)
      .filter((a) => ageOk(a.ageMonths))
      .filter((a) => a.downloads >= min)
      .filter((a) => !filters.category || a.category === filters.category)
      .filter((a) => !filters.creator || creatorKey(a) === filters.creator)
      .filter((a) => !q || a.title.toLowerCase().includes(q) || a.keywords.some((k) => k.includes(q)))
      // Missing values (e.g. unknown age) always sort last.
      .sort((a, b) => {
        const x = a[sort.key], y = b[sort.key];
        if (x == null) return 1;
        if (y == null) return -1;
        return (x - y) * sort.dir;
      });
  }, [data, filters, sort]);

  const active = Object.entries(filters).filter(([k, v]) => v !== EMPTY_FILTERS[k]).length;
  const sortBy = (key) => setSort((p) => ({ key, dir: p.key === key ? -p.dir : -1 }));
  const arrow = (key) => (sort.key === key ? (sort.dir < 0 ? " ↓" : " ↑") : "");
  const filterCreator = (a) => setFilters((f) => ({ ...f, creator: f.creator === creatorKey(a) ? "" : creatorKey(a) }));

  function exportCsv() {
    const head = ["id", "judul", "jenis", "kontributor", "creator_id", "kategori", "ai", "dibuat", "download", "views", "konversi_%", "dl_per_bulan", "orientasi", "ukuran", "keywords", "url"];
    const rows = assets.map((a) => [a.id, a.title, typeLabel(a.type), a.creator, a.creatorId, a.category, a.isAI ? "ya" : "tidak", a.created, a.downloads, a.views ?? "", a.conversion ?? "", a.dlPerMonth, a.orientation ?? "", a.size ?? "", a.keywords.join(", "), a.url]);
    downloadCsv([head, ...rows], `riset-${slug(data.params?.query || data.params?.creatorId)}.csv`);
  }

  const shown = assets.slice(0, limit);

  return (
    <div className="panel">
      <h2>
        Aset teratas <small className="muted">{assets.length} dari {data.assets.length}</small>
        <span className="btns">
          <span className="seg">
            <button className={view === "grid" ? "on" : ""} onClick={() => changeView("grid")}>Galeri</button>
            <button className={view === "table" ? "on" : ""} onClick={() => changeView("table")}>Tabel</button>
          </span>
          <button onClick={exportCsv}>Ekspor CSV</button>
        </span>
      </h2>

      <div className="ftoolbar results-filters" role="group" aria-label="Saring hasil (gratis)">
        <input className="fpill-input grow" aria-label="Cari di judul atau keyword" placeholder="Cari di judul/keyword…" value={filters.text} onChange={set("text")} />
        <FilterPill label="Urutkan" value={`${sort.key}:${sort.dir}`} def="dlPerMonth:-1"
          onChange={(v) => { const [key, dir] = v.split(":"); setSort({ key, dir: Number(dir) }); }}
          options={[
            ["dlPerMonth:-1", "Laku sekarang"],
            ...(!SORT_OPTIONS.includes(`${sort.key}:${sort.dir}`) ? [[`${sort.key}:${sort.dir}`, "Dari kolom tabel"]] : []),
            ["downloads:-1", "Total download"],
            ["ageMonths:1", "Terbaru"],
            ["ageMonths:-1", "Terlama"],
            ...(data.summary.conversion != null ? [["conversion:-1", "Konversi tertinggi"], ["views:-1", "Paling dilihat"]] : []),
            ["downloads:1", "Download paling sedikit"],
          ]} />
        {data.types?.length > 1 && (
          <FilterPill label="Jenis" value={filters.type} def="" onChange={setV("type")}
            options={[["", "Semua"], ...data.types.map((t) => [t.type, `${typeLabel(t.type)} (${t.count})`])]} />
        )}
        {data.orientations?.length > 0 && (
          <FilterPill label="Orientasi" value={filters.orientation} def="" onChange={setV("orientation")}
            options={[["", "Semua"], ...data.orientations.map((o) => [o.name, `${o.name} (${o.count})`])]} />
        )}
        <FilterPill label="AI" value={filters.ai} def="all" onChange={setV("ai")} options={[["all", "Semua"], ["ai", "Hanya AI"], ["human", "Non-AI"]]} />
        <FilterPill label="Umur" value={filters.age} def="all" onChange={setV("age")} options={Object.entries(AGES).map(([k, [label]]) => [k, k === "all" ? "Semua" : label])} />
        <FilterPill label="Kategori" value={filters.category} def="" onChange={setV("category")}
          options={[["", "Semua"], ...data.categories.map((c) => [c.name, `${c.name} (${c.assets})`])]} />
        {!hideCreator && (
          <FilterPill label="Kontributor" value={filters.creator} def="" onChange={setV("creator")}
            options={[["", "Semua"], ...creators.map((c) => [c.key, `${c.name} (${c.n})`])]} />
        )}
        <input className="fpill-input num" type="number" min="0" inputMode="numeric" aria-label="Minimal download" placeholder="Min. download" value={filters.minDl} onChange={set("minDl")} />
        {active > 0 && <button type="button" className="freset" onClick={() => setFilters(EMPTY_FILTERS)}>Reset ({active})</button>}
      </div>

      {assets.length === 0 && <p className="hint">Tidak ada aset yang cocok dengan filter ini.</p>}

      {view === "grid" ? (
        <div className="cards">
          {shown.map((a) => (
            <article key={a.id} className="card">
              <button type="button" className="card-thumb" style={thumbStyle(a)} onClick={() => setDetail(a)} aria-label={`Detail: ${a.title}`}>
                {a.thumb && <img src={a.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                <span className="badges">
                  {a.type && a.type !== "unknown" && <span className="tag type">{typeLabel(a.type)}</span>}
                  {a.isAI && <span className="tag ai">AI</span>}
                  {a.ageMonths !== null && a.ageMonths <= 12 && <span className="tag new">Baru</span>}
                </span>
              </button>
              <div className="card-body">
                <div className="field-head"><span className="field-label">Judul</span>
                  <button type="button" className="linkish small" onClick={() => setDetail(a)}>Lihat semua</button>
                </div>
                <p className="card-title" title={a.title}>{a.title || "(tanpa judul)"}</p>

                <div className="highlight">
                  <div className="hl-main" title="Kecepatan jual: total download dibagi umur aset (bulan)">
                    <small>Kecepatan jual</small>
                    <b>~{fmtVel(a.dlPerMonth)}<span className="unit">dl/bln</span></b>
                  </div>
                  <div className="hl-side"><small>Total dl</small><b>{fmt(a.downloads)}</b></div>
                </div>
                <div className={`perf perf-${tier(a.performance)[0]}`} title="Skor performa 0–100 dari kecepatan jual (skala log)">
                  <span className="perf-badge">{a.performance}<small>/100</small></span>
                  <span className="perf-text">{tier(a.performance)[1]}</span>
                  <span className="perf-bar"><i style={{ width: `${a.performance}%` }} /></span>
                </div>

                <div className="meta-tags">
                  <span className="mtag" title="Kategori">{a.category}</span>
                  {a.type && a.type !== "unknown" && <span className="mtag" title="Jenis">{typeLabel(a.type)}</span>}
                  <span className="mtag" title="Tanggal upload">📅 {fmtDate(a.created)}{a.ageMonths != null && <span className="muted"> · {ago(a.ageMonths)}</span>}</span>
                </div>
                {!hideCreator && (
                  <div className="card-owner">
                    <span className="muted">oleh</span>
                    {a.creatorId
                      ? <button type="button" className="linkish" onClick={() => onCreator(a.creatorId)} title="Lacak kontributor ini">{a.creator}</button>
                      : <span>{a.creator}</span>}
                    <button type="button" className={`mini filter-btn ${filters.creator === creatorKey(a) ? "on" : ""}`} onClick={() => filterCreator(a)} title="Tampilkan aset kontributor ini saja">saring</button>
                  </div>
                )}

                <div className="field-head"><span className="field-label">Keyword</span><small className="muted">{a.keywords.length}</small></div>
                <div className="chips small-chips">
                  {a.keywords.slice(0, KW_SHOW).map((k) => (
                    <span key={k} className="chip static">{k}</span>
                  ))}
                  {a.keywords.length > KW_SHOW && (
                    <button type="button" className="chip more" onClick={() => setDetail(a)}>+{a.keywords.length - KW_SHOW}</button>
                  )}
                </div>

                <button type="button" className="card-detail" onClick={() => setDetail(a)}>Detail lengkap</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th></th><th>Judul · kontributor · keyword</th>
                <th className="num" onClick={() => sortBy("downloads")}>Download{arrow("downloads")}</th>
                <th className="num" onClick={() => sortBy("dlPerMonth")}>Dl/bln{arrow("dlPerMonth")}</th>
                <th className="num" onClick={() => sortBy("ageMonths")}>Umur{arrow("ageMonths")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id}>
                  <td><button type="button" className="thumb-btn" onClick={() => setDetail(a)} aria-label={`Detail: ${a.title}`}>{a.thumb ? <img className="thumb" src={a.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="thumb" style={thumbStyle(a)} />}</button></td>
                  <td>
                    <button type="button" className="linkish title-btn" onClick={() => setDetail(a)}>{a.title || "(tanpa judul)"}</button>
                    {a.type && a.type !== "unknown" && <span className="tag type">{typeLabel(a.type)}</span>}
                    {a.isAI && <span className="tag ai">AI</span>}
                    {a.ageMonths !== null && a.ageMonths <= 12 && <span className="tag new">Baru</span>}
                    <div className="muted" style={{ fontSize: 12 }}>
                      <button className="linkish" onClick={() => filterCreator(a)}>{a.creator}</button> · {a.category} · {a.created}
                    </div>
                    <div className="muted kwline" title={a.keywords.join(", ")}>{a.keywords.slice(0, 12).join(", ")}{a.keywords.length > 12 ? ` +${a.keywords.length - 12}` : ""}</div>
                  </td>
                  <td className="num">{fmt(a.downloads)}</td>
                  <td className="num">{a.dlPerMonth}</td>
                  <td className="num">{a.ageMonths ?? "-"} bln</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <AssetModal asset={detail} onClose={closeDetail}
          onCreator={onCreator} hideCreator={hideCreator} thumbStyle={thumbStyle} />
      )}

      {assets.length > limit && (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button onClick={() => setLimit((l) => l + PAGE)}>Tampilkan lebih banyak ({assets.length - limit} lagi)</button>
        </div>
      )}
    </div>
  );
}

// Placeholder tint when there is no thumbnail (e.g. demo mode).
function thumbStyle(a) {
  const hue = Number(String(a.id).slice(-3)) % 360;
  return { background: `linear-gradient(135deg, hsl(${hue} 45% 70%), hsl(${(hue + 40) % 360} 45% 55%))` };
}
