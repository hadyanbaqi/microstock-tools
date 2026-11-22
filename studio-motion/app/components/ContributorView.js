"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import AssetList, { EMPTY_FILTERS } from "./AssetList";
import ConfirmDialog, { confirmSkipped } from "./ConfirmDialog";
import { CopyButton, FilterPill, Icon, Loader, Meter, SEARCH_STEPS, SkeletonCards, Spark, Stat, SubTabs } from "./ui";
import { fmt, peekResearch, research, safeUrl, store } from "./util";
import { COST_PER_100 } from "@/lib/themes";
import { contributorDelta, recordContributor, removeContributor, toggleContributor, useWatchlists } from "./watch";
import { CONTENT_TYPES, typeLabel } from "@/lib/contentTypes";

const ADOBE_PROFILE = (id) => `https://stock.adobe.com/contributor/${id}`;
const SKIP_SEARCH_CONFIRM = "stockscope:skip-search-confirm";
// The owner's own Creator ID (per browser): one click checks which of their newest uploads already sell.
const MY_KEY = "stockscope:my-creator";
const MY_CHECKS = [["vector", 300, "Vektor terbaru"], ["video", 100, "Video terbaru"], ["illustration", 100, "Ilustrasi/PNG terbaru"]];
const PAYER = { pool: "kantong token Apify (sisa kredit terbanyak dulu)", user: "akun Apify Anda (token Anda)", server: "akun Apify server StockScope" };

// Accepts a numeric ID or any Adobe Stock contributor URL (…/contributor/208000000/name…).
export function parseContributor(input) {
  const s = String(input ?? "").trim();
  const fromUrl = s.match(/contributor\/(\d{3,})/i);
  if (fromUrl) return fromUrl[1];
  return /^\d{3,}$/.test(s) ? s : "";
}

