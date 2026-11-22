"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { CopyButton, Loader } from "./ui";
import { fmtVel, safeUrl, store, tokenHeaders } from "./util";

export const LABELS = {
  naik: ["🔥", "Naik daun", "Aset baru (≤1 tahun) dengan keyword ini sudah masuk daftar terlaris dan laku lebih cepat dari yang lama. Peluang terbaik."],
  celah: ["🌱", "Celah", "Banyak dipakai aset terlaris, tapi jarang dipakai upload terbaru: permintaan lebih besar dari pasokan baru."],
  stabil: ["📈", "Laku stabil", "Selalu dicari. Aman, tapi persaingannya lebih ketat."],
  jenuh: ["⚠️", "Jenuh", "Banyak dipakai upload terbaru, tapi jarang ada di aset terlaris. Sebaiknya dihindari."],
};
const PAYER = {
  pool: "kantong token Apify (token dengan sisa kredit terbanyak, pindah otomatis bila habis)",
  user: "akun Apify Anda (token Anda)",
  server: "akun Apify server StockScope",
  demo: "tidak ada (mode demo: data contoh, bukan data Adobe)",
};
const SEEN_KEY = "stockscope:trends-seen";
// Two themes at a time per Apify account (each runs its searches one after another) stays within the free-plan
// memory cap; the server answers with more (`parallel`) when the token pool has several accounts.
const PARALLEL = 2;
const dec = (v) => String(v).replace(".", ",");

function since(iso) {
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (h < 1) return "baru saja";
  if (h < 24) return `${Math.round(h)} jam lalu`;
  return `${Math.round(h / 24)} hari lalu`;
}

async function api(body) {
  const res = await fetch("/api/trends", { method: "POST", headers: { "Content-Type": "application/json", ...tokenHeaders() }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error || `Error ${res.status}`), { status: res.status });
  return json;
}

// Stored trends are free to read; fetching new ones only happens after the confirm dialog.
export function useTrends() {
  const [state, setState] = useState({ loading: true });
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/trends", { headers: tokenHeaders(), cache: "no-store" });
      const json = await res.json();
      setState(res.ok ? { ...json, loading: false } : { loading: false, error: json.error });
    } catch {
      setState({ loading: false, error: "Gagal membaca tren tersimpan." });
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  return [state, load];
}

