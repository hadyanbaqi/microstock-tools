"use client";
import { useCallback, useEffect, useState } from "react";
import AssetModal from "./AssetModal";
import { Icon, Loader } from "./ui";
import { LABELS, useTrends } from "./TrendView";
import { fmt, fmtVel, lookupAsset, store } from "./util";
import { contributorDelta, useWatchlists } from "./watch";
import { POPULAR } from "@/lib/ideas";
import { parseInput } from "@/lib/parse";

// What each tool answers, so users know where to go. `tint` = the tool's pastel identity on Beranda.
export const TOOLS = [
  ["niche", "Cari Aset", "Ketik keyword + filter: aset yang paling cepat laku, brief konten, keyword, dan persaingannya.", "lilac"],
  ["trends", "Tren Keyword", "Keyword apa yang sedang naik, masih ada celah, atau sudah jenuh di Adobe Stock?", "sky"],
  ["contributor", "Lacak Kontributor", "Bedah portofolio kontributor mana pun: karya terlaris, niche andalan, yang sedang naik.", "peach"],
];

// Small illustrations per tool (decorative): bars, heat grid, avatars, rising line.
const ART = {
  niche: (
    <>
      {[[14, 30], [30, 18], [46, 36], [62, 10], [78, 24]].map(([x, h], i) => <rect key={i} x={x} y={56 - h} width="11" height={h} rx="4" className="a2" />)}
      <circle cx="96" cy="24" r="11" className="a1" fill="none" strokeWidth="4" /><path d="M104 32l8 8" className="a1" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  contributor: (
    <>
      <circle cx="42" cy="32" r="17" className="a2" /><circle cx="64" cy="32" r="17" className="a1" opacity=".55" /><circle cx="86" cy="32" r="17" className="a1" />
      <path d="M80 30l4 4 8-8" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  trends: (
    <>
      <path d="M12 50 L34 40 L52 44 L72 26 L92 30 L110 12" className="a1" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 50 L34 40 L52 44 L72 26 L92 30 L110 12 L110 58 L12 58Z" className="a2" opacity=".6" />
      <circle cx="110" cy="12" r="5" className="a1" />
    </>
  ),
};

const GREETINGS = [[11, "Selamat pagi"], [15, "Selamat siang"], [18, "Selamat sore"], [24, "Selamat malam"]];
const DISMISS_KEY = "stockscope:onboarding-done";

export default function Dashboard({ icons, history, saved, lastNiche, hasToken, onNiche, onOpenSaved, onContributor, onGo, onSettings }) {
  const { contributors } = useWatchlists();
  const [trends] = useTrends();
  const [trendsSeen, setTrendsSeen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [greet, setGreet] = useState({ text: "Halo", date: "" });
  const [hideSteps, setHideSteps] = useState(true);
  const closeDetail = useCallback(() => setDetail(null), []);
  const p = parseInput(input);

  // Time-dependent text is set after mount so the static HTML and the client agree.
  useEffect(() => {
    const now = new Date();
    setGreet({
      text: GREETINGS.find(([h]) => now.getHours() < h)[1],
      date: now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    });
    setHideSteps(!!store(DISMISS_KEY));
    setTrendsSeen(!!store("stockscope:trends-seen"));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (p.kind === "niche") return onNiche(p.query);
    if (p.kind === "contributor") return onContributor(p.id);
    if (p.kind !== "asset") return;
    setBusy(true);
    try {
      setDetail((await lookupAsset(p.id)).asset);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Saved copies of a query, so ideas and recent searches reopen for free instead of fetching again.
  const savedQueries = (saved ?? []).filter((x) => !x.creatorId);
  const savedFor = (q) => savedQueries.find((x) => x.query === q.toLowerCase());
  const openQuery = (q) => { const hit = savedFor(q); return hit ? onOpenSaved(hit.params) : onNiche(q); };
  const recent = savedQueries.length
    ? savedQueries.slice(0, 4).map((x) => ({ key: JSON.stringify(x.params), label: x.query, title: `Tersimpan ${new Date(x.at).toLocaleDateString("id-ID")}: buka gratis`, open: () => onOpenSaved(x.params) }))
    : history.slice(0, 4).map((h) => ({ key: h.query, label: h.query, title: "Pencarian terakhir", open: () => onNiche(h.query) }));
  const hotAssets = lastNiche?.assets ? [...lastNiche.assets].sort((x, y) => y.dlPerMonth - x.dlPerMonth).slice(0, 6) : [];
  const hotKeywords = (trends.keywords ?? []).filter((k) => k.label === "naik" || k.label === "celah").slice(0, 5);
  const hint = { niche: "→ riset niche", asset: "→ cek download aset", contributor: "→ lacak kontributor" }[p.kind];
  const contribGrowth = contributors.reduce((s, w) => s + Math.max(0, contributorDelta(w)?.downloads ?? 0), 0);

  const steps = [
    { done: history.length > 0, title: "Cari aset pertama", text: "Ketik satu keyword untuk melihat aset yang paling cepat laku dan brief kontennya.", action: "Coba “ramadan background”", go: () => onNiche("ramadan background") },
    { done: trendsSeen, title: "Lihat tren keyword", text: "Keyword yang sedang naik dan yang sudah jenuh di 15 tema.", action: "Buka Tren Keyword", go: () => onGo("trends") },
    { done: hasToken, title: "Pasang token Apify Anda", text: "Opsional: simpan satu atau beberapa token di kantong; pencarian memakai yang sisa kreditnya terbanyak.", action: "Pasang token", go: onSettings },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const showSteps = !hideSteps && doneCount < steps.length;
  const dismiss = () => { store(DISMISS_KEY, true); setHideSteps(true); };

  return (
    <>
      <section className="home-hero">
        <div className="home-hero-top">
          <span className="wordmark sm">Riset Adobe Stock</span>
          {greet.date && <small className="muted">{greet.date}</small>}
        </div>
        <h1 className="greet">{greet.text} <span aria-hidden="true">👋</span></h1>
        <p className="tagline">Mau riset apa hari ini? Lihat apa yang benar-benar dibeli di Adobe Stock, sebelum Anda membuatnya.</p>
        <form onSubmit={submit}>
          <div className="searchbar">
            <input aria-label="Cari" placeholder="Keyword niche, ID/link aset, atau link kontributor" value={input}
              onChange={(e) => setInput(e.target.value)} required />
            {hint && <span className="kind-hint">{hint}</span>}
            <button className="submit" disabled={busy} aria-label="Cari">{busy ? <span className="spin" /> : <Icon d="M5 12h14M13 5l7 7-7 7" />}</button>
          </div>
        </form>
        {recent.length > 0 && (
          <div className="chips history recent-row">
            <small className="muted">Terakhir (gratis):</small>
            {recent.map((r) => (
              <button key={r.key} type="button" className="chip ghost" onClick={r.open} title={r.title}>{r.label}</button>
            ))}
          </div>
        )}
        {busy && <div style={{ marginTop: 14 }}><Loader title="Mencari aset di Adobe Stock" steps={[[0, "Mencocokkan ID aset"]]} note="Biasanya 10–40 detik." /></div>}
        {error && <div className="notice err">{error}</div>}
      </section>

      {showSteps && (
        <section className="panel steps" aria-labelledby="steps-title">
          <div className="steps-head">
            <div>
              <h2 id="steps-title" style={{ margin: 0 }}>Mulai dalam 3 langkah</h2>
              <p className="hint" style={{ margin: "2px 0 0" }}>{doneCount} dari {steps.length} selesai</p>
            </div>
            <div className="progress" aria-hidden="true"><i style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
            <button type="button" className="mini" onClick={dismiss}>Sembunyikan</button>
          </div>
          <ol className="step-list">
            {steps.map((s, i) => (
              <li key={s.title} className={s.done ? "done" : ""}>
                <span className="step-num" aria-hidden="true">{s.done ? "✓" : i + 1}</span>
                <div>
                  <b>{s.title}</b>{s.done && <span className="sr-only"> (selesai)</span>}
                  <p className="hint" style={{ margin: "2px 0 10px" }}>{s.text}</p>
                  {!s.done && <button type="button" className="mini" onClick={s.go}>{s.action} →</button>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="kpis">
        {[
          { key: "niche", tint: "lilac", label: "Pencarian", value: history.length, cta: history[0] ? "Buka lagi" : "Mulai cari",
            sub: history[0] ? <>terakhir: <b>“{history[0].query}”</b></> : "belum ada pencarian",
            go: () => (history[0] ? onNiche(history[0].query) : onGo("niche")) },
          { key: "contributor", tint: "peach", label: "Kontributor dipantau", value: contributors.length, cta: "Lacak",
            sub: contribGrowth ? <span className="delta up">+{fmt(contribGrowth)} download sejak dipantau</span> : "belum ada pertumbuhan tercatat",
            go: () => onGo("contributor") },
          { key: "trends", tint: "sky", label: "Tren keyword", value: trends.keywords?.length ?? 0, cta: trends.scan ? "Lihat tren" : "Perbarui",
            sub: trends.scan ? `diperbarui ${new Date(trends.scan.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}${trends.scan.is_demo ? " · demo" : ""}` : "belum pernah diperbarui",
            go: () => onGo("trends") },
        ].map((k) => (
          <button key={k.key} type="button" className={`kpi tint-${k.tint} ${k.value ? "" : "zero"}`} onClick={k.go}>
            <span className="kpi-top">
              <span className="kpi-icon" aria-hidden="true"><Icon d={icons[k.key]} /></span>
              <small>{k.label}</small>
            </span>
            <b className="kpi-num">{fmt(k.value)}</b>
            <span className="kpi-sub clamp1">{k.sub}</span>
            <span className="kpi-cta">{k.cta} →</span>
          </button>
        ))}
      </div>

      <section aria-labelledby="ideas-title">
        <div className="panel-head">
          <h2 id="ideas-title" className="section-title" style={{ margin: 0 }}>Ide niche siap pakai <small className="muted">keyword yang paling banyak dicari di microstock · klik untuk cari asetnya</small></h2>
          <button type="button" className="mini" onClick={() => onGo("calendar")}>Ide musiman ada di Kalender →</button>
        </div>
        <div className="pop-grid">
          {POPULAR.map((c) => {
            const hit = savedFor(c.query);
            return (
              <article key={c.query} className="pop-card">
                <button type="button" className="pop-head" onClick={() => openQuery(c.query)} title={hit ? "Tersimpan: buka gratis" : `Cari aset “${c.query}”`}>
                  <span className="idea-emoji" aria-hidden="true">{c.emoji}</span>
                  <span className="pop-name"><b>{c.label}</b><small>“{c.query}”{hit?.velocity != null && <em> · ~{fmtVel(+hit.velocity)} dl/bln</em>}</small></span>
                  <span className="pop-go" aria-hidden="true">→</span>
                </button>
                <div className="pop-subs">
                  {c.subs.map((q) => {
                    const h = savedFor(q);
                    return (
                      <button key={q} type="button" className={`chip ${h ? "saved" : ""}`} onClick={() => openQuery(q)}
                        title={h ? `Tersimpan${h.velocity != null ? ` · ~${fmtVel(+h.velocity)} dl/bln` : ""}: buka gratis` : `Cari aset “${q}”`}>
                        {q}{h && <span aria-label="tersimpan"> ✓</span>}
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="tools-title">
        <h2 id="tools-title" className="section-title">Alat riset</h2>
        <div className="tools">
          {TOOLS.map(([k, label, desc, tint]) => (
            <button key={k} type="button" className={`tool tint-${tint}`} onClick={() => onGo(k)}>
              <span className="tool-art"><svg viewBox="0 0 124 64" aria-hidden="true">{ART[k]}</svg></span>
              <span className="tool-body">
                <b><span className="tool-icon"><Icon d={icons[k]} /></span>{label}</b>
                <small className="muted">{desc}</small>
                <span className="tool-go">Buka →</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid2 even">
        <div className="panel">
          <h2>Keyword lagi naik <small className="muted">dari tren tersimpan</small><button type="button" onClick={() => onGo("trends")}>Semua →</button></h2>
          {hotKeywords.length ? (
            <ol className="hot-kw">
              {hotKeywords.map((k) => (
                <li key={`${k.theme}|${k.keyword}`}>
                  <button type="button" className="hot-kw-btn" onClick={() => onNiche(k.keyword)} title="Cari aset dengan keyword ini">
                    <span className={`lb lb-${k.label}`}>{LABELS[k.label][0]} {LABELS[k.label][1]}</span>
                    <b className="clamp1">{k.keyword}</b>
                    <span className="muted">{fmtVel(+k.median_velocity)} dl/bln</span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-state tint-sky">
              <svg viewBox="0 0 124 64" aria-hidden="true">{ART.trends}</svg>
              <p>{trends.loading ? "Memuat…" : "Belum ada tren tersimpan. Buka Tren Keyword lalu klik “Perbarui tren”."}</p>
            </div>
          )}
        </div>
        <div className="panel">
          <h2>Kontributor dipantau<button type="button" onClick={() => onGo("contributor")}>Semua ({contributors.length}) →</button></h2>
          {contributors.length ? (
            <table><tbody>
              {contributors.slice(0, 5).map((w) => {
                const last = w.snapshots.at(-1);
                const d = contributorDelta(w);
                return (
                  <tr key={w.id} className="clickable" onClick={() => onContributor(w.id)}>
                    <td><span className="avatar sm" aria-hidden="true">{(w.name ?? "?").slice(0, 1).toUpperCase()}</span></td>
                    <td><b>{w.name ?? `#${w.id}`}</b><div className="muted" style={{ fontSize: 12 }}>#{w.id}</div></td>
                    <td className="num">{last ? `${fmt(last.totalDownloads)} dl` : "-"}{d && <div className={`delta ${d.downloads > 0 ? "up" : ""}`}>{d.downloads >= 0 ? "+" : ""}{fmt(d.downloads)}</div>}</td>
                  </tr>
                );
              })}
            </tbody></table>
          ) : (
            <div className="empty-state tint-peach">
              <svg viewBox="0 0 124 64" aria-hidden="true">{ART.contributor}</svg>
              <p>Belum ada kontributor dipantau. Tempel link profil kontributor di kotak pencarian, lalu klik “+ Pantau”.</p>
            </div>
          )}
        </div>
      </div>

      {hotAssets.length > 0 && (
        <section className="panel">
          <h2>Paling cepat laku di “{lastNiche.params?.query}” <small className="muted">pencarian terakhir</small><button type="button" onClick={() => onGo("niche")}>Lihat semua →</button></h2>
          <div className="hot-assets">
            {hotAssets.map((a) => (
              <button key={a.id} type="button" className="hot-asset" onClick={() => setDetail(a)} title={a.title}>
                {a.thumb ? <img src={a.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ph" aria-hidden="true" />}
                <span className="hot-badge">~{fmtVel(a.dlPerMonth)} dl/bln</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {detail && <AssetModal asset={detail} onClose={closeDetail} onCreator={onContributor} thumbStyle={() => ({})} />}
    </>
  );
}
