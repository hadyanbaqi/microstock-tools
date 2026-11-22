"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BATCH_MAX, MAX_HTML, RATIOS, batchContinue, batchIdeas, batchPrompt, followsStudio, htmlWarnings, sizeForAspect, splitBatch, viewportFor } from "@/lib/htmlMotion.mjs";
import { canPickFolder, canSaveAs, renderHtml, saveAs, saveBlob, fileBase, writeFile } from "./htmlRender";
import { CopyButton } from "./ui";
import { adobeCsv, shutterstockCsv, vecteezyCsv } from "@/lib/stockMeta";
import ModelPicker, { useModelChoice } from "./ModelPicker";

// The Studio Motion queue. Three sources fill it: the Agent tab (events below), .html files uploaded in the Bulk tab, and an
// AI answer pasted there (one prompt asks for N HTML animations separated by markers, split by lib/htmlMotion.mjs splitBatch).
// The input card is portalled into the Bulk tab (`slot`); the queue itself stays visible on every tab. Ticked videos render one
// after another with the Studio settings (size, FPS, duration, background, bitrate), optionally in extra ratios, into a folder.
const KEY_BRIEF = "stockscope:batch-brief", KEY_QUEUE = "stockscope:batch-queue";
const COUNTS = [5, 10, 20, 30];
const WARN = {
  terpotong: ["Terpotong", "Kode berhenti sebelum </html>: minta AI menulis ulang nomor ini."],
  smil: ["SMIL", "Ada animasi SVG SMIL (<animate>) yang tidak ikut terekam."],
  besar: ["Terlalu besar", `Lebih dari ${Math.round(MAX_HTML / 1000)} KB, tidak bisa dirender.`],
  berat: ["Berat", "Memakai shadowBlur atau filter, render bisa lambat."],
  acak: ["Acak", "Memakai Math.random(), hasil tiap render bisa berbeda dan loop bisa putus."],
};
const STATUS = { antre: ["Antre", "baru"], render: ["Merender", "dirender"], selesai: ["Selesai", "didistribusi"], gagal: ["Gagal", "gagal"] };
const BG_TEXT = { code: "latar sesuai kode", alpha: "transparan + matte", solid: "warna solid" };
const mins = (s) => (s >= 90 ? `±${Math.round(s / 60)} mnt` : `±${Math.max(1, s)} dtk`);
const kb = (s) => `${Math.max(1, Math.round(s.length / 1000))} KB`;
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const cleanName = (v) => v.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 20);
function uniqueName(name, used) {
  const base = cleanName(name || "video").replace(/-+$/, "") || "video"; let n = base, k = 2;
  while (used.has(n)) { const suf = `-${k++}`; n = base.slice(0, 20 - suf.length).replace(/-+$/, "") + suf; }
  used.add(n); return n;
}