export default function TrendView({ onResearch, active }) {
  const [t, reload] = useTrends();
  const [confirm, setConfirm] = useState(false);
  const [run, setRun] = useState(null); // { done, total, current: [], errors: [] }
  const [error, setError] = useState("");
  const [theme, setTheme] = useState("");
  const [label, setLabel] = useState("");
  const [lowAI, setLowAI] = useState(false);
  const [sort, setSort] = useState("score");

  useEffect(() => { if (active) store(SEEN_KEY, true); }, [active]);
  // Re-read when the page is opened again (another user may have updated the trends); the first load is in useTrends.
  const opened = useRef(false);
  useEffect(() => {
    if (!active) return;
    if (opened.current && !run) reload();
    opened.current = true;
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leaving the site mid-scan stops it; warn first.
  useEffect(() => {
    if (!run) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [run]);

  const closeConfirm = useCallback(() => setConfirm(false), []);
  const themeLabel = useMemo(() => Object.fromEntries((t.themes ?? []).map((x) => [x.id, x.label])), [t.themes]);

  async function scan() {
    setConfirm(false);
    setError("");
    let started;
    try {
      started = await api({ action: "start" });
    } catch (e) {
      setError(e.message);
      if (e.status === 409) reload();
      return;
    }
    const themes = started.themes;
    const progress = { done: 0, total: themes.length, current: [], errors: [] };
    setRun({ ...progress });
    let fatal = null;
    const queue = [...themes];
    const worker = async () => {
      while (queue.length && !fatal) {
        const th = queue.shift();
        progress.current = [...progress.current, th.label];
        setRun({ ...progress });
        try {
          await api({ action: "theme", scanId: started.scan.id, theme: th.id });
        } catch (e) {
          progress.errors.push(th.label);
          // Bad token / no credit: stop instead of failing the remaining themes one by one.
          if ([401, 402, 404, 409].includes(e.status)) fatal = e.message;
        }
        progress.done++;
        progress.current = progress.current.filter((x) => x !== th.label);
        setRun({ ...progress });
      }
    };
    await Promise.all(Array.from({ length: started.parallel ?? PARALLEL }, worker));
    // Temporary failures (busy Apify memory, network): one more try, one theme at a time.
    const failed = themes.filter((th) => progress.errors.includes(th.label));
    if (failed.length && !fatal) {
      progress.errors = [];
      progress.retry = true;
      for (const th of failed) {
        progress.current = [th.label];
        setRun({ ...progress });
        try { await api({ action: "theme", scanId: started.scan.id, theme: th.id }); }
        catch (e) { progress.errors.push(th.label); if ([401, 402, 404, 409].includes(e.status)) { fatal = e.message; break; } }
      }
      progress.current = [];
    }
    await api({ action: "finish", scanId: started.scan.id }).catch(() => {});
    if (fatal) setError(fatal);
    else if (progress.errors.length) setError(`Sebagian tema gagal diambil: ${progress.errors.join(", ")}.`);
    setRun(null);
    reload();
  }

  const scanInfo = t.scan;
  const fresh = scanInfo && Date.now() - new Date(scanInfo.created_at).getTime() < 864e5;
  const ranks = useMemo(() => {
    const m = {};
    (t.keywords ?? []).forEach((k, i) => { m[`${k.theme}|${k.keyword}`] = i + 1; });
    return m;
  }, [t.keywords]);

  const list = useMemo(() => {
    const by = { score: (k) => -k.score, velocity: (k) => -k.median_velocity, ratio: (k) => -(k.ratio ?? 0) };
    return (t.keywords ?? [])
      .filter((k) => !theme || k.theme === theme)
      .filter((k) => !label || k.label === label)
      .filter((k) => !lowAI || k.ai_share < 30)
      .sort((a, b) => by[sort](a) - by[sort](b));
  }, [t.keywords, theme, label, lowAI, sort]);

  const counts = useMemo(() => {
    const c = {};
    for (const k of t.keywords ?? []) if (!theme || k.theme === theme) c[k.label] = (c[k.label] ?? 0) + 1;
    return c;
  }, [t.keywords, theme]);

  const running = run || t.running;

  return (
    <>
      <section className="panel trend-head">
        <div>
          <span className="field-label">Status data</span>
          {t.loading ? <p className="hint" style={{ margin: 0 }}>Memuat tren tersimpan…</p>
            : scanInfo ? (
              <p style={{ margin: "2px 0 0" }}>
                Terakhir diperbarui <b>{new Date(scanInfo.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</b>
                <span className="muted"> ({since(scanInfo.created_at)}) · {scanInfo.assets_scanned} aset dari {scanInfo.themes_done.length} tema</span>
                {scanInfo.is_demo && <span className="tag-demo">data demo</span>}
                {scanInfo.status === "partial" && <span className="muted"> · sebagian tema</span>}
              </p>
            ) : <p className="hint" style={{ margin: 0 }}>Belum ada data tren. Klik “Perbarui tren” untuk memindai 15 tema.</p>}
        </div>
        <button type="button" className="primary" disabled={!!running || t.loading} onClick={() => setConfirm(true)}>
          {run ? <><span className="spin" /> Memindai {run.done}/{run.total}</> : t.running ? "Sedang diperbarui…" : "Perbarui tren"}
        </button>
      </section>

      {run && (
        <Loader title={`Memperbarui tren: ${run.done}/${run.total} tema selesai`}
          steps={[[0, run.retry ? "Mencoba ulang tema yang gagal" : run.current.length ? `Sedang: ${run.current.join(", ")}` : "Menyimpan hasil"]]}
          note="Boleh pindah ke halaman lain di StockScope; jangan tutup tab ini.">
          <div className="progress"><i style={{ width: `${(run.done / run.total) * 100}%` }} /></div>
        </Loader>
      )}
      {!run && t.running && <div className="notice">Pembaruan tren sedang dijalankan pengguna lain ({t.running.themes_done.length}/{t.running.themes_total} tema). Hasilnya muncul di sini setelah selesai.</div>}
      {(error || t.error) && <div className="notice err">{error || t.error}</div>}

      {(t.keywords?.length ?? 0) > 0 && (
        <>
          <div className="trend-filters">
            <div className="chips" role="group" aria-label="Tema">
              <button type="button" className={`chip ${!theme ? "sel" : ""}`} onClick={() => setTheme("")}>Semua tema</button>
              {(t.themes ?? []).map((x) => (
                <button key={x.id} type="button" className={`chip ${theme === x.id ? "sel" : ""}`} onClick={() => setTheme(theme === x.id ? "" : x.id)}>{x.label}</button>
              ))}
            </div>
            <div className="trend-filter-row">
              <div className="seg" role="group" aria-label="Label">
                <button type="button" className={!label ? "on" : ""} onClick={() => setLabel("")}>Semua</button>
                {Object.entries(LABELS).map(([k, [ic, l]]) => (
                  <button key={k} type="button" className={label === k ? "on" : ""} onClick={() => setLabel(label === k ? "" : k)} title={LABELS[k][2]}>
                    {ic} {l} <small className="muted">{counts[k] ?? 0}</small>
                  </button>
                ))}
              </div>
              <label className="check"><input type="checkbox" checked={lowAI} onChange={(e) => setLowAI(e.target.checked)} /> AI &lt; 30%</label>
              <select aria-label="Urutkan" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="score">Urut: skor tren</option>
                <option value="velocity">Urut: paling laku (dl/bln)</option>
                <option value="ratio">Urut: paling naik</option>
              </select>
              <CopyButton label={`Salin ${Math.min(25, list.length)} keyword`} text={list.slice(0, 25).map((k) => k.keyword).join(", ")} />
            </div>
          </div>

          {list.length ? (
            <ol className="trend-list">
              {list.map((k) => {
                const key = `${k.theme}|${k.keyword}`;
                const prev = t.prevRanks?.[key];
                const move = t.prevScanAt ? (prev ? prev - ranks[key] : null) : undefined;
                const [ic, lt, why] = LABELS[k.label];
                return (
                  <li key={key} className={`trend-row lb-${k.label}`}>
                    <div className="trend-main">
                      <div className="trend-title">
                        <span className={`lb lb-${k.label}`} title={why}>{ic} {lt}</span>
                        <b className="trend-kw">{k.keyword}</b>
                        <span className="muted trend-theme">{themeLabel[k.theme] ?? k.theme}</span>
                        {move !== undefined && (
                          <span className={`rank ${move > 0 ? "up" : move < 0 ? "down" : ""}`}>
                            {move === null ? "baru" : move > 0 ? `▲ ${move}` : move < 0 ? `▼ ${-move}` : "="}
                          </span>
                        )}
                      </div>
                      <p className="trend-signals">
                        <span title="Median download/bulan aset terlaris (≤1 tahun) yang memakai keyword ini">Laku <b>{fmtVel(+k.median_velocity)} dl/bln</b></span>
                        {k.ratio != null && <span title="Kecepatan jual aset terlaris ≤1 tahun dibanding yang >1 tahun">Naik <b>{dec(k.ratio)}×</b></span>}
                        <span title="Permintaan: porsi aset terlaris di tema ini yang memakai keyword ini">Dipakai <b>{k.sold_share}%</b> aset terlaris</span>
                        <span title="Keramaian: porsi upload terbaru di tema ini yang memakai keyword ini">{k.supply_share}% upload baru</span>
                        <span title="Porsi konten AI">{k.ai_share}% AI</span>
                        {k.new_assets > 0 && <span className="muted">{k.new_assets} aset laris ≤1 thn</span>}
                      </p>
                      {(k.best_format || k.best_orientation) && (
                        <p className="hint" style={{ margin: "2px 0 0" }}>Paling laku sebagai: <b>{[k.best_format, k.best_orientation].filter(Boolean).join(" · ")}</b></p>
                      )}
                      {k.pairs?.length > 0 && (
                        <div className="chips small-chips" style={{ marginTop: 8 }}>
                          <small className="muted">Sering dipasangkan:</small>
                          {k.pairs.map((p) => <span key={p} className="chip static">{p}</span>)}
                        </div>
                      )}
                      <div className="btns" style={{ marginTop: 10 }}>
                        <button type="button" className="mini primary" onClick={() => onResearch(k.keyword)}>Cari aset →</button>
                        <CopyButton label="Salin keyword set" text={[k.keyword, ...(k.pairs ?? [])].join(", ")} />
                      </div>
                    </div>
                    <div className="trend-samples">
                      {(k.samples ?? []).map((s) => (
                        <a key={s.id} href={safeUrl(s.url)} target="_blank" rel="noreferrer" title={`${s.title} · ~${fmtVel(s.v)} dl/bln`} className="trend-thumb">
                          {s.thumb ? <img src={s.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span aria-hidden="true">🖼</span>}
                        </a>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : <div className="panel empty"><p className="hint">Tidak ada keyword dengan filter ini.</p></div>}
          <p className="hint">Perkiraan dari sampel {t.perTheme} aset per tema: 40 terlaris + 40 paling relevan (permintaan, termasuk aset baru yang laku) dan 40 upload terbaru (keramaian). Bukan data resmi Adobe.</p>
        </>
      )}

      {!t.loading && !t.keywords?.length && !run && (
        <div className="panel empty-state tint-sky" style={{ padding: 32 }}>
          <svg viewBox="0 0 124 64" aria-hidden="true">
            <path d="M12 50 L34 40 L52 44 L72 26 L92 30 L110 12" className="a1" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="110" cy="12" r="5" className="a1" />
          </svg>
          <p>Belum ada data tren tersimpan. Klik <b>Perbarui tren</b> di atas untuk memindai 15 tema sekali.</p>
        </div>
      )}

      <ConfirmDialog open={confirm} onCancel={closeConfirm} onConfirm={scan} title="Perbarui tren keyword?"
        confirmLabel="Ya, perbarui"
        lines={[
          `Memindai ${t.themes?.length ?? 15} tema × ${t.perTheme ?? 100} aset (terbaru + terlaris).`,
          t.payer === "demo" ? "Biaya: gratis." : `Perkiraan biaya: ± $${dec(t.cost ?? 0.9)}.`,
          `Dibayar oleh: ${PAYER[t.payer] ?? PAYER.demo}.`,
          "Waktu: sekitar 5–8 menit. Hasilnya disimpan dan bisa dilihat semua pengguna tanpa biaya.",
        ]}
        warn={fresh ? `Data terakhir baru ${since(scanInfo.created_at)}: hasilnya kemungkinan tidak jauh berbeda.` : null} />
    </>
  );
}
