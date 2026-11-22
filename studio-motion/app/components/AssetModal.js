"use client";
import { useEffect, useRef, useState } from "react";
import { ago, copyText, fmt, fmtDate, fmtVel, safeUrl } from "./util";
import { typeLabel } from "@/lib/contentTypes";

const adobeContributorUrl = (id) => `https://stock.adobe.com/contributor/${id}`;

// Everything known about one asset: full title, all stats, all keywords (in Adobe order) and actions.
export default function AssetModal({ asset: a, onClose, onCreator, hideCreator, thumbStyle }) {
  const [copied, setCopied] = useState("");
  const closeRef = useRef(null);

  useEffect(() => {
    const prev = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus?.(); };
  }, [onClose]);

  const flash = (what, text) => { copyText(text); setCopied(what); setTimeout(() => setCopied(""), 1500); };
  const stats = [
    ["Download / bulan", `~${fmtVel(a.dlPerMonth)}`],
    ["Total download", fmt(a.downloads)],
    ["Performa", `${a.performance}/100`],
    ...(a.views != null ? [["Dilihat", fmt(a.views)], ["Konversi", `${a.conversion}%`]] : []),
    ["Umur", a.ageMonths != null ? ago(a.ageMonths) : "-"],
  ];

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal panel asset-modal" role="dialog" aria-modal="true" aria-labelledby="asset-title" onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} type="button" className="modal-close" onClick={onClose} aria-label="Tutup">×</button>

        <div className="asset-modal-grid">
          <a href={safeUrl(a.url)} target="_blank" rel="noreferrer" className="card-thumb asset-modal-img" style={thumbStyle(a)}>
            {a.thumb && <img src={a.thumb} alt={a.title} referrerPolicy="no-referrer" />}
            <span className="badges">
              {a.type && a.type !== "unknown" && <span className="tag type">{typeLabel(a.type)}</span>}
              {a.isAI && <span className="tag ai">AI</span>}
            </span>
          </a>

          <div className="asset-modal-info">
            <span className="field-label">Judul</span>
            <h2 id="asset-title" className="asset-modal-title">{a.title || "(tanpa judul)"}</h2>

            <div className="asset-stats">
              {stats.map(([l, v]) => <div key={l}><b>{v}</b><small>{l}</small></div>)}
            </div>
            <div className="perf-track" title={`Performa ${a.performance}/100`}><div style={{ width: `${a.performance}%` }} /></div>

            <dl className="asset-facts">
              <div><dt>Kategori</dt><dd>{a.category}</dd></div>
              <div><dt>Jenis</dt><dd>{typeLabel(a.type)}{a.isAI ? " · AI" : ""}</dd></div>
              <div><dt>Tanggal upload</dt><dd>{fmtDate(a.created)}{a.ageMonths != null && <span className="muted"> ({ago(a.ageMonths)})</span>}</dd></div>
              {a.size && <div><dt>Ukuran</dt><dd>{a.size} <span className="muted">({a.orientation})</span></dd></div>}
              <div><dt>ID aset</dt><dd className="mono">{a.id}</dd></div>
              {!hideCreator && (
                <div><dt>Portofolio</dt><dd>
                  {a.creatorId ? <button type="button" className="linkish" onClick={() => { onClose(); onCreator(a.creatorId); }}>{a.creator}</button> : a.creator}
                  {a.creatorId && <> · <a href={adobeContributorUrl(a.creatorId)} target="_blank" rel="noreferrer">Adobe ↗</a></>}
                </dd></div>
              )}
            </dl>

            <div className="btns">
              <a className="mini primary" href={safeUrl(a.url)} target="_blank" rel="noreferrer">Buka di Adobe Stock ↗</a>
              <button type="button" className="mini" onClick={() => flash("title", a.title)}>{copied === "title" ? "Tersalin ✓" : "Salin judul"}</button>
              <button type="button" className="mini" onClick={() => flash("top10", a.keywords.slice(0, 10).join(", "))}>{copied === "top10" ? "Tersalin ✓" : "Salin 10 keyword utama"}</button>
            </div>
          </div>
        </div>


        <div className="asset-modal-kw">
          <h2>
            Keyword <small className="muted">{a.keywords.length} · urutan dari Adobe, 10 pertama paling berpengaruh</small>
          </h2>
          <ol className="kwgrid">
            {a.keywords.map((k, i) => (
              <li key={k} className={i < 10 ? "top" : ""}>
                <span className="chip static">{k}</span>
              </li>
            ))}
          </ol>
          <div className="btns" style={{ marginTop: 14 }}>
            <button type="button" className="primary" onClick={() => flash("kw", a.keywords.join(", "))}>{copied === "kw" ? "Tersalin ✓" : `Salin ${a.keywords.length} keyword`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