export default function BatchPanel({ settings, onPreview, slot }) {
  const { ow, oh, vw, vh, fps, duration, bg, color, mbps, aspect } = settings;
  const [loaded, setLoaded] = useState(false);
  const [brief, setBrief] = useState("");
  const [mode, setMode] = useState("variasi");
  const [count, setCount] = useState(10);
  const [paste, setPaste] = useState("");
  const [items, setItems] = useState([]); // [{ id, n, name, html, warns, status, error }]
  const [pick, setPick] = useState(() => new Set());
  const [next, setNext] = useState(null); // { n, of } when the AI stopped before the last file
  const [note, setNote] = useState(null); // { ok, text }
  const [saveErr, setSaveErr] = useState(false);
  const [run, setRun] = useState(null); // { i, n, name, p, left } while rendering
  const [out, setOut] = useState({}); // id → [{ name, blob }] of this session
  const [topic, setTopic] = useState(""); // research keyword for the SEO metadata
  const [ratios, setRatios] = useState([]); // extra ratios on top of the Studio output
  const [dir, setDir] = useState(null); // folder picked for this session
  const [saving, setSaving] = useState(null); // { done, n } while "Simpan semua" writes files
  const keepDir = useRef(null); // folder used by the running render
  const [dropping, setDropping] = useState(false);
  const [metaAi, setMetaAi] = useState(null); // { enabled, model } from /api/motion/metadata
  const [metaRun, setMetaRun] = useState(null); // { done, n } while writing metadata
  const metaModel = useModelChoice("meta");
  const frameRef = useRef(null), abortRef = useRef(null), filesRef = useRef(null), addRef = useRef(null);

  useEffect(() => {
    const b = read(KEY_BRIEF), q = read(KEY_QUEUE);
    if (b) { setTopic(b.topic || ""); setBrief(b.brief || ""); setMode(b.mode === "daftar" ? "daftar" : "variasi"); setCount(Math.min(BATCH_MAX, Math.max(1, +b.count || 10))); setNext(b.next || null); }
    if (Array.isArray(q)) setItems(q.map((x) => ({ ...x, warns: typeof x.html === "string" ? htmlWarnings(x.html) : x.warns || [], status: x.status === "render" ? "antre" : x.status }))); // checks re-run: rules change between versions
    setLoaded(true);
    const loadMeta = () => fetch("/api/motion/metadata").then((r) => r.json()).then(setMetaAi).catch(() => setMetaAi({ enabled: false }));
    loadMeta();
    window.addEventListener("stockscope:models-changed", loadMeta);
    return () => window.removeEventListener("stockscope:models-changed", loadMeta);
  }, []);
  useEffect(() => () => abortRef.current?.abort(), []); // leaving the page stops a render in progress
  // The Agent page appends finished videos to the stored queue and fires "stockscope:batch-sync": merge them in.
  useEffect(() => {
    const onSync = (e) => {
      const add = Array.isArray(e.detail?.items) ? e.detail.items : [];
      if (!add.length) return;
      setItems((xs) => { const have = new Set(xs.map((x) => x.id)), used = new Set(xs.map((x) => x.name)); return [...xs, ...add.filter((x) => !have.has(x.id)).map((x) => ({ ...x, name: uniqueName(x.name, used) }))]; });
      setPick((p) => { const s = new Set(p); add.filter((x) => !x.warns?.includes("besar")).forEach((x) => s.add(x.id)); return s; });
      if (e.detail?.topic) setTopic(e.detail.topic);
    };
    // Metadata the Agent writes after its videos are already queued, and files imported from the hero button.
    const onMeta = (e) => { const got = new Map((e.detail?.items || []).map((x) => [x.id, x])); setItems((xs) => xs.map((x) => (got.has(x.id) ? { ...x, meta: got.get(x.id).meta || x.meta, metaError: got.get(x.id).metaError || "" } : x))); };
    const onFiles = (e) => addRef.current?.(e.detail?.files || []);
    window.addEventListener("stockscope:batch-sync", onSync);
    window.addEventListener("stockscope:batch-meta", onMeta);
    window.addEventListener("stockscope:batch-files", onFiles);
    return () => { window.removeEventListener("stockscope:batch-sync", onSync); window.removeEventListener("stockscope:batch-meta", onMeta); window.removeEventListener("stockscope:batch-files", onFiles); };
  }, []);
  useEffect(() => { if (loaded) write(KEY_BRIEF, { brief, mode, count, next, topic }); }, [loaded, brief, mode, count, next, topic]);
  useEffect(() => { if (loaded) setSaveErr(!write(KEY_QUEUE, items.map(({ id, n, name, html, warns, status, error, meta, metaError, loop }) => ({ id, n, name, html, warns, status, error, meta, metaError, loop })))); }, [loaded, items]);

  const ideas = mode === "daftar" ? batchIdeas(brief) : [];
  const target = mode === "daftar" ? Math.min(BATCH_MAX, ideas.length) : count;
  const pageBg = bg === "alpha" ? "alpha" : bg === "solid" ? color : "code";
  const prompt = batchPrompt({ brief, mode, count, aspect, duration, background: pageBg });
  const renderable = (x) => !x.warns.includes("besar");
  const picked = items.filter((x) => pick.has(x.id) && renderable(x));
  const patch = (id, p) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  function pushItems(got) {
    const used = new Set(items.map((x) => x.name)), have = new Set(items.map((x) => x.html)), fresh = [];
    for (const g of got) {
      if (have.has(g.html)) continue; have.add(g.html);
      fresh.push({ id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, n: g.n, name: uniqueName(g.name, used), html: g.html, warns: g.warns, status: "antre" });
    }
    setItems((xs) => [...xs, ...fresh]);
    setPick((p) => { const s = new Set(p); fresh.filter(renderable).forEach((x) => s.add(x.id)); return s; });
    return fresh;
  }

  async function addFiles(files) {
    const all = [...files].filter((f) => /\.html?$/i.test(f.name));
    if (!all.length) { setNote({ ok: false, text: "Pilih file .html." }); return; }
    const fit = all.filter((f) => f.size <= MAX_HTML);
    const got = await Promise.all(fit.map(async (f, i) => { const html = await f.text(); return { n: items.length + i + 1, name: f.name.replace(/\.html?$/i, ""), html, warns: htmlWarnings(html) }; }));
    const fresh = pushItems(got), dup = got.length - fresh.length, big = all.length - fit.length;
    setNote({ ok: fresh.length > 0, text: `${fresh.length} file masuk antrean${dup ? `, ${dup} sudah ada` : ""}${big ? `, ${big} terlalu besar (maks ${Math.round(MAX_HTML / 1000)} KB)` : ""}.` });
  }
  addRef.current = addFiles;

  function addPaste() {
    const got = splitBatch(paste);
    if (!got.length) { setNote({ ok: false, text: "Tidak ada kode HTML yang ditemukan. Tempel seluruh jawaban AI, termasuk penanda VIDEO n/N." }); return; }
    const fresh = pushItems(got);
    const maxN = Math.max(...got.map((g) => g.n)), of = got.find((g) => g.of)?.of || null;
    setNext(of && maxN < of ? { n: maxN + 1, of } : null);
    const cut = fresh.filter((x) => x.warns.includes("terpotong")).length, dup = got.length - fresh.length;
    setNote({ ok: true, text: `${fresh.length} HTML masuk antrean${dup ? `, ${dup} sudah ada` : ""}${cut ? `, ${cut} terpotong (cek tandanya)` : ""}.${of && maxN < of ? ` AI berhenti di nomor ${maxN} dari ${of}: salin pesan lanjut di kiri.` : ""}` });
    setPaste("");
  }

  // The Studio output plus the extra ratios ticked in the queue. Extra files get a ratio suffix; names stay ≤30 with -matte.mp4.
  const outputs = [{ w: ow, h: oh, suffix: "", ratio: aspect }, ...RATIOS.filter(([a]) => ratios.includes(a) && a !== aspect).map(([a, k]) => { const [w, h] = sizeForAspect(a, ow, oh); return { w, h, suffix: `-${k}`, ratio: a }; })];
  const outName = (name, size) => (size.suffix ? `${fileBase(name).slice(0, 16).replace(/-+$/, "")}${size.suffix}` : fileBase(name));
  // Into the picked folder when there is one; a refused write falls back to a normal download so a finished video is never lost.
  async function keep(blob, name) {
    const d = keepDir.current; if (!d) { saveBlob(blob, name); return; }
    try { await writeFile(d, blob, name); } catch { saveBlob(blob, name); }
  }
  // Ask where to save (Chrome opens in the last folder). Returns the folder, or null when cancelled.
  async function chooseFolder() {
    try { const d = await window.showDirectoryPicker({ id: "stockscope-render", mode: "readwrite", startIn: dir || "downloads" }); setDir(d); return d; }
    catch { return null; }
  }
  // Every rendered video still in memory (this session), for "Simpan semua".
  const rendered = items.flatMap((x) => out[x.id] || []);
  async function saveAll() {
    if (!rendered.length) return;
    let target = null;
    if (canPickFolder()) { target = await chooseFolder(); if (!target) return; }
    setSaving({ done: 0, n: rendered.length }); let bad = 0;
    for (let i = 0; i < rendered.length; i++) {
      const f = rendered[i];
      if (target) { try { await writeFile(target, f.blob, f.name); } catch { bad++; saveBlob(f.blob, f.name); } } else saveBlob(f.blob, f.name);
      setSaving({ done: i + 1, n: rendered.length });
    }
    setSaving(null);
    setNote({ ok: !bad, text: target ? `${rendered.length - bad} video disimpan ke folder “${target.name}”${bad ? `, ${bad} diunduh biasa (folder menolak)` : ""}.` : `${rendered.length} video diunduh.` });
  }

  async function renderAll() {
    const list = picked; if (!list.length) return;
    // The owner decides where the videos go before anything renders (Chrome/Edge); other browsers download as usual.
    let target = dir;
    if (canPickFolder() && !target) { target = await chooseFolder(); if (!target) { setNote({ ok: false, text: "Pilih folder simpan dulu, lalu render." }); return; } }
    keepDir.current = target;
    const ac = new AbortController(); abortRef.current = ac; setNote(null);
    let lock = null; try { lock = await navigator.wakeLock?.request("screen"); } catch {}
    try {
      for (let i = 0; i < list.length; i++) {
        if (ac.signal.aborted) break;
        const x = list[i], files = []; let loop = null, fast = true;
        patch(x.id, { status: "render", error: "", loop: null });
        try {
          for (const size of outputs) {
            if (ac.signal.aborted) throw new Error("Render dibatalkan.");
            const base = outName(x.name, size);
            setRun({ i, n: list.length, name: x.name, ratio: size.ratio, p: 0, left: null });
            const [pw, ph] = viewportFor(size.w, size.h);
            const r = await renderHtml({ html: x.html, frame: frameRef.current, size: { vw: pw, vh: ph, ow: size.w, oh: size.h }, bg: pageBg, fps, duration, mbps, signal: ac.signal,
              onProgress: (pr) => setRun((s) => s && { ...s, p: pr.p, left: pr.left }) });
            if (!loop && r.loop) loop = r.loop; fast = fast && r.fast;
            const made = [{ name: `${base}.${r.ext}`, blob: r.video }];
            if (r.matte) made.push({ name: `${base}-matte.${r.ext}`, blob: r.matte });
            for (const f of made) await keep(f.blob, f.name);
            files.push(...made);
            if (r.ext !== "mp4") setNote({ ok: false, text: "Browser ini tidak punya encoder H.264, jadi hasilnya WebM. Pakai Google Chrome untuk MP4." });
          }
          setOut((o) => ({ ...o, [x.id]: files })); patch(x.id, { status: "selesai", loop: loop && { ...loop, fast } });
          setPick((p) => { const s = new Set(p); s.delete(x.id); return s; });
        } catch (e) {
          if (ac.signal.aborted) { patch(x.id, { status: "antre" }); break; }
          patch(x.id, { status: "gagal", error: e.message });
        }
      }
    } finally { setRun(null); abortRef.current = null; try { await lock?.release(); } catch {} }
  }

  // SEO metadata for the ticked videos (or all without metadata), 10 per request, written by the AI gateway (Ciora).
  async function makeMeta() {
    const list = (picked.length ? picked : items.filter((x) => !x.meta)).filter((x) => !x.warns.includes("besar"));
    if (!list.length) return;
    setNote(null); setMetaRun({ done: 0, n: list.length });
    let ok = 0, bad = 0;
    for (let i = 0; i < list.length; i += 10) {
      const chunk = list.slice(i, i + 10);
      try {
        const r = await fetch("/api/motion/metadata", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "video", model: metaModel.model || undefined, research: topic.trim() ? { keyword: topic.trim() } : null,
            items: chunk.map((x) => ({ id: x.id, name: x.name, idea: mode === "daftar" ? (batchIdeas(brief)[x.n - 1] || brief) : brief, html: x.html })) }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `Gagal (${r.status})`);
        for (const res of d.results) { if (res.meta) { ok++; patch(res.id, { meta: res.meta, metaError: "" }); } else { bad++; patch(res.id, { metaError: res.error }); } }
      } catch (e) { bad += chunk.length; chunk.forEach((x) => patch(x.id, { metaError: e.message })); }
      setMetaRun({ done: Math.min(list.length, i + 10), n: list.length });
    }
    setMetaRun(null);
    setNote({ ok: !bad, text: `Metadata: ${ok} siap${bad ? `, ${bad} gagal (lihat tanda di kartu; coba lagi)` : ""}.` });
  }

  // CSV per platform for every video with metadata (file names = the rendered files). Motion from code is not AI → Shutterstock OK.
  function downloadCsv(kind) {
    const rows = items.filter((x) => x.meta).flatMap((x) => outputs.map((size) => ({ filename: `${outName(x.name, size)}.mp4`, ...x.meta, ai: false, kind: "video" })));
    if (!rows.length) return;
    const text = kind === "adobe" ? adobeCsv(rows) : kind === "shutterstock" ? shutterstockCsv(rows) : vecteezyCsv(rows);
    keep(new Blob([text], { type: "text/csv;charset=utf-8" }), `${kind}-motion.csv`);
  }
  const withMeta = items.filter((x) => x.meta).length;

  const selectWhere = (f) => setPick(new Set(items.filter((x) => renderable(x) && f(x)).map((x) => x.id)));
  const remove = (f) => { setItems((xs) => xs.filter((x) => !f(x))); setPick((p) => new Set([...p].filter((id) => items.some((x) => x.id === id && !f(x))))); };
  const busy = run !== null;

  const noteEl = note && <span className={note.ok ? "okbox" : "err"} style={{ fontSize: 13 }}>{note.text}</span>;
  const input = (
    <div className="ms-card ms-batch-prompt">
      <div className="ms-cardhead"><div><h2 className="ms-h">Upload HTML</h2><p className="ms-sub">Banyak file sekaligus, langsung masuk antrean</p></div></div>
      <input ref={filesRef} type="file" accept=".html,.htm,text/html" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      <button type="button" className={`ms-drop ${dropping ? "on" : ""}`} onClick={() => filesRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDropping(true); }} onDragLeave={() => setDropping(false)}
        onDrop={(e) => { e.preventDefault(); setDropping(false); addFiles(e.dataTransfer.files); }}>
        <b>Pilih atau seret file .html</b><span className="muted">Bisa puluhan file. Maks {Math.round(MAX_HTML / 1000)} KB per file.</span>
      </button>
      {noteEl}

      <div className="ms-cardhead ms-batch-sep"><div><h2 className="ms-h">Atau buat lewat AI lain</h2><p className="ms-sub">Jelaskan motion-nya, salin prompt, tempel jawabannya</p></div></div>
      <div className="seg" role="tablist" aria-label="Jenis brief">
        {[["variasi", "Satu ide → variasi"], ["daftar", "Daftar ide"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={mode === k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>{l}</button>)}
      </div>
      <textarea className="ms-batch-brief" value={brief} onChange={(e) => setBrief(e.target.value)} rows={5}
        placeholder={mode === "daftar" ? "Satu ide per baris, mis.\npartikel emas melayang pelan\ngrid neon retro bergerak maju\nikon wifi berkedip lalu muncul centang" : "Mis. partikel emas berkilau melayang pelan, nuansa mewah, untuk overlay judul. Gerak halus, tidak terlalu ramai."} />
      {mode === "variasi"
        ? <div className="ms-box"><span>Jumlah HTML (maks {BATCH_MAX})</span>
            <div className="ms-batch-count">
              <input type="number" min={1} max={BATCH_MAX} value={count} onChange={(e) => setCount(Math.min(BATCH_MAX, Math.max(1, Math.round(Number(e.target.value)) || 1)))} />
              <div className="ms-pills">{COUNTS.map((c) => <button key={c} type="button" className={count === c ? "on" : ""} onClick={() => setCount(c)}>{c}</button>)}</div>
            </div></div>
        : <p className="hint" style={{ margin: 0 }}>{ideas.length ? `${Math.min(BATCH_MAX, ideas.length)} ide = ${Math.min(BATCH_MAX, ideas.length)} HTML.` : "Tulis minimal satu ide."}{ideas.length > BATCH_MAX ? ` Hanya ${BATCH_MAX} pertama yang dipakai.` : ""}</p>}
      <p className="hint" style={{ margin: 0 }}>Prompt memakai rasio <b>{aspect}</b>, loop <b>{duration} dtk</b>, dan latar dari Pengaturan video.</p>
      <div className="btns">
        {target > 0 ? <CopyButton label={`Salin prompt ${target} HTML`} text={prompt} /> : <button type="button" disabled>Salin prompt</button>}
        {next && <CopyButton label={`Salin pesan lanjut (dari ${next.n})`} text={batchContinue(next.n, next.of)} />}
      </div>
      <textarea className="ms-batch-paste mono" value={paste} onChange={(e) => setPaste(e.target.value)} rows={4} spellCheck={false} aria-label="Jawaban AI"
        placeholder="Tempel seluruh jawaban AI di sini, boleh berkali-kali&#10;<!-- ===== VIDEO 1/10 · gold-dust-orbit ===== -->" />
      <div className="btns"><button type="button" className="primary" disabled={!paste.trim()} onClick={addPaste}>Pecah & tambahkan</button></div>
    </div>
  );

  return (
    <section className="ms-batch" id="batch">
      {slot && createPortal(input, slot)}
      <div className="ms-batch-head">
        <h2 className="section-title" style={{ margin: 0 }}>Antrean <em>video</em></h2>
        <span className="muted">Dari Agent, upload, atau jawaban AI · render dengan Pengaturan video di atas</span>
      </div>

      <div className="ms-card ms-batch-queue">
          {noteEl}
          {items.length > 0 && <>
            <div className="mbulk">
              <div className="chips">
                <button type="button" className="mini" disabled={busy} onClick={() => selectWhere(() => true)}>Pilih semua</button>
                <button type="button" className="mini" disabled={busy} onClick={() => selectWhere((x) => x.status !== "selesai")}>Yang belum dirender</button>
                <button type="button" className="mini" disabled={busy || !items.some((x) => x.status === "gagal")} onClick={() => selectWhere((x) => x.status === "gagal")}>Yang gagal</button>
                <button type="button" className="mini" disabled={busy} onClick={() => setPick(new Set())}>Kosongkan pilihan</button>
                <button type="button" className="mini" disabled={busy || !items.some((x) => x.status === "selesai")} onClick={() => remove((x) => x.status === "selesai")}>Hapus yang selesai</button>
                <button type="button" className="mini" disabled={busy} onClick={() => { if (window.confirm(`Hapus ${items.length} HTML dari antrean?`)) remove(() => true); }}>Hapus semua</button>
              </div>
              <p className="hint mono" style={{ margin: 0 }}>{ow}×{oh} · {fps} FPS · {duration} dtk · {BG_TEXT[bg]} · {mbps} Mbps <span className="muted">(ubah di Pengaturan video)</span></p>
              <div className="ms-batch-out">
                <div className="ms-batch-ratios" role="group" aria-label="Rasio tambahan"><span className="muted">Juga render ke</span>
                  {RATIOS.map(([a]) => <label key={a} className="mcheck"><input type="checkbox" disabled={busy || a === aspect} checked={a === aspect || ratios.includes(a)}
                    onChange={() => setRatios((r) => (r.includes(a) ? r.filter((x) => x !== a) : [...r, a]))} /> {a}</label>)}
                </div>
                {canPickFolder() && <button type="button" className="mini" disabled={busy} onClick={chooseFolder}>{dir ? `Folder simpan: ${dir.name} · ganti` : "Pilih folder simpan"}</button>}
              </div>
              <div className="btns">
                {busy ? <button type="button" onClick={() => abortRef.current?.abort()}>Batalkan</button>
                  : <button type="button" className="primary" disabled={!picked.length} onClick={renderAll}>Render {picked.length} video{outputs.length > 1 ? ` × ${outputs.length} rasio` : ""}</button>}
                <button type="button" disabled={busy || !rendered.length || !!saving} onClick={saveAll}
                  title="Simpan ulang semua video yang sudah dirender di sesi ini ke folder pilihanmu">
                  {saving ? `Menyimpan ${saving.done}/${saving.n}…` : `Simpan semua video (${rendered.length})`}</button>
              </div>
              {run && <div className="mbulk-run">
                <b>Video {run.i + 1}/{run.n}: {run.name}{outputs.length > 1 ? ` · ${run.ratio}` : ""}</b>
                <div className="progress" style={{ width: "100%" }}><i style={{ width: `${Math.round(run.p * 100)}%` }} /></div>
                <small className="muted">{Math.round(run.p * 100)}%{run.left != null ? ` · video ini selesai ${mins(run.left)} lagi` : ""}. Biarkan tab ini terbuka dan terlihat.</small>
              </div>}
              <div className="ms-box"><span>Metadata SEO (AI)</span>
                <input value={topic} maxLength={80} onChange={(e) => setTopic(e.target.value)} placeholder="Keyword riset, mis. gold particles background" aria-label="Keyword riset untuk metadata" />
                <div className="btns">
                  <button type="button" disabled={!metaAi?.enabled || !!metaRun || busy} onClick={makeMeta}
                    title={metaAi?.enabled ? `Model: ${metaAi.model}` : "Isi ANTHROPIC_API_KEY (+ ANTHROPIC_BASE_URL Ciora) di server"}>
                    {metaRun ? `Menulis metadata ${metaRun.done}/${metaRun.n}…` : `Buat metadata ${picked.length ? picked.length + " dipilih" : "yang belum ada"}`}
                  </button>
                  <button type="button" className="mini" disabled={!withMeta} onClick={() => downloadCsv("adobe")}>CSV Adobe ({withMeta})</button>
                  <button type="button" className="mini" disabled={!withMeta} onClick={() => downloadCsv("shutterstock")}>CSV Shutterstock</button>
                  <button type="button" className="mini" disabled={!withMeta} onClick={() => downloadCsv("vecteezy")}>CSV Vecteezy</button>
                </div>
                {metaAi?.enabled && <ModelPicker task="meta" choice={metaModel} label="Model AI untuk metadata" />}
                {metaAi && !metaAi.enabled && <small className="muted">Butuh ANTHROPIC_API_KEY di server (untuk Ciora: ANTHROPIC_BASE_URL=https://ciora.id/v1).</small>}
              </div>
              {!run && canPickFolder() && <p className="hint" style={{ margin: 0 }}>Hanya file video (MP4{bg === "alpha" ? " + -matte.mp4" : ""}) yang disimpan, tanpa JPG. {dir ? `Hasil render masuk ke folder “${dir.name}”.` : "Saat menekan Render, pilih dulu folder tujuan."}</p>}
              {!run && !canPickFolder() && <p className="hint" style={{ margin: 0 }}>Browser ini tidak bisa memilih folder: video diunduh ke folder Unduhan. Chrome mungkin bertanya sekali “izinkan mengunduh beberapa file”: pilih Izinkan.</p>}
              {saveErr && <p className="hint err" style={{ margin: 0 }}>Antrean terlalu besar untuk disimpan di browser: tetap bisa dirender, tapi hilang kalau halaman dimuat ulang.</p>}
            </div>

            <div className="mjobs">
              {items.map((x) => {
                const [label, cls] = STATUS[x.status] || STATUS.antre;
                return (
                  <div key={x.id} className={`mjob ${pick.has(x.id) ? "picked" : ""}`}>
                    <label className="mcheck">
                      <input type="checkbox" disabled={busy || !renderable(x)} checked={pick.has(x.id)} onChange={() => setPick((p) => { const s = new Set(p); s.has(x.id) ? s.delete(x.id) : s.add(x.id); return s; })} />
                      <span className={`mstatus s-${cls}`}>{label}</span> <span className="muted mono">#{x.n}</span>
                    </label>
                    <input className="ms-batch-name mono" aria-label="Nama file" value={x.name} maxLength={20} disabled={busy}
                      onChange={(e) => patch(x.id, { name: cleanName(e.target.value) })} />
                    <small className="muted">{kb(x.html)} · {followsStudio(x.html) ? "✓ ikut pengaturan Studio" : "ukuran/durasi dari kodenya"}</small>
                    {x.warns.some((w) => WARN[w]) && <div className="chips">{x.warns.filter((w) => WARN[w]).map((w) => <span key={w} className="mini err" title={WARN[w][1]}>{WARN[w][0]}</span>)}</div>}
                    {x.loop && <div className="chips">
                      {x.loop.ok ? <span className="mini" title={`Frame terakhir menyambung ke frame pertama (selisih ${x.loop.seam}, gerak normal ${x.loop.step}).`}>✓ Loop mulus</span>
                        : <span className="mini err" title={`Frame terakhir tidak menyambung ke frame pertama (lompatan ${x.loop.seam}, gerak normal per frame ${x.loop.step}): videonya meloncat saat diulang. Minta AI memakai siklus utuh (S.u) atau cek durasi.`}>Loop patah</span>}
                      {x.loop.fast && <span className="mini" title="Halaman satu canvas: piksel disalin langsung, render jauh lebih cepat.">⚡ Render cepat</span>}
                    </div>}
                    {x.error && <small className="err">{x.error}</small>}
                    {x.meta ? <small title={x.meta.keywords.join(", ")}>✓ <b>{x.meta.title}</b> <span className="muted">· {x.meta.keywords.length} keyword · Adobe {x.meta.adobeCategory}</span></small>
                      : x.metaError ? <small className="err">Metadata: {x.metaError}</small> : null}
                    <div className="chips">
                      <button type="button" className="mini" onClick={() => onPreview(x)}>Pratinjau</button>
                      {out[x.id]?.map((f) => <button key={f.name} type="button" className="mini" title={canSaveAs() ? "Pilih sendiri tempat menyimpan file ini" : "Diunduh ke folder Unduhan"} onClick={() => saveAs(f.blob, f.name)}>{canSaveAs() ? `Simpan ${f.name} ke…` : `Unduh ${f.name}`}</button>)}
                      <button type="button" className="mini" disabled={busy} onClick={() => remove((y) => y.id === x.id)}>Hapus</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>}
          {!items.length && <p className="hint" style={{ margin: 0 }}>Antrean kosong. Jalankan Agent, atau upload file HTML di tab Bulk. Isinya tersimpan di browser ini sampai dihapus.</p>}
      </div>
      <iframe ref={frameRef} sandbox="allow-scripts" title="Perekam batch" aria-hidden="true" tabIndex={-1} className="cve-offscreen" />
    </section>
  );
}
