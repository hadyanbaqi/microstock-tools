"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmt, getWorkspace, setWorkspace, tokenHeaders } from "./util";
import { CopyButton } from "./ui";
import { typeLabel } from "@/lib/contentTypes";
import CompareView from "./CompareView";

const ORDER_LABEL = { downloads: "terlaris", relevance: "relevansi", newest: "terbaru", recent: "terkini", featured: "unggulan", undiscovered: "belum terjamah" };
const when = (t) => new Date(t).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const describe = (p) => [p.asset === "all" ? "semua jenis" : typeLabel(p.asset), ORDER_LABEL[p.order] ?? p.order, `${p.maxItems} aset`, p.ai === "only" ? "hanya AI" : p.ai === "exclude" ? "tanpa AI" : ""].filter(Boolean).join(" · ");

// Searches already paid for, stored in the database: reopening them is free. Also recovers results of
// earlier Apify runs (paid before this storage existed) while Apify still keeps them (~7 days).
export function useSaved() {
  const [items, setItems] = useState(null);
  const load = useCallback(() => {
    fetch("/api/saved", { cache: "no-store", headers: tokenHeaders() }).then((r) => r.json()).then((d) => setItems(d.items ?? [])).catch(() => setItems([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  return [items, load];
}

export default function SavedSearches({ items, reload, onOpen, onContributor, hasToken, onSettings }) {
  const [open, setOpen] = useState(false);
  const [compare, setCompare] = useState(false);
  // Stable callbacks: the dialogs re-focus their close button whenever onClose changes.
  const closeOpen = useCallback(() => setOpen(false), []);
  const closeCompare = useCallback(() => setCompare(false), []);
  if (!items) return null;
  const pick = (s) => (s.creatorId ? onContributor(s.creatorId, s.params) : onOpen(s.params));
  return (
    <>
      <div className="chips history saved-row">
        <small className="muted">Tersimpan (gratis):</small>
        {items.slice(0, 8).map((s) => (
          <button key={JSON.stringify(s.params)} type="button" className="chip" onClick={() => pick(s)} title={`${describe(s.params)} · ${when(s.at)}`}>
            {s.creatorId ? `kontributor #${s.creatorId}` : s.query} <small>{s.count} aset</small>
          </button>
        ))}
        {!items.length && <small className="muted">belum ada</small>}
        <button type="button" className="chip ghost" onClick={() => setOpen(true)}>Semua & pulihkan dari Apify →</button>
        <button type="button" className="chip ghost cmp-open" onClick={() => setCompare(true)}>Bandingkan niche →</button>
      </div>
      {compare && <CompareView onClose={closeCompare} onOpen={(p) => { setCompare(false); onOpen(p); }} />}
      {open && <SavedDialog items={items} reload={reload} onClose={closeOpen} onPick={(s) => { setOpen(false); pick(s); }}
        hasToken={hasToken} onSettings={() => { setOpen(false); onSettings(); }} />}
    </>
  );
}

function SavedDialog({ items, reload, onClose, onPick, hasToken, onSettings }) {
  const [tab, setTab] = useState("saved");
  const [runs, setRuns] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const closeRef = useRef(null);

  useEffect(() => {
    const prev = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);

  const loadRuns = useCallback(async () => {
    setError(""); setRuns(null);
    try {
      const res = await fetch("/api/apify-runs", { headers: tokenHeaders(), cache: "no-store" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
      setRuns(d.runs);
    } catch (e) {
      setError(e.message); setRuns([]);
    }
  }, []);
  useEffect(() => { if (tab === "apify" && hasToken && runs === null) loadRuns(); }, [tab, hasToken, runs, loadRuns]);

  async function recover(list) {
    setError("");
    for (const r of list) {
      setBusy(r.id);
      try {
        const res = await fetch("/api/apify-runs", { method: "POST", headers: { "Content-Type": "application/json", ...tokenHeaders() }, body: JSON.stringify({ runId: r.id, tokenId: r.tokenId }) });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
        setRuns((rs) => rs.map((x) => (x.id === r.id ? { ...x, saved: true } : x)));
      } catch (e) {
        setError(`${r.params.query || `#${r.params.creatorId}`}: ${e.message}`);
      }
    }
    setBusy("");
    reload();
  }
  const recoverable = (runs ?? []).filter((r) => r.available && !r.saved);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal panel saved-modal" role="dialog" aria-modal="true" aria-labelledby="saved-title" onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} type="button" className="modal-close" onClick={onClose} aria-label="Tutup">×</button>
        <h2 id="saved-title">Data tersimpan</h2>
        <div className="seg" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "saved"} className={tab === "saved" ? "on" : ""} onClick={() => setTab("saved")}>Tersimpan ({items.length})</button>
          <button type="button" role="tab" aria-selected={tab === "apify"} className={tab === "apify" ? "on" : ""} onClick={() => setTab("apify")}>Pulihkan dari Apify</button>
        </div>

        {tab === "saved" && (items.length ? (
          <ul className="saved-list">
            {items.map((s) => (
              <li key={JSON.stringify(s.params)}>
                <button type="button" className="saved-item" onClick={() => onPick(s)}>
                  <b className="clamp1">{s.creatorId ? `Kontributor #${s.creatorId}` : s.query}</b>
                  <span className="muted">{describe(s.params)}</span>
                  <span className="muted">{fmt(s.count)} aset · {when(s.at)}{s.source === "apify-import" ? " · dipulihkan" : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="hint">Belum ada. Setiap pencarian berbayar otomatis tersimpan di sini dan bisa dibuka lagi tanpa biaya.</p>)}

        {tab === "apify" && (!hasToken ? (
          <div className="notice">Pasang token Apify Anda dulu: riwayat pencarian dibaca dari akun Apify Anda. <button type="button" className="linkish" onClick={onSettings}>Pasang token</button></div>
        ) : (
          <>
            <p className="hint" style={{ margin: 0 }}>Hasil pencarian yang sudah Anda bayar masih disimpan Apify sekitar 7 hari. Memulihkannya gratis: data diambil dari akun Apify Anda, dianalisis, lalu disimpan permanen di sini.</p>
            {runs === null ? <p className="hint">Membaca riwayat Apify…</p> : runs.length ? (
              <>
                {recoverable.length > 1 && <button type="button" className="primary" disabled={!!busy} onClick={() => recover(recoverable)}>Pulihkan semua ({recoverable.length})</button>}
                <ul className="saved-list">
                  {runs.map((r) => (
                    <li key={r.id} className="saved-item static">
                      <b className="clamp1">{r.params.creatorId ? `Kontributor #${r.params.creatorId}` : r.params.query}</b>
                      <span className="muted">{describe(r.params)}</span>
                      <span className="muted">{when(r.startedAt)}{r.items != null ? ` · ${fmt(r.items)} aset` : ""}{r.usd != null ? ` · $${r.usd.toFixed(3)}` : ""}{r.tokenLabel ? ` · ${r.tokenLabel}` : ""}</span>
                      <span className="saved-action">
                        {r.saved ? <span className="lb lb-naik">✓ Tersimpan</span>
                          : !r.available ? <span className="lb lb-stabil">Sudah dihapus Apify</span>
                          : <button type="button" className="mini primary" disabled={!!busy} onClick={() => recover([r])}>{busy === r.id ? "Memulihkan…" : "Pulihkan"}</button>}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : !error && <p className="hint">Tidak ada pencarian di akun Apify Anda.</p>}
          </>
        ))}
        {error && <div className="notice err">{error}</div>}
        <Workspace onChange={() => { reload(); onClose(); }} />
      </div>
    </div>
  );
}

// The private list belongs to this browser's workspace code; copy it to use the same list elsewhere.
function Workspace({ onChange }) {
  const [code, setCode] = useState("");
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => setCode(getWorkspace()), []);
  return (
    <details className="workspace">
      <summary>Kode ruang kerja: daftar ini pribadi untuk browser ini</summary>
      <p className="hint" style={{ margin: "6px 0 8px" }}>Daftar Tersimpan hanya terlihat dengan kode ini. Salin ke perangkat lain (HP/laptop) agar daftarnya sama. Jangan bagikan ke orang lain.</p>
      <div className="btns">
        <code className="ws-code">{code}</code>
        <CopyButton label="Salin kode" text={code} />
      </div>
      <form className="btns" style={{ marginTop: 8 }} onSubmit={(e) => {
        e.preventDefault();
        if (setWorkspace(input)) { setMsg(""); onChange(); } else setMsg("Kode tidak valid (formatnya ss- diikuti huruf/angka).");
      }}>
        <input className="fpill-input grow" aria-label="Kode ruang kerja lain" placeholder="Tempel kode dari perangkat lain" value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit" className="mini">Pakai kode ini</button>
      </form>
      {msg && <p className="errtext" style={{ margin: "6px 0 0" }}>{msg}</p>}
    </details>
  );
}
