"use client";
import { useMemo, useState } from "react";
import AssetList, { EMPTY_FILTERS } from "./AssetList";
import BriefCard from "./BriefCard";
import { CopyButton, Heatmap, Meter, Spark, Stat, SubTabs, Treemap, scoreColor } from "./ui";
import { keywordList, titleIdeas, TITLE_MAX } from "@/lib/metadataIdeas";
import { fmt, fmtVel } from "./util";
import { typeLabel } from "@/lib/contentTypes";

const PART_LABELS = {
  demand: ["Permintaan", "rata-rata download aset teratas"],
  momentum: ["Momentum", "kecepatan jual aset ≤12 bulan"],
  freshness: ["Ruang aset baru", "porsi aset baru di daftar teratas"],
  openness: ["Keterbukaan", "download tidak dikuasai 5 kontributor"],
};

// Niche research, grouped by question:
// Ringkasan = is this niche worth it? · Aset = what sells? · Keyword = how to tag it? · Kompetisi = who owns it?
export default function NicheReport({ data, initialSort, initialTab = "overview", onCreator, onResearch }) {
  const [tab, setTab] = useState(initialTab);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const s = data.summary;

  const toggleFilter = (key, v) => { setFilters((f) => ({ ...f, [key]: f[key] === v ? "" : v })); setTab("assets"); };
  const maxCat = data.categories?.[0]?.downloads || 1;
  const maxBucket = Math.max(1, ...(data.ageBuckets ?? []).map((b) => b.avgVelocity));
  const query = data.params?.query;
  const ideas = useMemo(() => contentIdeas(data), [data]);

  return (
    <>
      <div className="report-head">
        <div>
          <h2 className="report-title">“{query}”</h2>
          <p className="hint" style={{ margin: 0 }}>{s.count} aset teratas · {s.verdict?.text}</p>
        </div>
        <SubTabs value={tab} onChange={setTab} tabs={[
          ["assets", "Aset", data.assets.length],
          ["overview", "Ringkasan"],
          ["keywords", "Keyword"],
          ["competition", "Kompetisi"],
        ]} />
      </div>

      {tab === "overview" && (
        <>
          <BriefCard data={data} onCreator={onCreator} />
          <div className="stats">
            <Stat big label="Skor peluang" value={s.opportunityScore} color={scoreColor(s.opportunityScore)} note="dari 100" />
            <Stat label="Kecepatan jual rata-rata" value={`${fmtVel(s.avgVelocity)}/bln`} note={`rata-rata ${fmt(s.avgDownloads)} total dl per aset`} />
            <Stat label="Aset baru (≤12 bln)" value={`${s.recentCount}/${s.count}`} note={`${s.avgRecentVelocity} dl/bln rata-rata`} />
            <Stat label="Konten AI" value={`${s.aiShare}%`} note="dari aset teratas" />
            {s.conversion != null && <Stat label="Konversi" value={`${s.conversion}%`} note="download per 100 views" />}
          </div>

          <CategoryTrend data={data} onPick={(c) => toggleFilter("category", c)} />

          <div className="grid3">
            <div className="panel">
              <h2>Komponen skor</h2>
              {Object.entries(s.scoreParts ?? {}).map(([k, v]) => (
                <Meter key={k} label={PART_LABELS[k]?.[0] ?? k} title={PART_LABELS[k]?.[1]} value={v} pct={v} />
              ))}
              {s.aiShare > 0 && <p className="hint">Skor dikurangi hingga 30% sesuai porsi konten AI.</p>}
            </div>
            <div className="panel">
              <h2>Insight</h2>
              {data.insights?.length ? (
                <ul className="insights">{data.insights.map((i, n) => <li key={n} className={i.type}>{i.text}</li>)}</ul>
              ) : <p className="hint">Tidak ada pola menonjol di sampel ini.</p>}
            </div>
            <div className="panel">
              <h2>Kecepatan jual per umur</h2>
              {data.ageBuckets?.map((b) => (
                <Meter key={b.label} label={b.label} count={b.count} value={`${b.avgVelocity} dl/bln`} pct={(b.avgVelocity / maxBucket) * 100} />
              ))}
              <p className="hint">Aset ≤12 bulan yang terjual cepat = pasar masih menerima pendatang baru.</p>
            </div>
          </div>

          <div className="grid3">
            <div className="panel">
              <h2>AI vs non-AI</h2>
              <GroupTable rows={[["AI", data.aiVsHuman?.ai], ["Non-AI", data.aiVsHuman?.human]].map(([l, g]) => ({ key: l, label: l, ...g }))} />
            </div>
            {data.types?.length > 0 && (
              <div className="panel">
                <h2>Format terlaris <small className="muted">klik → lihat aset</small></h2>
                <GroupTable share rows={data.types.map((t) => ({ key: t.type, label: typeLabel(t.type), ...t }))}
                  active={filters.type} onPick={(k) => toggleFilter("type", k)} />
              </div>
            )}
            {data.orientations?.length > 0 && (
              <div className="panel">
                <h2>Orientasi <small className="muted">klik → lihat aset</small></h2>
                <GroupTable share rows={data.orientations.map((o) => ({ key: o.name, label: o.name, ...o }))}
                  active={filters.orientation} onPick={(k) => toggleFilter("orientation", k)} />
              </div>
            )}
          </div>

          <div className="panel">
            <h2>Kapan aset teratas dibuat <small className="muted">12 bulan terakhir</small></h2>
            <Spark data={data.uploads} />
          </div>
        </>
      )}

      {/* "Semua jenis" that came back as a single type: the actor may default to that type when none is chosen. */}
      {data.params?.asset === "all" && data.types?.length === 1 && data.assets.length >= 20 && (
        <div className="notice warn-type">
          <span>Semua {data.assets.length} aset di hasil “Semua jenis” ini adalah <b>{typeLabel(data.types[0].type)}</b>. Apify kemungkinan hanya mengambil jenis ini bila jenis konten tidak dipilih, jadi format lain belum terwakili.</span>
          <span className="btns">
            {["vector", "illustration", "video"].filter((t) => t !== data.types[0].type).map((t) => (
              <button key={t} type="button" className="mini" onClick={() => onResearch(query, t)}>Cari sebagai {typeLabel(t)}</button>
            ))}
          </span>
        </div>
      )}

      {tab === "assets" && (
        <AssetList data={data} filters={filters} setFilters={setFilters} initialSort={initialSort}
          onCreator={onCreator} />
      )}

      {tab === "keywords" && (
        <div className="grid2">
          <div className="main-col">
            <div className="panel">
              <h2>
                Keyword terlaris <small className="muted">berbobot aset ≤2 tahun · % = porsi aset yang memakainya · ▲ naik / ▼ turun di aset baru</small>
              </h2>
              <div className="chips">
                {data.keywords.map((k) => (
                  <span key={k.keyword} className="chip static"
                    title={`${k.count} aset (${k.share}%) · ${fmt(k.downloads)} dl · ${k.avgVelocity} dl/bln`}>
                    {k.keyword} <small>{k.share}%</small>{k.trend === "naik" && <span className="kw-up" title="lebih sering dipakai aset ≤2 tahun">▲</span>}{k.trend === "turun" && <span className="kw-down" title="lebih jarang dipakai aset baru">▼</span>}
                  </span>
                ))}
              </div>
              <div className="btns" style={{ marginTop: 14 }}>
                <CopyButton label="Salin 25 teratas" text={data.keywords.slice(0, 25).map((k) => k.keyword).join(", ")} />
                <CopyButton label="Salin 49 teratas (maks Adobe)" text={data.keywords.slice(0, 49).map((k) => k.keyword).join(", ")} />
              </div>
            </div>
            <MetadataPanel data={data} />
            {data.titlePhrases?.length > 0 && (
              <div className="panel">
                <h2>Frasa judul terlaris <small className="muted">dipakai di judul 30 aset teratas</small></h2>
                <div className="chips">{data.titlePhrases.map((p) => <span key={p.phrase} className="chip" style={{ cursor: "default" }}>{p.phrase} <small>{p.count}×</small></span>)}</div>
              </div>
            )}
          </div>
          <div className="side">
            {ideas.length > 0 && (
              <div className="panel">
                <h2>Ide konten <small className="muted">sub-niche dari data · klik untuk riset</small></h2>
                <div className="ideas">
                  {ideas.map((i) => (
                    <button key={i.query} type="button" className="niche" onClick={() => onResearch(i.query)}>
                      <b>{i.query}</b><small className="muted">{i.why}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {data.goldenKeywords?.length > 0 && (
              <div className="panel">
                <h2>Keyword emas</h2>
                <table><tbody>
                  {data.goldenKeywords.map((k) => (
                    <tr key={k.keyword}>
                      <td><span className="chip static">{k.keyword}</span></td>
                      <td className="num">{k.share}%</td>
                      <td className="num">{k.avgVelocity} dl/bln</td>
                    </tr>
                  ))}
                </tbody></table>
                <p className="hint">Jarang dipakai (≤25% aset) tapi asetnya terjual lebih cepat dari rata-rata niche ({s.avgVelocity} dl/bln).</p>
              </div>
            )}
            <div className="panel">
              <h2>Kategori <small className="muted">klik → lihat aset</small></h2>
              {data.categories.map((c) => (
                <Meter key={c.name} label={c.name} count={c.assets} value={fmt(c.downloads)} pct={(c.downloads / maxCat) * 100}
                  active={filters.category === c.name} onClick={() => toggleFilter("category", c.name)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "competition" && (
        <>
          <div className="stats">
            <Stat label="Dominasi top 5" value={`${s.dominance}%`} note="porsi download" />
            <Stat label="Kontributor di sampel" value={s.creatorCount} note={`dari ${s.count} aset`} />
            <Stat label="Keterbukaan" value={s.scoreParts?.openness ?? "-"} note="komponen skor (0–100)" />
          </div>
          <div className="panel">
            <h2>Kontributor dominan <small className="muted">klik “Lacak” untuk membedah portofolionya</small></h2>
            <div className="scroll">
              <table>
                <thead><tr><th>Kontributor</th><th className="num">Aset di niche</th><th className="num">Download</th><th className="num">Porsi</th><th className="num">AI</th><th></th></tr></thead>
                <tbody>
                  {data.topCreators.map((c) => (
                    <tr key={c.id ?? c.name}>
                      <td>{c.name}</td>
                      <td className="num">{c.assets}</td>
                      <td className="num">{fmt(c.downloads)}</td>
                      <td className="num">{c.share}%</td>
                      <td className="num">{c.assets ? Math.round((c.ai / c.assets) * 100) : 0}%</td>
                      <td className="num">{c.id && <button type="button" className="mini" onClick={() => onCreator(c.id)}>Lacak →</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function GroupTable({ rows, share, active, onPick }) {
  return (
    <table className="typetable">
      <thead><tr><th></th><th className="num">Aset</th><th className="num">Dl/bln</th><th className="num">{share ? "Porsi dl" : "Avg dl"}</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className={onPick ? `clickable ${active === r.key ? "on" : ""}` : ""} onClick={onPick ? () => onPick(r.key) : undefined}>
            <td style={{ textTransform: "capitalize" }}>{r.label}</td>
            <td className="num">{r.count ?? 0}</td>
            <td className="num">{r.avgVelocity ?? 0}</td>
            <td className="num">{share ? `${r.share}%` : fmt(r.avgDownloads)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Sub-niche ideas built only from this search's data: fast-selling but rarely used keywords,
// best-selling title phrases and categories where new assets still sell.
function contentIdeas(data) {
  const q = (data.params?.query ?? "").toLowerCase().trim();
  const words = new Set(q.split(/\s+/));
  // Query + only the words it doesn't already contain ("coffee shop" + "shop minimal" → "coffee shop minimal").
  const extend = (extra) => {
    const add = String(extra).toLowerCase().split(/\s+/).filter((w) => w && !words.has(w)).join(" ");
    return add ? `${q} ${add}`.trim() : null;
  };
  const out = new Map();
  const add = (query, why) => { if (query && !out.has(query) && out.size < 8) out.set(query, { query, why }); };
  for (const k of data.goldenKeywords ?? []) add(extend(k.keyword), `keyword emas · ${k.avgVelocity} dl/bln`);
  for (const r of data.heatmap?.rows ?? []) if (r.trend === "memanas") add(extend(r.category), `kategori ${r.category} sedang memanas`);
  for (const p of data.titlePhrases ?? []) add(extend(p.phrase), `frasa judul terlaris (${p.count}×)`);
  return [...out.values()];
}

const TREND_TEXT = { memanas: "▲ memanas", mendingin: "▼ mendingin", stabil: "stabil" };
const tone = (t) => (t.others ? "other" : t.trend === "memanas" ? (t.ratio == null || t.ratio >= 2.5 ? "hot2" : "hot")
  : t.trend === "mendingin" ? (t.ratio != null && t.ratio <= 0.4 ? "cold2" : "cold") : "flat");

// Which categories sell, and are they heating up? Treemap (size = share of sales speed, colour = trend)
// or heatmap (category × upload age, oldest → newest).
function CategoryTrend({ data, onPick }) {
  const [view, setView] = useState("map");
  const hm = data.heatmap;
  if (!hm?.rows?.length) return null;
  const tiles = (hm.tiles ?? []).map((t) => ({
    key: t.category, label: t.others ? `Lainnya (${t.others})` : t.category, value: t.velocity, tone: tone(t), pickable: !t.others,
    sub: `${String(t.share).replace(".", ",")}% · ${TREND_TEXT[t.trend]}${t.ratio != null ? ` ${String(t.ratio).replace(".", ",")}×` : ""}`,
    title: `${t.others ? `${t.others} kategori lain` : t.category}: ${String(t.share).replace(".", ",")}% dari kecepatan jual sampel, ${t.assets} aset, rata-rata ${t.avgVelocity} dl/bln`
      + (t.ratio != null ? `. Aset ≤12 bln terjual ${String(t.ratio).replace(".", ",")}× dibanding aset lama.` : "."),
  }));
  const hot = (hm.tiles ?? []).filter((t) => t.trend === "memanas" && !t.others).slice(0, 3).map((t) => t.category);
  return (
    <div className="panel">
      <div className="panel-head">
        <h2 style={{ margin: 0 }}>Tren kategori <small className="muted">kategori mana yang laku, dan sedang naik atau turun</small></h2>
        <div className="seg" role="tablist" aria-label="Tampilan tren kategori">
          {[["map", "Peta kategori"], ["time", "Per waktu upload"]].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
      </div>
      {hot.length > 0 && <p className="trend-callout"><span className="dot" aria-hidden="true" /><span>Sedang naik: <b>{hot.join(", ")}</b>. Aset baru di kategori ini terjual lebih cepat daripada aset lamanya.</span></p>}
      {view === "map" && !tiles.length ? (
        <p className="hint">Peta kategori butuh tanggal upload aset untuk menghitung kecepatan jual, dan data ini tidak memilikinya.</p>
      ) : view === "map" ? (
        <>
          <Treemap tiles={tiles} onPick={onPick} />
          <div className="tm-legend" aria-hidden="true">
            <span><i className="tile-swatch hot2" />memanas kuat</span><span><i className="tile-swatch hot" />memanas</span>
            <span><i className="tile-swatch flat" />stabil</span><span><i className="tile-swatch cold" />mendingin</span>
            <span className="muted">· luas kotak = porsi kecepatan jual (dl/bln) · klik → lihat aset</span>
          </div>
        </>
      ) : (
        <>
          <Heatmap cols={hm.cols} max={hm.max} format={(v) => (v ? v.toFixed(v < 10 ? 1 : 0) : "·")}
            rows={hm.rows.map((r) => ({ key: r.category, label: r.category, trend: r.trend,
              values: r.cells.map((c) => (c.count ? c.avgVelocity : null)),
              titles: r.cells.map((c, i) => `${r.category} · diupload ${hm.cols[i]} lalu: ${c.count} aset, ${c.avgVelocity} dl/bln`) }))}
            rowExtra={(r) => <span className={`trend ${r.trend}`}>{TREND_TEXT[r.trend]}</span>}
            onRow={(r) => onPick(r.key)} legend={["dl/bln rendah", "dl/bln tinggi"]} />
          <p className="hint">Rata-rata download/bulan menurut umur aset, dari yang lama (kiri) ke yang baru (kanan). Baris yang makin hijau ke kanan = aset baru masih laku (memanas).</p>
        </>
      )}
    </div>
  );
}

// Ready-to-paste metadata for the owner's CSV (metadata-master): 40 keywords, most important first, and SEO titles
// (≤70 characters, no comma). Built only from this search; brand words and odd characters are left out.
function MetadataPanel({ data }) {
  const kw = keywordList(data, 40), titles = titleIdeas(data);
  if (!kw.length) return null;
  return (
    <div className="panel meta-panel">
      <h2>Metadata siap pakai <small className="muted">untuk CSV: judul ≤{TITLE_MAX} karakter tanpa koma, 40 keyword, tanpa merek</small></h2>
      {titles.length > 0 && <div className="meta-titles">
        {titles.map((t) => (
          <div key={t.title} className="meta-title">
            <span className="muted">{t.label}</span>
            <b>{t.title}</b>
            <span className="muted mono">{t.title.length}/{TITLE_MAX}</span>
            <CopyButton label="Salin" text={t.title} />
          </div>
        ))}
      </div>}
      <div className="btns" style={{ marginTop: 12 }}>
        <CopyButton label={`Salin ${kw.length} keyword (standar CSV)`} text={kw.join(", ")} />
      </div>
      <p className="hint">Judul disusun dari keyword dan frasa judul aset terlaris di pencarian ini. Sesuaikan dengan isi aset Anda sebelum dipakai.</p>
    </div>
  );
}