export default function ContributorView({ request, onResearch }) {
  const [input, setInput] = useState("");
  const [opts, setOpts] = useState({ order: "downloads", asset: "all", ai: "", maxItems: 100 });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(null); // lookup waiting for the user's OK: { id, o, peek }
  const cancelPending = useCallback(() => setPending(null), []);
  const { contributors: watch } = useWatchlists();
  const [myId, setMyId] = useState("");
  const [myDraft, setMyDraft] = useState("");
  const [editMy, setEditMy] = useState(false);
  useEffect(() => { const v = store(MY_KEY); if (v && /^\d{3,}$/.test(String(v))) setMyId(String(v)); }, []);
  function saveMy() {
    const id = parseContributor(myDraft);
    if (!id) { setError("Creator ID saya harus angka atau link profil Adobe Stock."); return; }
    store(MY_KEY, id); setMyId(id); setEditMy(false); setError("");
  }
  function checkMine(asset, maxItems) {
    const o = { order: "newest", asset, ai: "", maxItems };
    setOpts(o); setInput(myId); lookup(myId, o);
  }
  // Another view (niche competition tab, asset card) asked to open a contributor.
  useEffect(() => {
    if (!request?.id) return;
    // From "Tersimpan": reuse the stored search's options so the same (free) result opens.
    const o = request.opts ? { order: request.opts.order, asset: request.opts.asset, ai: request.opts.ai, maxItems: request.opts.maxItems } : opts;
    if (request.opts) setOpts(o);
    setInput(request.id);
    lookup(request.id, o);
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  async function lookup(raw = input, o = opts) {
    const id = parseContributor(raw);
    if (!id) { setError("Masukkan Creator ID (angka) atau link profil kontributor Adobe Stock."); return; }
    if (loading) return;
    setError("");
    // Cached or demo portfolios are free; anything else asks first (same opt-out as Cari Aset).
    const peek = await peekResearch({ query: "", creatorId: id, ...o });
    if (!peek) { setError("Tidak bisa memeriksa biaya pencarian. Periksa koneksi atau login lalu coba lagi."); return; }
    if (!peek.cached && peek.payer !== "demo" && (peek.savedAt || !confirmSkipped(SKIP_SEARCH_CONFIRM))) { setPending({ id, o, peek }); return; }
    run(id, o);
  }

  async function run(id, o, useSaved = false) {
    setLoading(true); setError("");
    try {
      const d = await research({ query: "", creatorId: id, ...o, ...(useSaved ? { useSaved: true } : {}) });
      setData(d);
      recordContributor(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const watched = data && watch.some((w) => w.id === data.creator?.id);
  const toggleWatch = () => data?.creator && toggleContributor(data);
  const unwatch = removeContributor;

  return (
    <>
      <section className="hero compact" style={{ paddingTop: 0 }}>
        <form onSubmit={(e) => { e.preventDefault(); lookup(); }}>
          <div className="searchbar">
            <input aria-label="Creator ID atau link profil" placeholder="Creator ID atau link profil Adobe Stock" value={input}
              onChange={(e) => setInput(e.target.value)} required />
            <button className="submit" disabled={loading} aria-label={loading ? "Menganalisis" : "Lacak"}>
              {loading ? <span className="spin" /> : <Icon d="M5 12h14M13 5l7 7-7 7" />}
            </button>
          </div>
          <div className="ftoolbar-wrap">
            <div className="ftoolbar" role="group" aria-label="Pilihan portofolio">
              <FilterPill label="Ambil" value={opts.order} def="downloads" onChange={(v) => setOpts({ ...opts, order: v })}
                options={[["downloads", "Terlaris dulu"], ["newest", "Terbaru dulu"]]} />
              <FilterPill label="Jenis" value={opts.asset} def="all" onChange={(v) => setOpts({ ...opts, asset: v })}
                options={[["all", "Semua"], ...CONTENT_TYPES.map((t) => [t.id, t.label])]} />
              <FilterPill label="Jumlah" value={opts.maxItems} def={100} onChange={(v) => setOpts({ ...opts, maxItems: Number(v) })}
                options={[100, 200, 300].map((v) => [v, `${v} aset`])} />
              <span className="fcost">≈ ${String(+((opts.maxItems * COST_PER_100) / 100).toFixed(2)).replace(".", ",")} · tersimpan permanen</span>
            </div>
          </div>
        </form>
        <p className="hint">Belum tahu ID-nya? Buka profil kontributor di Adobe Stock dan salin link-nya, atau riset niche lalu klik “Lacak” di tab Kompetisi.</p>
        <div className="my-portfolio">
          <b>Portofolio saya</b>
          {myId && !editMy ? (
            <>
              <span className="muted">#{myId}</span>
              {MY_CHECKS.map(([a, n, l]) => (
                <button key={a} type="button" className="mini" disabled={loading} onClick={() => checkMine(a, n)}
                  title={`Ambil ${n} aset ${l.toLowerCase()} Anda (± $${String(+((n * COST_PER_100) / 100).toFixed(2)).replace(".", ",")}, gratis bila sudah tersimpan)`}>{l} ({n})</button>
              ))}
              <button type="button" className="linkish" onClick={() => { setMyDraft(myId); setEditMy(true); }}>Ganti</button>
            </>
          ) : (
            <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); saveMy(); }}>
              <input value={myDraft} onChange={(e) => setMyDraft(e.target.value)} placeholder="Creator ID atau link profil Anda" aria-label="Creator ID saya" />
              <button type="submit" className="mini primary" style={{ flex: "0 0 auto" }}>Simpan</button>
              {myId && <button type="button" className="mini" style={{ flex: "0 0 auto" }} onClick={() => setEditMy(false)}>Batal</button>}
            </form>
          )}
          <span className="hint" style={{ margin: 0, flexBasis: "100%" }}>Cek aset terbaru Anda: mana yang sudah mulai laku, berapa persen yang belum laku, dan keyword dari aset yang laku.</span>
        </div>
        {loading && <Loader title="Mengambil portofolio kontributor" steps={SEARCH_STEPS} note="Biasanya 20–90 detik." />}
        {error && <div className="notice err">{error}</div>}
        {data?.demo && <div className="notice">Mode demo: portofolio contoh acak.</div>}
        {data?.cached && <div className="notice">Data tersimpan dari {new Date(data.fetchedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}{data.recovered ? " (dipulihkan dari Apify)" : ""}: dibuka gratis, tanpa kredit Apify.</div>}
      </section>

      {watch.length > 0 && (
        <div className="panel">
          <h2>Dipantau <small className="muted">{watch.length} kontributor · perubahan dihitung setiap kali dicek</small></h2>
          <div className="watchlist">
            {watch.map((w) => {
              const last = w.snapshots.at(-1);
              const d = contributorDelta(w);
              return (
                <div key={w.id} className={`watch ${data?.creator?.id === w.id ? "on" : ""}`}>
                  <button type="button" className="watch-main" onClick={() => { setInput(w.id); lookup(w.id); }} title="Cek ulang (gratis bila masih di cache)">
                    <b>{w.name ?? `#${w.id}`}</b>
                    <small className="muted">#{w.id}{last ? ` · dicek ${new Date(last.at).toLocaleDateString("id-ID")}` : ""}</small>
                    <span className="mono">{last ? `${fmt(last.totalDownloads)} dl` : "belum dicek"}
                      {d && <span className={`delta ${d.downloads > 0 ? "up" : ""}`}>{d.downloads >= 0 ? "+" : ""}{fmt(d.downloads)} {d.days >= 1 ? `dalam ${d.days} hari` : "sejak cek sebelumnya"}</span>}
                    </span>
                  </button>
                  <button type="button" className="mini" onClick={() => unwatch(w.id)} aria-label={`Berhenti memantau ${w.name ?? w.id}`}>×</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && <SkeletonCards />}
      <ConfirmDialog open={!!pending} onCancel={cancelPending} title="Ambil portofolio dari Adobe Stock?"
        confirmLabel={pending?.peek.savedAt ? "Ambil data baru" : "Ya, ambil"} skipKey={SKIP_SEARCH_CONFIRM}
        onConfirm={() => { const p = pending; setPending(null); run(p.id, p.o); }}
        altLabel={pending?.peek.savedAt ? "Buka yang tersimpan (gratis)" : null}
        onAlt={() => { const p = pending; setPending(null); run(p.id, p.o, true); }}
        lines={pending ? [
          pending.peek.savedAt
            ? `Portofolio #${pending.id} dengan pilihan ini sudah pernah dibayar dan tersimpan (${new Date(pending.peek.savedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}). Membukanya gratis.`
            : `Mengambil ${pending.peek.maxItems} aset kontributor #${pending.id}. Belum pernah diambil.`,
          `Data baru: ± $${String(+((pending.peek.maxItems * COST_PER_100) / 100).toFixed(2)).replace(".", ",")}, dibayar oleh ${PAYER[pending.peek.payer]}, sekitar 20–90 detik.`,
          "Setiap hasil disimpan permanen, jadi bisa dibuka lagi kapan saja tanpa biaya.",
        ] : []} />

      {!loading && data?.summary && <ContributorReport key={`${data.fetchedAt}-${data.params?.creatorId}`} data={data} watched={watched} onToggleWatch={toggleWatch}
        mine={!!myId && String(data.creator?.id ?? data.params?.creatorId) === myId}
        snapshots={watch.find((w) => w.id === data.creator?.id)?.snapshots ?? []}
        onResearch={onResearch} />}

      {!data && !watch.length && !loading && (
        <div className="panel empty">
          <h2>Bedah portofolio kontributor mana pun</h2>
          <p className="hint" style={{ fontSize: 14 }}>Lihat karya terlaris, analitik portofolio, dan performa download: berapa persen asetnya laku, niche andalannya, format yang paling menghasilkan, dan seberapa aktif ia upload. Klik “Pantau” untuk melacak pertumbuhannya dari waktu ke waktu.</p>
        </div>
      )}
    </>
  );
}

function ContributorReport({ data, watched, onToggleWatch, snapshots, onResearch, mine }) {
  const [tab, setTab] = useState("overview");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const s = data.summary;
  const p = data.performance ?? {};
  const c = data.creator ?? { id: data.params?.creatorId, name: null };
  const byNewest = data.params?.order === "newest";

  const best = useMemo(() => [...data.assets].sort((x, y) => y.downloads - x.downloads).slice(0, 10), [data]);
  const rising = useMemo(() => data.assets.filter((a) => a.ageMonths !== null && a.ageMonths <= 12)
    .sort((x, y) => y.dlPerMonth - x.dlPerMonth).slice(0, 10), [data]);
  // The contributor's own niches: keywords ranked by downloads they bring in.
  const niches = useMemo(() => [...data.keywords].sort((x, y) => y.downloads - x.downloads).slice(0, 24), [data]);
  const maxBucket = Math.max(1, ...(p.buckets ?? []).map((b) => b.count));
  const maxCat = data.categories?.[0]?.downloads || 1;

  return (
    <>
      <div className="report-head">
        <div className="profile">
          <div className="avatar" aria-hidden="true">{(c.name ?? "?").slice(0, 1).toUpperCase()}</div>
          <div>
            <h2 className="report-title">{c.name ?? `Kontributor #${c.id}`}</h2>
            <p className="hint" style={{ margin: 0 }}>
              #{c.id} · {s.count} aset {byNewest ? "terbaru" : "terlaris"} dianalisis
              {c.firstUpload && ` · upload ${c.firstUpload} s.d. ${c.lastUpload}`}
            </p>
          </div>
        </div>
        <div className="btns">
          <a className="mini" href={ADOBE_PROFILE(c.id)} target="_blank" rel="noreferrer">Profil Adobe ↗</a>
          <button type="button" className={watched ? "" : "primary"} onClick={onToggleWatch}>{watched ? "✓ Dipantau" : "+ Pantau"}</button>
        </div>
      </div>

      <SubTabs value={tab} onChange={setTab} tabs={[
        ["overview", "Ringkasan"],
        ["bestsellers", "Terlaris"],
        ["niches", "Niche & keyword"],
        ["assets", "Semua aset", data.assets.length],
      ]} />

      {tab === "overview" && (
        <>
          {mine && <MyUploads data={data} />}
          <div className="stats">
            <Stat big label="Total download" value={fmt(s.totalDownloads)} note={`dari ${s.count} aset dianalisis`} />
            <Stat label="Download / bulan" value={fmt(Math.round(p.totalVelocity ?? 0))} note="perkiraan seluruh sampel" />
            <Stat label="Rata-rata per aset" value={fmt(s.avgDownloads)} note={`median ${fmt(s.medianDownloads)}`} />
            <Stat label="Hit rate" value={`${p.hitRate ?? 0}%`} note="aset ≥100 download" />
            <Stat label="Konten AI" value={`${s.aiShare}%`} note="dari portofolio" />
            {s.conversion != null && <Stat label="Konversi" value={`${s.conversion}%`} note="download per 100 views" />}
          </div>

          <div className="grid3">
            <div className="panel">
              <h2>Performa download</h2>
              {p.buckets?.map((b) => (
                <Meter key={b.label} label={`${b.label} download`} count={b.count} value={`${b.share}%`} pct={(b.count / maxBucket) * 100} />
              ))}
              <p className="hint">10% aset teratas menghasilkan <b>{p.top10Share}%</b> download · {p.zeroShare}% aset belum pernah terjual.</p>
            </div>
            <div className="panel">
              <h2>Format yang menghasilkan</h2>
              <table className="typetable">
                <thead><tr><th></th><th className="num">Aset</th><th className="num">Dl/bln</th><th className="num">Porsi dl</th></tr></thead>
                <tbody>{data.types?.map((t) => (
                  <tr key={t.type}><td>{typeLabel(t.type)}</td><td className="num">{t.count}</td><td className="num">{t.avgVelocity}</td><td className="num">{t.share}%</td></tr>
                ))}</tbody>
              </table>
              <h2 style={{ marginTop: 18 }}>AI vs non-AI</h2>
              <table className="typetable"><tbody>
                {[["AI", data.aiVsHuman?.ai], ["Non-AI", data.aiVsHuman?.human]].map(([l, g]) => (
                  <tr key={l}><td>{l}</td><td className="num">{g?.count ?? 0} aset</td><td className="num">{g?.avgVelocity ?? 0} dl/bln</td></tr>
                ))}
              </tbody></table>
            </div>
            <div className="panel">
              <h2>Kategori</h2>
              {data.categories.slice(0, 8).map((cat) => (
                <Meter key={cat.name} label={cat.name} count={cat.assets} value={fmt(cat.downloads)} pct={(cat.downloads / maxCat) * 100} />
              ))}
            </div>
          </div>

          <div className="grid2">
            <div className="panel">
              <h2>Aktivitas upload <small className="muted">12 bulan terakhir, dari aset yang dianalisis</small></h2>
              <Spark data={data.uploads} />
              {!byNewest && <p className="hint">Sampel diurutkan dari yang terlaris, jadi upload terbaru yang belum laku tidak terlihat. Pilih “Terbaru dulu” untuk melihat ritme upload sebenarnya.</p>}
            </div>
            <div className="panel">
              <h2>Riwayat pantauan</h2>
              {snapshots.length ? (
                <table>
                  <thead><tr><th>Dicek</th><th className="num">Aset</th><th className="num">Total dl</th><th className="num">Dl/bln</th></tr></thead>
                  <tbody>{[...snapshots].reverse().slice(0, 8).map((x) => (
                    <tr key={`${x.at}-${x.sig}`}><td>{new Date(x.at).toLocaleDateString("id-ID")}</td><td className="num">{x.count}</td><td className="num">{fmt(x.totalDownloads)}</td><td className="num">{fmt(Math.round(x.velocity))}</td></tr>
                  ))}</tbody>
                </table>
              ) : <p className="hint" style={{ marginTop: 0 }}>Klik “+ Pantau” lalu cek lagi beberapa hari kemudian untuk melihat pertumbuhan download. Data tersimpan di browser ini.</p>}
            </div>
          </div>
        </>
      )}

      {tab === "bestsellers" && (
        <div className="grid2 even">
          <AssetTable title="Karya terlaris" note="total download sepanjang masa" rows={best} metric="downloads" />
          <AssetTable title="Sedang naik" note="aset ≤12 bulan, urut download/bulan" rows={rising} metric="dlPerMonth"
            empty="Tidak ada aset ≤12 bulan di sampel ini. Coba “Terbaru dulu”." />
        </div>
      )}

      {tab === "niches" && (
        <div className="panel">
          <h2>Niche andalan <small className="muted">keyword yang paling banyak mendatangkan download · klik untuk riset niche-nya</small></h2>
          <div className="niche-grid">
            {niches.map((k) => (
              <button key={k.keyword} type="button" className="niche" onClick={() => onResearch(k.keyword)}>
                <b>{k.keyword}</b>
                <small className="muted">{fmt(k.downloads)} dl · {k.count} aset · {k.avgVelocity} dl/bln</small>
              </button>
            ))}
          </div>
          <div className="btns" style={{ marginTop: 16 }}>
            <CopyButton label={`Salin ${niches.length} keyword andalan`} text={niches.map((k) => k.keyword).join(", ")} />
          </div>
        </div>
      )}

      {tab === "assets" && (
        <AssetList data={data} filters={filters} setFilters={setFilters} initialSort={byNewest ? "ageMonths" : "downloads"}
          onCreator={() => {}} hideCreator />
      )}
    </>
  );
}

function AssetTable({ title, note, rows, metric, empty }) {
  return (
    <div className="panel">
      <h2>{title} <small className="muted">{note}</small></h2>
      {rows.length ? (
        <table>
          <tbody>
            {rows.map((a, i) => (
              <tr key={a.id}>
                <td className="rank">{i + 1}</td>
                <td>{a.thumb ? <img className="thumb" src={a.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="thumb" />}</td>
                <td>
                  <a href={safeUrl(a.url)} target="_blank" rel="noreferrer">{a.title || "(tanpa judul)"}</a>
                  <div className="muted" style={{ fontSize: 12 }}>{typeLabel(a.type)} · {a.created}{a.isAI ? " · AI" : ""}</div>
                </td>
                <td className="num"><b>{metric === "downloads" ? fmt(a.downloads) : a.dlPerMonth}</b><div className="muted" style={{ fontSize: 11 }}>{metric === "downloads" ? "download" : "dl/bln"}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="hint">{empty}</p>}
    </div>
  );
}

// Owner's own portfolio: newest uploads that already sell (≤6 months, sorted by dl/month), how many have not sold yet,
// and the keywords the selling ones share: the feedback loop for the next batch.
function MyUploads({ data }) {
  const recent = data.assets.filter((a) => a.ageMonths !== null && a.ageMonths <= 6);
  const sold = recent.filter((a) => a.downloads > 0).sort((x, y) => y.dlPerMonth - x.dlPerMonth);
  const kw = new Map();
  for (const a of sold) for (const k of a.keywords.slice(0, 25)) kw.set(k, (kw.get(k) ?? 0) + 1);
  const topKw = [...kw.entries()].filter(([, n]) => n >= 2).sort((x, y) => y[1] - x[1]).slice(0, 20);
  const byNewest = data.params?.order === "newest";
  return (
    <div className="panel my-uploads">
      <h2>Aset saya yang mulai laku <small className="muted">upload ≤6 bulan di sampel ini{byNewest ? "" : " · pakai tombol “terbaru” untuk melihat upload baru"}</small></h2>
      <div className="stats">
        <Stat label="Upload ≤6 bulan" value={fmt(recent.length)} note={`dari ${data.assets.length} aset di sampel`} />
        <Stat label="Sudah laku" value={fmt(sold.length)} note={recent.length ? `${Math.round((sold.length / recent.length) * 100)}% dari upload baru` : "–"} />
        <Stat label="Belum laku" value={fmt(recent.length - sold.length)} note="0 download sejauh ini" />
        <Stat label="Download upload baru" value={fmt(sold.reduce((t, a) => t + a.downloads, 0))} />
      </div>
      {sold.length ? (
        <div className="my-list">
          {sold.slice(0, 12).map((a) => (
            <a key={a.id} className="my-item" href={safeUrl(a.url)} target="_blank" rel="noreferrer">
              <b className="clamp1">{a.title || `#${a.id}`}</b>
              <span className="muted">{a.created} · {typeLabel(a.type)}</span>
              <span className="mono"><b>{fmt(a.downloads)}</b> dl · {String(a.dlPerMonth).replace(".", ",")}/bln</span>
            </a>
          ))}
        </div>
      ) : <p className="hint">Belum ada upload ≤6 bulan yang laku di sampel ini.</p>}
      {topKw.length > 0 && <>
        <h3 className="my-h3">Keyword yang sering ada di aset laku</h3>
        <div className="chips">{topKw.map(([k, n]) => <span key={k} className="chip static">{k} <small>{n}×</small></span>)}</div>
        <div className="btns" style={{ marginTop: 10 }}><CopyButton label="Salin keyword" text={topKw.map(([k]) => k).join(", ")} /></div>
      </>}
    </div>
  );
}
