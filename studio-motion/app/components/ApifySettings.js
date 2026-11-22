"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getToken, saveToken, tokenHeaders, tokenRemembered } from "./util";

const usd = (v) => (v === null || v === undefined ? "–" : `$${Number(v).toFixed(2).replace(".", ",")}`);
const STATUS = { ok: "Aktif", habis: "Kredit habis", ditolak: "Ditolak", off: "Dimatikan" };

// One token in the pool: label, account, credit bar and actions. The token itself never reaches the browser.
function TokenRow({ t, busy, onPatch, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(t.label);
  const st = t.enabled ? t.status : "off";
  const pct = t.limitUsd ? Math.max(0, Math.min(1, (t.leftUsd ?? 0) / t.limitUsd)) : null;
  const level = pct === null ? "" : pct > 0.3 ? "" : pct > 0.1 ? "mid" : "low";
  return (
    <li className={`tokrow ${st}`}>
      <div className="tokrow-head">
        {editing ? (
          <form className="row" style={{ gap: 6, flex: 1 }} onSubmit={(e) => { e.preventDefault(); onPatch({ id: t.id, label }); setEditing(false); }}>
            <input value={label} maxLength={40} autoFocus onChange={(e) => setLabel(e.target.value)} aria-label="Nama token" />
            <button type="submit" className="mini" disabled={busy}>Simpan</button>
          </form>
        ) : (
          <button type="button" className="linkish tokname" title="Ganti nama" onClick={() => setEditing(true)}>{t.label || "Tanpa nama"}</button>
        )}
        <span className={`tokstat ${st}`}>{STATUS[st]}</span>
      </div>
      <div className="small muted">
        …{t.hint}{t.username ? <> · akun <b className="tokacc">{t.username}</b></> : null}{t.plan ? ` · ${t.plan}` : ""}
        {t.runs ? ` · dipakai ${t.runs}×` : ""}
      </div>
      {pct !== null ? (
        <div className="tokbar" role="meter" aria-valuemin={0} aria-valuemax={t.limitUsd} aria-valuenow={t.leftUsd ?? 0}
          aria-label={`Sisa kredit ${usd(t.leftUsd)} dari ${usd(t.limitUsd)}`}>
          <span className={level} style={{ width: `${pct * 100}%` }} />
        </div>
      ) : null}
      <div className="tokfoot">
        <span className="small">
          Sisa <b>{usd(t.leftUsd)}</b>{t.limitUsd !== null ? <> dari {usd(t.limitUsd)}</> : t.usageUsd !== null ? <> · terpakai {usd(t.usageUsd)}</> : null}
          {t.lastError && st !== "ok" ? <span className="muted"> · {t.lastError}</span> : null}
        </span>
        <span className="btns">
          <button type="button" className="mini" disabled={busy} onClick={() => onPatch({ id: t.id, refresh: true })}>Cek kredit</button>
          <button type="button" className="mini" disabled={busy} onClick={() => onPatch({ id: t.id, enabled: !t.enabled })}>{t.enabled ? "Matikan" : "Aktifkan"}</button>
          <button type="button" className="mini" disabled={busy} onClick={() => onRemove(t)}>Hapus</button>
        </span>
      </div>
    </li>
  );
}

// Apify connection. part "pool" = the main page: one input, saved tokens folded away (server, encrypted, shared by every device
// and by Claude). part "browser" = Pengaturan lanjutan: a token kept only in this browser and how the tokens are used.
export default function ApifySettings({ open, onClose, onChange, embedded = false, part }) {
  const [pool, setPool] = useState(null); // { available, tokens, count, usable, leftUsd, serverToken }
  const [poolMsg, setPoolMsg] = useState(null); // { ok, text }
  const [newToken, setNewToken] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [showNew, setShowNew] = useState(false);

  const [token, setToken] = useState("");
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [status, setStatus] = useState(null); // { ok, username, usageUsd, limitUsd, error }
  const [busy, setBusy] = useState(false);

  const inputRef = useRef(null);
  // Same behavior as the other dialogs: focus inside on open, Esc closes, focus returns afterwards.
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    inputRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [open, onClose]);

  const loadPool = useCallback(async () => {
    try {
      const r = await fetch("/api/apify-tokens", { cache: "no-store" });
      const d = await r.json();
      setPool(r.ok ? d : { available: false, tokens: [], error: d.error });
      return d;
    } catch {
      setPool({ available: false, tokens: [], error: "Tidak bisa menghubungi server." });
      return null;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setToken(getToken());
    setRemember(tokenRemembered() || !getToken());
    setStatus(null); setPoolMsg(null); setNewToken(""); setNewLabel("");
    loadPool();
  }, [open, loadPool]);

  const report = (d) => onChange?.(!!getToken() || !!d?.usable);

  async function addToPool(e) {
    e.preventDefault();
    const t = newToken.trim();
    if (!t) return;
    setBusy(true); setPoolMsg(null);
    const r = await fetch("/api/apify-tokens", { method: "POST", headers: { ...tokenHeaders(t), "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel.trim() }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) ?? {};
    setBusy(false);
    if (r?.ok) {
      setNewToken(""); setNewLabel("");
      setPoolMsg({ ok: true, text: `✓ Token ditambahkan${d.token?.username ? ` (akun ${d.token.username}, sisa ${usd(d.token.leftUsd)})` : ""}.` });
      report(await loadPool());
    } else setPoolMsg({ ok: false, text: d.error || "Gagal menambahkan token." });
  }

  async function patchToken(body) {
    setBusy(true); setPoolMsg(null);
    const r = await fetch("/api/apify-tokens", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) ?? {};
    setBusy(false);
    if (!r?.ok) setPoolMsg({ ok: false, text: d.error || "Gagal mengubah token." });
    report(await loadPool());
  }

  async function removeFromPool(t) {
    if (!window.confirm(`Hapus token "${t.label || t.hint}" dari kantong? Token di akun Apify tidak ikut terhapus.`)) return;
    setBusy(true); setPoolMsg(null);
    const r = await fetch(`/api/apify-tokens?id=${encodeURIComponent(t.id)}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!r?.ok) setPoolMsg({ ok: false, text: "Gagal menghapus token." });
    report(await loadPool());
  }

  async function test(t = token.trim()) {
    if (!t) return null;
    setBusy(true);
    try {
      const r = await fetch("/api/apify-check", { headers: tokenHeaders(t) });
      const d = await r.json().catch(() => ({ ok: false, error: "Respons tidak valid." }));
      setStatus(d);
      return d;
    } catch {
      const d = { ok: false, error: "Tidak bisa menghubungi server." };
      setStatus(d);
      return d;
    } finally {
      setBusy(false);
    }
  }

  async function saveBrowser(e) {
    e.preventDefault();
    const t = token.trim();
    if (t) {
      const d = await test(t);
      if (!d?.ok) return;
    }
    saveToken(t, remember);
    onChange?.(!!t || !!pool?.usable);
    onClose();
  }

  function removeBrowser() {
    saveToken("", false);
    setToken("");
    setStatus(null);
    onChange?.(!!pool?.usable);
  }

  if (!open) return null;
  const tokens = pool?.tokens ?? [];

  const inner = (
    <>

        {part !== "browser" && (pool?.available ? (
          <section className="tokpool" aria-label="Token Apify">
            {tokens.length > 0 ? (
              <details className="tokbrowser">
                <summary>{tokens.length} token tersimpan · {pool.usable} siap · sisa <b className="tokacc">{usd(pool.leftUsd)}</b></summary>
                <ul className="toklist">
                  {tokens.map((t) => <TokenRow key={t.id} t={t} busy={busy} onPatch={patchToken} onRemove={removeFromPool} />)}
                </ul>
              </details>
            ) : (
              <ol className="cn-steps">
                <li>Buka <a href="https://console.apify.com/settings/integrations" target="_blank" rel="noreferrer">halaman token Apify</a>, lalu salin tokennya.</li>
                <li>Tempel di bawah. Token langsung dicek dan disimpan aman.</li>
              </ol>
            )}
            <form className="ck-keyform" onSubmit={addToPool}>
              <input ref={inputRef} type={showNew ? "text" : "password"} value={newToken} autoComplete="off" spellCheck={false}
                placeholder={tokens.length ? "Tempel token tambahan" : "Tempel token Apify di sini"} aria-label="Token Apify" onChange={(e) => { setNewToken(e.target.value); setPoolMsg(null); }} />
              <button type="button" className="mini" onClick={() => setShowNew((v) => !v)}>{showNew ? "Sembunyikan" : "Lihat"}</button>
              <button type="submit" className="primary" disabled={busy || !newToken.trim()}>{busy ? "Mengecek…" : tokens.length ? "Tambah token" : "Simpan & cek"}</button>
            </form>
            {poolMsg && <div className={`notice ${poolMsg.ok ? "okbox" : "err"}`}>{poolMsg.text}</div>}
          </section>
        ) : pool ? (
          <div className="notice">Penyimpanan di server belum aktif, jadi token disimpan di browser ini.</div>
        ) : (
          <div className="notice">Memuat…</div>
        ))}

        {(part === "browser" || (pool && !pool.available)) && (
          <form onSubmit={saveBrowser} style={{ display: "grid", gap: 10 }}>
            <p className="hint" style={{ marginTop: 0 }}>
              Disimpan hanya di browser ini dan tidak disimpan server. Dipakai sesudah token di kantong.
              Ambil token di <a href="https://console.apify.com/settings/integrations" target="_blank" rel="noreferrer">Apify Console → Settings → API &amp; Integrations</a>.
            </p>
            <div className="row" style={{ gap: 6 }}>
              <input ref={pool?.available ? undefined : inputRef} type={show ? "text" : "password"} value={token} autoComplete="off" spellCheck={false}
                placeholder="apify_api_xxxxxxxxxxxxxxxx" aria-label="Token API Apify di browser" onChange={(e) => { setToken(e.target.value); setStatus(null); }} />
              <button type="button" style={{ flex: "0 0 auto" }} onClick={() => setShow((v) => !v)}>{show ? "Sembunyikan" : "Lihat"}</button>
            </div>
            <label className="check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Ingat di browser ini (matikan di komputer umum: token terhapus saat tab ditutup)
            </label>
            {status && (
              <div className={`notice ${status.ok ? "okbox" : "err"}`}>
                {status.ok ? (
                  <>
                    ✓ Token valid{status.username ? <> · akun <b>{status.username}</b></> : null}
                    {status.usageUsd != null && <> · pemakaian bulan ini {usd(status.usageUsd)}{status.limitUsd != null ? ` dari ${usd(status.limitUsd)}` : ""}</>}
                  </>
                ) : status.error}
              </div>
            )}
            <div className="btns">
              <button type="submit" disabled={busy}>{busy ? "Memeriksa…" : "Simpan di browser"}</button>
              <button type="button" disabled={busy || !token.trim()} onClick={() => test()}>Tes token</button>
              {getToken() && <button type="button" onClick={removeBrowser}>Hapus token browser</button>}
            </div>
          </form>
        )}

        {part === "browser" && pool?.weakSecret && <div className="notice err">MCP_SECRET di server terlalu pendek (kurang dari 24 karakter), jadi token yang tersimpan mudah ditebak kuncinya. Isi ENC_KEY (acak, 32+ karakter) di Vercel; token lama tetap terbaca.</div>}
        {part === "browser" && (
          <p className="hint">
            Urutan pemakaian: token tersimpan (sisa kredit terbanyak dulu, pindah otomatis bila habis) → token browser ini → token server
            {pool?.serverToken ? " (terpasang)" : " (tidak ada)"}. Tanpa token sama sekali, aplikasi memakai data contoh.
          </p>
        )}
    </>
  );
  if (embedded) return <div className="hub-pane">{inner}</div>;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="apify-title">
        <h2 id="apify-title">Pengaturan Apify <button type="button" onClick={onClose} aria-label="Tutup">×</button></h2>
        {inner}
      </div>
    </div>
  );
}
