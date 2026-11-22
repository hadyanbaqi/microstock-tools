"use client";
import { useCallback, useEffect, useState } from "react";
import AgentSettings from "./AgentSettings";
import ApifySettings from "./ApifySettings";
import CioraSettings from "./CioraSettings";
import { getToken } from "./util";

// "Koneksi": named after what each connection does, not after the vendor. The main view is one page: what works now, then
// a card for research data (Apify) and one for AI (Ciora). Everything technical waits behind "Pengaturan lanjutan": the
// browser-only token, the Claude fallback through env and the multi-provider agent settings.
const LEGACY = { agent: "lanjutan" };
const usd = (v) => `$${Number(v).toFixed(2).replace(".", ",")}`;

export default function KeysHub({ open, tab, onTab, onClose, onApifyChange }) {
  const advanced = (LEGACY[tab] || tab) === "lanjutan";
  const [st, setSt] = useState({});
  const reload = useCallback(() => {
    const j = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([j("/api/apify-tokens?summary=1"), j("/api/ai/ciora"), j("/api/motion/generate")])
      .then(([apify, ciora, gen]) => setSt({ apify, ciora, gen, browser: !!getToken() }));
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    window.addEventListener("stockscope:models-changed", reload);
    reload();
    return () => { document.removeEventListener("keydown", onKey); window.removeEventListener("stockscope:models-changed", reload); };
  }, [open, onClose, reload]);
  if (!open) return null;

  const data = !!(st.apify?.usable || st.browser), ai = !!(st.ciora?.key || st.gen?.enabled);
  const dataLabel = data ? (st.apify?.usable && st.apify.leftUsd != null ? `Siap · sisa ${usd(st.apify.leftUsd)}` : "Siap") : "Belum terhubung";
  const features = [
    ["Riset aset", data, data ? "" : "data contoh"],
    ["Agent", ai, ai && !data ? "riset memakai data contoh" : ai ? "" : "butuh AI"],
    ["Tulis kode & metadata dengan AI", ai, ai ? "" : "butuh AI"],
    ["Upload HTML & render video", true, ""],
  ];
  const apifyChanged = (on) => { onApifyChange?.(on); reload(); };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal panel hub-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="hub-title">
        <h2 id="hub-title">{advanced ? "Pengaturan lanjutan" : "Koneksi"} <button type="button" onClick={onClose} aria-label="Tutup">×</button></h2>

        {!advanced && (
          <div className="cn">
            <ul className="cn-ready" aria-label="Fitur yang sudah bisa dipakai">
              {features.map(([label, ok, note]) => <li key={label} className={ok ? "ok" : ""}><i aria-hidden="true">{ok ? "✓" : "–"}</i><span>{label}{note && <small> ({note})</small>}</span></li>)}
            </ul>

            <section className="cn-card" aria-labelledby="cn-data">
              <div className="cn-head">
                <div><b id="cn-data">Data riset</b><small>Mengambil data penjualan Adobe Stock lewat Apify. ± $0,06 per 100 aset, pencarian yang masih baru gratis.</small></div>
                <span className={`tokstat ${data ? "ok" : "off"}`}>{dataLabel}</span>
              </div>
              <ApifySettings embedded open part="pool" onClose={onClose} onChange={apifyChanged} />
            </section>

            <section className="cn-card" aria-labelledby="cn-ai">
              <div className="cn-head">
                <div><b id="cn-ai">AI</b><small>Menulis kode animasi, ide, dan metadata lewat Ciora. Biaya dari saldo Ciora.</small></div>
                <span className={`tokstat ${ai ? "ok" : "off"}`}>{ai ? "Siap" : "Belum terhubung"}</span>
              </div>
              <CioraSettings />
            </section>

            <button type="button" className="linkish cn-more" onClick={() => onTab("lanjutan")}>Pengaturan lanjutan</button>
          </div>
        )}

        {advanced && (
          <div className="cn">
            <button type="button" className="linkish cn-more" onClick={() => onTab("ringkas")}>← Kembali ke Koneksi</button>
            <p className="hint" style={{ margin: 0 }}>Bagian ini tidak diperlukan untuk pemakaian biasa.</p>
            <section className="cn-card">
              <div className="cn-head"><div><b>Token Apify di browser ini</b><small>Dipakai kalau tidak mau menyimpan token di server.</small></div></div>
              <ApifySettings embedded open part="browser" onClose={onClose} onChange={apifyChanged} />
            </section>
            <section className="cn-card">
              <div className="cn-head"><div><b>Claude (cadangan)</b><small>Dipakai hanya kalau key Ciora belum dipasang. Diatur di Vercel → Settings → Environment Variables, lalu Redeploy.</small></div>
                <span className={`tokstat ${st.gen?.provider === "anthropic" && st.gen?.enabled ? "ok" : "off"}`}>{st.gen?.provider === "anthropic" && st.gen?.enabled ? "Aktif" : "Opsional"}</span></div>
              <ul className="hub-env">
                <li><code>ANTHROPIC_API_KEY</code> (+ <code>ANTHROPIC_BASE_URL</code> bila lewat gateway)</li>
                <li><code>ANTHROPIC_MODEL</code> / <code>ANTHROPIC_META_MODEL</code>: model bawaan HTML / metadata</li>
              </ul>
            </section>
            <section className="cn-card">
              <div className="cn-head"><div><b>Penyedia AI lain</b><small>OpenRouter atau kustom, untuk tugas agent berikutnya.</small></div></div>
              <AgentSettings embedded open onClose={onClose} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
