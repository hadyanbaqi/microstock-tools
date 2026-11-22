"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmt } from "./util";
import { typeLabel } from "@/lib/contentTypes";

// "Bandingkan niche": stored searches side by side (free, no Apify). Same numbers Claude used to tabulate by hand
// in the research notes: opportunity score, sales speed of all and of new assets, how many new assets already sell,
// competition and AI share. The best value of each row is highlighted.
const MAX = 6;
const VERDICT = { good: "peluang bagus", mid: "kompetitif", low: "jenuh" };
const ORDER_LABEL = { downloads: "terlaris", relevance: "relevansi", newest: "terbaru", featured: "unggulan", undiscovered: "belum terjamah", recent: "terkini" };
const dec = (v) => (v === null || v === undefined ? "–" : String(v).replace(".", ","));
const ROWS = [
  { key: "score", label: "Skor peluang", get: (s) => s.opportunityScore, best: "max", fmt: (v, s) => `${v} · ${VERDICT[s.verdict?.level] ?? ""}` },
  { key: "vel", label: "Rata dl/bulan (semua)", get: (s) => s.avgVelocity, best: "max", fmt: dec },
  { key: "rvel", label: "Rata dl/bulan aset ≤12 bln", get: (s) => s.avgRecentVelocity, best: "max", fmt: dec, hint: "Aset baru yang sudah laku: tanda niche masih menerima pendatang." },
  { key: "recent", label: "Aset ≤12 bln di sampel", get: (s) => (s.count ? Math.round((s.recentCount / s.count) * 100) : null), best: "max", fmt: (v, s) => `${s.recentCount} (${v}%)` },
  { key: "dom", label: "Dominasi 5 kontributor teratas", get: (s) => s.dominance, best: "min", fmt: (v) => `${v}%`, hint: "Porsi download milik 5 kontributor terbesar. Rendah = niche terbuka." },
  { key: "ai", label: "Porsi konten AI", get: (s) => s.aiShare, best: "min", fmt: (v) => `${v}%` },
  { key: "creators", label: "Kontributor berbeda", get: (s) => s.creatorCount, best: null, fmt: (v) => fmt(v) },
  { key: "dl", label: "Median download", get: (s) => s.medianDownloads, best: "max", fmt: (v) => fmt(v) },
];


export default function CompareView({ onClose, onOpen }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [pick, setPick] = useState([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const closeRef = useRef(null);

  useEffect(() => {
    fetch("/api/compare", { cache: "no-store" }).then((r) => r.json()).then((d) => { setItems(d.items ?? []); if (d.error) setError(d.error); })
      .catch(() => { setItems([]); setError("Tidak bisa menghubungi server."); });
  }, []);
  useEffect(() => {
    const prev = document.activeElement; closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);

  const types = useMemo(() => [...new Set((items ?? []).map((i) => i.params.asset))], [items]);
  const list = (items ?? []).filter((i) => (!type || i.params.asset === type) && (!q || i.params.query.includes(q.toLowerCase().trim())));
  const chosen = pick.map((k) => items?.find((i) => i.key === k)).filter(Boolean);
  const toggle = (k) => setPick((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length >= MAX ? p : [...p, k]));

  const bestOf = (row) => {
    if (!row.best || chosen.length < 2) return null;
    const vals = chosen.map((c) => row.get(c.summary)).filter((v) => v !== null && v !== undefined);
    if (!vals.length) return null;
    return row.best === "max" ? Math.max(...vals) : Math.min(...vals);
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal panel cmp-modal" role="dialog" aria-modal="true" aria-labelledby="cmp-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="cmp-title">Bandingkan niche <small className="muted">dari pencarian tersimpan · gratis</small>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Tutup">×</button></h2>

        <div className="cmp-pick">
          <div className="row" style={{ gap: 8 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari keyword tersimpan…" aria-label="Cari pencarian tersimpan" />
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Jenis konten" style={{ flex: "0 0 auto" }}>
              <option value="">Semua jenis</option>
              {types.map((t) => <option key={t} value={t}>{t === "all" ? "Semua jenis" : typeLabel(t)}</option>)}
            </select>
          </div>
          <p className="hint" style={{ margin: 0 }}>Pilih 2–{MAX} pencarian. Bandingkan yang jenis kontennya sama supaya adil. {pick.length}/{MAX} dipilih.</p>
          {items === null ? <p className="hint">Memuat…</p> : list.length ? (
            <div className="cmp-list">
              {list.map((i) => (
                <label key={i.key} className={`cmp-item ${pick.includes(i.key) ? "on" : ""}`}>
                  <input type="checkbox" checked={pick.includes(i.key)} disabled={!pick.includes(i.key) && pick.length >= MAX} onChange={() => toggle(i.key)} />
                  <b>{i.params.query}</b>
                  <span className="muted">{i.params.asset === "all" ? "semua jenis" : typeLabel(i.params.asset)} · {ORDER_LABEL[i.params.order] ?? i.params.order} · {i.count} aset{i.source === "mcp" ? " · Claude" : ""}</span>
                  <span className="cmp-score" style={{ "--s": i.summary.opportunityScore }}>{i.summary.opportunityScore}</span>
                </label>
              ))}
            </div>
          ) : <div className="notice">{error || "Belum ada pencarian tersimpan yang cocok."}</div>}
        </div>

        {chosen.length > 0 && (
          <div className="cmp-table-wrap">
            <table className="cmp-table">
              <thead>
                <tr>
                  <th scope="col">Metrik</th>
                  {chosen.map((c) => (
                    <th key={c.key} scope="col">
                      <b>{c.params.query}</b>
                      <small className="muted">{c.params.asset === "all" ? "semua" : typeLabel(c.params.asset)} · {ORDER_LABEL[c.params.order] ?? c.params.order}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => {
                  const best = bestOf(row);
                  return (
                    <tr key={row.key}>
                      <th scope="row" title={row.hint}>{row.label}{row.hint ? <span className="muted"> ⓘ</span> : null}</th>
                      {chosen.map((c) => {
                        const v = row.get(c.summary);
                        return <td key={c.key} className={best !== null && v === best ? "best" : ""}>{v === null || v === undefined ? "–" : row.fmt(v, c.summary)}</td>;
                      })}
                    </tr>
                  );
                })}
                <tr>
                  <th scope="row">Format terbaik</th>
                  {chosen.map((c) => <td key={c.key}>{c.brief?.format?.name ? typeLabel(c.brief.format.name) : "–"}{c.brief?.orientation?.name ? ` · ${c.brief.orientation.name}` : ""}</td>)}
                </tr>
                <tr>
                  <th scope="row">Keyword teratas</th>
                  {chosen.map((c) => <td key={c.key} className="cmp-kw">{c.keywords.slice(0, 6).join(", ") || "–"}</td>)}
                </tr>
                <tr>
                  <th scope="row">Data</th>
                  {chosen.map((c) => <td key={c.key} className="muted">{new Date(c.at).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} · {c.count} aset</td>)}
                </tr>
                <tr>
                  <th scope="row" />
                  {chosen.map((c) => <td key={c.key}><button type="button" className="mini" onClick={() => onOpen(c.params)}>Buka laporan</button></td>)}
                </tr>
              </tbody>
            </table>
            <p className="hint">Hijau = nilai terbaik di baris itu. Skor peluang menggabungkan permintaan, momentum aset baru, porsi aset baru, keterbukaan, dan porsi AI.</p>
          </div>
        )}
      </div>
    </div>
  );
}
