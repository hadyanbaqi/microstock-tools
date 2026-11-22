"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_HTML, followsStudio, htmlPrompt, viewportFor } from "@/lib/htmlMotion.mjs";
import { DEFAULT_HTML, DEFAULT_NAME } from "@/lib/defaultMotion.mjs";
import { canPickFolder, canSaveAs, loadFrame, renderHtml, fileBase, saveAs, writeFile } from "./htmlRender";
import { CopyButton } from "./ui";

// Studio Motion: one HTML/CSS/JS file in one editor, a live preview on the same virtual clock as the render
// (lib/htmlMotion.mjs), flexible video settings and export to MP4 (H.264, WebCodecs/Mediabunny) or MOV (ProRes 4444,
// ffmpeg.wasm, real alpha). The prompt template builds a prompt for ChatGPT / Gemini / Claude that writes the code.
const FPS = [24, 25, 30, 50, 60];
const DURS = [5, 10, 15, 30];
const SIZES = [["1920x1080", "Full HD · 16:9"], ["1080x1920", "Vertikal · 9:16"], ["1080x1080", "Persegi · 1:1"], ["3840x2160", "4K UHD · stock"]];
const BITRATES = [[16, "16"], [40, "40"], [100, "100"]];
const QUICK_COLORS = [["#00FF00", "Green screen"], ["#000000", "Hitam"], ["#FFFFFF", "Putih"], ["#0F172A", "Navy"]];
const FORMATS = [["mp4", "MP4 · H.264"], ["mov", "MOV · ProRes 4444"]];
const WARN = { smil: "Ada animasi SVG SMIL (<animate>): tidak ikut terekam. Ganti dengan CSS @keyframes atau JavaScript." };
const AI_SITES = [["ChatGPT", "https://chatgpt.com/"], ["Gemini", "https://gemini.google.com/app"], ["Claude", "https://claude.ai/new"]];

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#141415" />
      <g transform="translate(6.4 6.4) scale(0.8)"><path d="M24 8 H52 V30 H24 A11 11 0 0 1 24 8 Z" fill="#ff6a2b" /><path d="M12 34 H40 A11 11 0 0 1 40 56 H12 Z" fill="#ffa36b" /></g>
    </svg>
  );
}

const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1).replace(".", ",")} MB` : `${Math.round(b / 1e3)} KB`);
const fmtNum = (n) => (n ?? 0).toLocaleString("id-ID");
const clock = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return `${String(m).padStart(2, "0")}:${r.toFixed(2).padStart(5, "0").replace(".", ",")}`; };
const mmss = (s) => (Number.isFinite(s) ? `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "--:--");
const even = (v, d) => Math.min(4096, Math.max(256, Math.round((Number(v) || d) / 2) * 2));

// ---------- preview: frame-mode page driven by the parent's clock ----------
const Preview = memo(function Preview({ code, runKey, vw, vh, ow, oh, fps, duration, bg, color, loop, follows, onErrors, onDocSize }) {
  const frameRef = useRef(null), boxRef = useRef(null), tRef = useRef(0), lastN = useRef(-1);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [grid, setGrid] = useState(false);
  const [box, setBox] = useState([640, 360]);
  const [ready, setReady] = useState(false);
  const total = Math.max(1, Math.round(fps * duration));
  const pageBg = bg === "alpha" ? "alpha" : bg === "solid" ? color : "code";

  const seek = useCallback((sec, force) => {
    const n = Math.min(total - 1, Math.max(0, Math.floor(sec * fps + 1e-6)));
    if (!force && n === lastN.current) return;
    lastN.current = n;
    frameRef.current?.contentWindow?.postMessage({ cveSeek: true, t: (n * 1000) / fps, dt: 1000 / fps }, "*");
  }, [fps, total]);

  useEffect(() => { const el = boxRef.current; if (!el) return; const ro = new ResizeObserver(() => setBox([el.clientWidth, el.clientHeight])); ro.observe(el); return () => ro.disconnect(); }, []);

  // (Re)load the page on Run, size or background changes; then show the current time.
  useEffect(() => {
    const f = frameRef.current; if (!f) return;
    onErrors([]); onDocSize(null); setReady(false);
    if (!code.trim()) { f.src = "about:blank"; return; }
    let live = true;
    const onErr = (e) => { if (e.source === f.contentWindow && e.data?.cveError) onErrors((x) => (x.length > 4 ? x : [...x, e.data.cveError])); };
    window.addEventListener("message", onErr);
    const loading = loadFrame(f, code, "frame", vw, vh, pageBg, { duration, fps });
    loading.then((d) => { if (!live) return; onDocSize([d.w, d.h]); setReady(true); lastN.current = -1; seek(tRef.current, true); })
      .catch((e) => live && onErrors([e.message]));
    return () => { live = false; loading.cancel?.(); window.removeEventListener("message", onErr); };
  }, [runKey, vw, vh, pageBg, duration, fps]); // eslint-disable-line react-hooks/exhaustive-deps

  // Playback: advance the virtual clock in real time, snapped to whole frames.
  useEffect(() => {
    if (!playing || !ready) return;
    let raf, timer, last = performance.now();
    const tick = (now) => {
      // Studio Motion stays mounted (hidden) on other pages: don't spin the animation loop while it can't be seen.
      if (!frameRef.current?.offsetParent) { last = performance.now(); timer = setTimeout(() => { raf = requestAnimationFrame(tick); }, 500); return; }
      let nt = tRef.current + (now - last) / 1000; last = now;
      if (nt >= duration) { if (loop) nt %= duration; else { nt = (total - 1) / fps; setPlaying(false); } }
      tRef.current = nt; seek(nt); setT(nt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [playing, ready, duration, loop, seek, total, fps]);

  const jump = (sec) => { const s = Math.min((total - 1) / fps, Math.max(0, sec)); tRef.current = s; setT(s); seek(s, true); };
  const step = (k) => { setPlaying(false); jump((Math.floor(tRef.current * fps + 1e-6) + k) / fps); };
  const n = Math.min(total - 1, Math.floor(t * fps + 1e-6));
  const scale = Math.max(0.05, Math.min((box[0] - 40) / vw, (box[1] - 40) / vh)) || 0.3;
  const zoom = Math.round(((scale * vw) / ow) * 100);

  return (
    <div className="stage-col">
      <div className="stage-bar">
        <span className="tag mono">{ow}×{oh}</span>
        <span className="tag mono">{fps} FPS</span>
        <span className="tag mono" title="Ukuran tampilan dibanding ukuran video">{zoom}%</span>
        <span className="tag mono" title={follows ? "Kode memakai window.STUDIO: ukuran, durasi dan latar ikut pengaturan" : "Kode tidak memakai window.STUDIO: ukuran, durasi loop dan latar mengikuti kodenya"}>{!code.trim() ? "—" : follows ? "✓ ikut pengaturan" : "ukuran dari kode"}</span>
        <span className="tag mono grow-gap">{bg === "alpha" ? "Transparan" : bg === "solid" ? color : "Latar kode"}</span>
        <button type="button" className={`mini ${grid ? "on" : ""}`} aria-pressed={grid} onClick={() => setGrid((v) => !v)} title="Safe area & rule of thirds">Grid</button>
      </div>
      <div className="ms-viewport" ref={boxRef}>
        <div className={`ms-stage ${bg === "alpha" ? "checker" : ""}`} style={{ width: vw * scale, height: vh * scale }}>
          <iframe ref={frameRef} sandbox="allow-scripts" title="Pratinjau animasi HTML"
            style={{ width: vw, height: vh, transform: `scale(${scale})`, visibility: code.trim() ? "visible" : "hidden" }} />
          {grid && <div className="ms-grid" aria-hidden="true"><i /><span /></div>}
        </div>
        {!code.trim() && <div className="cve-empty"><b>Belum ada animasi</b><span>Tempel kode atau import .html</span></div>}
      </div>
      <div className="ms-transport">
        <button type="button" className="primary round" disabled={!code.trim()} onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>{playing ? "❚❚" : "▶"}</button>
        <button type="button" className="mini" disabled={!code.trim()} onClick={() => { jump(0); setPlaying(true); }} title="Restart">↻</button>
        <button type="button" className="mini mono" disabled={!code.trim()} onClick={() => step(-1)} title="Mundur 1 frame">−1F</button>
        <button type="button" className="mini mono" disabled={!code.trim()} onClick={() => step(1)} title="Maju 1 frame">+1F</button>
        <span className="mono ms-now">{clock(n / fps)}</span>
        <input type="range" min={0} max={total - 1} step={1} value={n} aria-label="Timeline frame"
          onChange={(e) => { setPlaying(false); jump(Number(e.target.value) / fps); }} />
        <span className="mono muted">{clock(duration)}</span>
        <span className="mono muted frames">{fmtNum(n + 1)}/{fmtNum(total)}</span>
      </div>
    </div>
  );
});

// ---------- render progress dialog ----------
function RenderDialog({ busy, files, error, warns, loopRes, info, onCancel, onClose }) {
  const running = busy !== null;
  const [saved, setSaved] = useState("");
  useEffect(() => { const k = (e) => e.key === "Escape" && !running && onClose(); document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [running, onClose]);
  const p = busy?.p ?? (files.length ? 1 : 0);
  return (
    <div className="modal-back" onClick={() => !running && onClose()}>
      <div className="modal panel ms-dialog" role="dialog" aria-modal="true" aria-labelledby="ms-render-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="ms-render-title">{running ? "Merender…" : error ? "Render gagal" : "Video siap"} <span className="ms-tag mono">{info.format}</span></h2>
        <p className="hint" style={{ marginTop: -8 }}>{running ? "Menangkap animasi frame demi frame dengan jam virtual, jadi tidak ada frame yang terlewat." : error ? "" : `${fmtNum(info.total)} frame selesai dirender.`}</p>
        <div className="ms-progress">
          <div className="ms-progress-top mono">
            <span><b>{fmtNum(busy?.n ?? (files.length ? info.total : 0))}</b> <span className="muted">/ {fmtNum(info.total)} frame</span></span>
            <b className="lime">{(p * 100).toFixed(1).replace(".", ",")}%</b>
          </div>
          <div className="mbar" aria-hidden="true"><span style={{ width: `${p * 100}%` }} /></div>
          <div className="ms-stats">
            <div><span>Frame sekarang</span><b className="mono">{fmtNum(busy?.n ?? 0)}</b></div>
            <div><span>Total frame</span><b className="mono">{fmtNum(info.total)}</b></div>
            <div><span>Berjalan</span><b className="mono lime">{mmss(busy?.elapsed ?? 0)}</b></div>
            <div><span>Sisa</span><b className="mono amber">{running ? (busy?.left != null && busy.n > 3 ? mmss(busy.left) : "--:--") : "00:00"}</b></div>
          </div>
          <div className="ms-pipe mono">{info.ow}×{info.oh} · {info.fps} FPS · {info.codec}</div>
        </div>
        {warns.filter((w) => WARN[w]).map((w) => <div key={w} className="notice">{WARN[w]}</div>)}
        {!running && loopRes && (loopRes.ok
          ? <div className="notice okbox">✓ Loop mulus: frame terakhir menyambung ke frame pertama.{loopRes.fast ? " ⚡ Halaman satu canvas, jadi direkam lewat jalur cepat." : ""}</div>
          : <div className="notice err">Loop patah: frame terakhir tidak menyambung ke frame pertama (lompatan {loopRes.seam}, gerak normal per frame {loopRes.step}), jadi videonya meloncat saat diulang. Pastikan semua gerak memakai siklus utuh dari STUDIO.u, atau samakan durasi dengan kodenya.</div>)}
        {error && <div className="notice err">{error}</div>}
        {files.length > 0 && <div className="ms-files">{files.map((f) => canSaveAs()
          ? <button key={f.name} type="button" className="mini primary" title="Pilih tempat menyimpan file ini" onClick={() => saveAs(f.blob, f.name)}>Simpan {f.name} ke… · {fmtSize(f.size)}</button>
          : <a key={f.name} className="mini primary" href={f.url} download={f.name}>⬇ {f.name} · {fmtSize(f.size)}</a>)}</div>}
        {files.length > 0 && canPickFolder() && <div className="ms-files">
          <button type="button" className="mini" onClick={async () => { let d; try { d = await window.showDirectoryPicker({ id: "studio-motion-render", mode: "readwrite", startIn: "downloads" }); } catch { return; }
            let ok = 0; for (const f of files) { try { await writeFile(d, f.blob, f.name); ok++; } catch {} } setSaved(`${ok} file disimpan ke folder “${d.name}”.`); }}>Simpan semua ke folder…</button>
          {files.map((f) => <a key={f.name} className="mini" href={f.url} download={f.name}>⬇ Unduh biasa {f.name}</a>)}
          {saved && <small className="muted">{saved}</small>}
        </div>}
        <div className="btns" style={{ justifyContent: "flex-end" }}>
          {running ? <button type="button" onClick={onCancel}>Batalkan</button> : <button type="button" onClick={onClose}>Tutup</button>}
        </div>
      </div>
    </div>
  );
}

export default function Studio() {
  const [code, setCode] = useState(DEFAULT_HTML);
  const [name, setName] = useState(DEFAULT_NAME);
  const [tab, setTab] = useState("code");
  const [sizeKey, setSizeKey] = useState("1920x1080");
  const [cw, setCw] = useState(1920), [ch, setCh] = useState(1080);
  const [fps, setFps] = useState(30);
  const [duration, setDuration] = useState(10);
  const [bg, setBg] = useState("code");
  const [color, setColor] = useState("#00FF00");
  const [format, setFormat] = useState("mp4");
  const [mbps, setMbps] = useState(40);
  const [loop, setLoop] = useState(true);
  const [auto, setAuto] = useState(true);
  const [runKey, setRunKey] = useState(0);
  const [errors, setErrors] = useState([]);
  const [docSize, setDocSize] = useState(null);
  const [warns, setWarns] = useState([]);
  const [loopRes, setLoopRes] = useState(null);
  const [busy, setBusy] = useState(null);
  const [dialog, setDialog] = useState(false);
  const [files, setFiles] = useState([]);
  const [renderErr, setRenderErr] = useState("");
  const [err, setErr] = useState("");
  const [caret, setCaret] = useState([1, 1]);
  const [idea, setIdea] = useState("");
  const renderRef = useRef(null), abortRef = useRef(null), fileRef = useRef(null), taRef = useRef(null), gutterRef = useRef(null), tabFree = useRef(false);

  const [ow, oh] = sizeKey === "custom" ? [cw, ch] : sizeKey.split("x").map(Number);
  const [vw, vh] = useMemo(() => viewportFor(ow, oh), [ow, oh]);
  const total = Math.max(1, Math.round(fps * duration));
  const lines = useMemo(() => code.split("\n").length, [code]);
  const alpha = bg === "alpha", mov = format === "mov";
  const run = () => setRunKey((k) => k + 1);
  // Auto run 0.8 s after typing stops.
  useEffect(() => { if (!auto) return; const t = setTimeout(run, 800); return () => clearTimeout(t); }, [code, auto]);

  function loadCode(html, base, opts = {}) {
    setCode(html); setName(base || ""); setTab("code"); setErr("");
    if (opts.bg === "alpha") setBg("alpha"); else if (opts.bg?.startsWith("#")) { setBg("solid"); setColor(opts.bg.toUpperCase()); }
    run();
  }
  async function paste() {
    try { const t = await navigator.clipboard.readText(); if (t.trim()) loadCode(cleanReply(t), name); else setErr("Clipboard kosong."); }
    catch { setTab("code"); setErr("Browser menolak akses clipboard: klik kotak kode lalu tekan Ctrl/Cmd+V."); taRef.current?.focus(); }
  }
  function importFile(file) {
    if (!file) return;
    if (file.size > MAX_HTML) { setErr(`File terlalu besar (maks ${Math.round(MAX_HTML / 1000)} KB).`); return; }
    const fr = new FileReader(); fr.onload = () => loadCode(String(fr.result), file.name.replace(/\.html?$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20));
    fr.onerror = () => setErr("File tidak bisa dibaca."); fr.readAsText(file);
  }
  function saveHtml() { const a = document.createElement("a"), url = URL.createObjectURL(new Blob([code], { type: "text/html" })); a.href = url; a.download = `${fileBase(name)}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }

  const aspect = ow === oh ? "1:1" : ow > oh ? "16:9" : "9:16";
  const background = alpha ? "alpha" : bg === "solid" ? color : "code";
  const prompt = useMemo(() => htmlPrompt({ idea: idea.trim() || "(TULIS MOTION YANG KAMU MAU DI SINI)", aspect, duration, background }), [idea, aspect, duration, background]);

  async function render() {
    if (!code.trim()) { setErr("Belum ada kode HTML. Tempel kode, import file, atau buat dari Prompt template."); setTab("code"); return; }
    if (code.length > MAX_HTML) { setErr(`HTML terlalu besar (maks ${Math.round(MAX_HTML / 1000)} KB).`); return; }
    setErr(""); setWarns([]); setRenderErr(""); setLoopRes(null);
    setFiles((fs) => { fs.forEach((f) => URL.revokeObjectURL(f.url)); return []; });
    const ac = new AbortController(); abortRef.current = ac; setBusy({ p: 0, n: 0, elapsed: 0 }); setDialog(true);
    try {
      const out = await renderHtml({ html: code, frame: renderRef.current, size: { vw, vh, ow, oh }, bg: background, fps, duration, mbps, format, signal: ac.signal, onProgress: setBusy, onWarn: setWarns });
      setLoopRes(out.loop ? { ...out.loop, fast: out.fast } : null);
      const base = fileBase(name), list = [{ name: `${base}.${out.ext}`, blob: out.video }];
      if (out.matte) list.push({ name: `${base}-matte.${out.ext}`, blob: out.matte });
      if (out.poster) list.push({ name: `${base}-poster.jpg`, blob: out.poster });
      setFiles(list.map((f) => ({ ...f, url: URL.createObjectURL(f.blob), size: f.blob.size })));
      if (out.ext === "webm") setRenderErr("Browser ini tidak punya encoder H.264, jadi hasilnya WebM. Pakai Google Chrome untuk MP4.");
    } catch (e) { setRenderErr(e.message); }
    finally { setBusy(null); abortRef.current = null; }
  }

  const onCaret = (e) => { const t = e.target, before = t.value.slice(0, t.selectionStart).split("\n"); setCaret([before.length, before[before.length - 1].length + 1]); };
  const sizeMismatch = docSize && (docSize[0] > vw + 2 || docSize[1] > vh + 2);
  const follows = useMemo(() => followsStudio(code), [code]);
  const px = (ow * oh) / 2073600;
  const estMb = Math.round(px * (fps / 30) * 19 * duration); // ProRes 4444 ≈ 150 Mbps at 1080p30
  const estSec = Math.round(total * 0.3 * px); // ffmpeg.wasm ≈ 0.3 s per 1080p frame
  const codec = mov ? "ProRes 4444" : `H.264 ${mbps} Mbps${alpha ? " + luma matte" : ""}`;
  const sumFormat = mov ? "MOV ProRes 4444" : `MP4 H.264${alpha ? " + matte" : ""}`;

  const tabBtn = (k, l) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>;
  const group = (title, right, children) => <section className="ins-sec"><div className="ins-title"><span>{title}</span>{right}</div>{children}</section>;

  return (
    <div className="app">
      <header className="bar">
        <span className="brand" aria-label="Studio Motion"><Logo /><span className="brand-word">Studio<span>Motion</span></span></span>
        <input className="bar-name mono" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 20))} maxLength={20} placeholder="nama-file" aria-label="Nama file" />
        <div className="bar-actions">
          <input ref={fileRef} type="file" accept=".html,.htm,text/html" hidden onChange={(e) => { importFile(e.target.files[0]); e.target.value = ""; }} />
          <button type="button" onClick={() => fileRef.current?.click()}>Import .html</button>
          <button type="button" onClick={paste}>Tempel</button>
          <button type="button" className="primary" disabled={busy !== null} onClick={render}>{busy !== null ? `Render ${Math.round((busy.p || 0) * 100)}%` : `Render ${mov ? "MOV" : "MP4"}`}</button>
        </div>
      </header>

      <div className="app-body">
        <aside className="pane pane-left">
          <div className="pane-head">
            <div className="seg" role="tablist" aria-label="Editor">{tabBtn("code", "Kode")}{tabBtn("template", "Prompt")}</div>
            {tab === "code" && <>
              <label className="mcheck"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto</label>
              <button type="button" className="mini" disabled={!code.trim()} onClick={run} title="Ctrl/Cmd + Enter">↻ Jalankan</button>
            </>}
          </div>

          {tab === "code" && <>
            <div className="cve-code ms-code">
              <pre ref={gutterRef} aria-hidden="true">{Array.from({ length: lines }, (_, i) => i + 1).join("\n")}</pre>
              <textarea ref={taRef} spellCheck={false} value={code} aria-label="Kode HTML animasi" placeholder={"<!DOCTYPE html>\n<style>…</style>\n<script>…</script>"}
                onChange={(e) => setCode(e.target.value)} onSelect={onCaret} onKeyUp={onCaret} onClick={onCaret}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); }
                  if (e.key === "Escape") tabFree.current = true; // Esc, then Tab leaves the editor (keyboard users)
                  else if (e.key === "Tab" && !e.shiftKey && tabFree.current) tabFree.current = false;
                  else if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); const t = e.target, s = t.selectionStart; setCode(code.slice(0, s) + "  " + code.slice(t.selectionEnd)); requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2; }); }
                }}
                onScroll={(e) => { if (gutterRef.current) gutterRef.current.scrollTop = e.target.scrollTop; }} />
            </div>
            <div className="pane-foot">
              <button type="button" className="mini" onClick={() => loadCode(DEFAULT_HTML, DEFAULT_NAME, { bg: "code" })}>Default</button>
              {code && <button type="button" className="mini" onClick={saveHtml}>Simpan</button>}
              {code && <button type="button" className="mini" onClick={() => { setCode(""); setName(""); setErrors([]); }}>Kosongkan</button>}
              <span className="mono muted foot-r"><i className={errors.length ? "dot err" : "dot"} />Ln {caret[0]}, Col {caret[1]} · {fmtSize(new Blob([code]).size)}</span>
            </div>
          </>}

          {tab === "template" && <div className="tpl">
            <label className="mparam"><span>Motion yang mau dibuat</span>
              <textarea rows={3} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="mis. gelembung sabun transparan naik pelan, cahaya lembut" /></label>
            <div className="btns">
              <CopyButton className="primary" label="Salin prompt" text={prompt} />
              {AI_SITES.map(([l, url]) => <button key={l} type="button" onClick={() => { navigator.clipboard?.writeText(prompt).catch(() => {}); window.open(url, "_blank", "noopener"); }}>{l} ↗</button>)}
            </div>
            <textarea className="ms-promptview mono" readOnly value={prompt} aria-label="Prompt" onFocus={(e) => e.target.select()} />
            <div className="tpl-meta mono">{aspect} · {duration} dtk · {alpha ? "transparan" : bg === "solid" ? color : "latar bebas"} <button type="button" className="linkish" onClick={() => setTab("code")}>Tempel hasil di Kode →</button></div>
          </div>}
          {err && <div className="notice err">{err}</div>}
        </aside>

        <main className="pane pane-center">
          <Preview code={code} runKey={runKey} vw={vw} vh={vh} ow={ow} oh={oh} fps={fps} duration={duration} bg={bg} color={color} loop={loop} follows={follows}
            onErrors={setErrors} onDocSize={setDocSize} />
          {(errors.length > 0 || sizeMismatch) && <div className="stage-notes">
            {errors.map((m, i) => <div key={i} className="notice err">Error: {m}</div>)}
            {sizeMismatch && <div className="notice">HTML {docSize[0]}×{docSize[1]} lebih besar dari kanvas {vw}×{vh}: sebagian terpotong.</div>}
          </div>}
        </main>

        <aside className="pane pane-right">
          <div className="ins">
            {group("Format", null,
              <div className="seg full" role="group" aria-label="Format export">
                {FORMATS.map(([k, l]) => <button key={k} type="button" className={format === k ? "on" : ""} aria-pressed={format === k} onClick={() => setFormat(k)}>{l}</button>)}
              </div>)}
            {group("Resolusi", null, <>
              <div className="ms-opts">
                {SIZES.map(([k, l]) => <button key={k} type="button" className={sizeKey === k ? "on" : ""} aria-pressed={sizeKey === k} onClick={() => setSizeKey(k)}><b className="mono">{k.replace("x", "×")}</b><span>{l}</span></button>)}
              </div>
              <div className={`ms-custom ${sizeKey === "custom" ? "on" : ""}`}>
                <button type="button" className="linkish" onClick={() => setSizeKey("custom")}>Custom</button>
                <input type="number" aria-label="Lebar" value={cw} min={256} max={4096} onFocus={() => setSizeKey("custom")} onChange={(e) => setCw(Number(e.target.value))} onBlur={() => setCw(even(cw, 1920))} />
                <span className="muted">×</span>
                <input type="number" aria-label="Tinggi" value={ch} min={256} max={4096} onFocus={() => setSizeKey("custom")} onChange={(e) => setCh(Number(e.target.value))} onBlur={() => setCh(even(ch, 1080))} />
              </div>
            </>)}
            {group("Durasi", <span className="tag mono lime">{fmtNum(total)} frame</span>, <>
              <div className="dur">
                <label className="ms-box"><input type="number" aria-label="Durasi (detik)" min={1} max={120} value={duration} onChange={(e) => setDuration(Math.min(120, Math.max(1, Math.round(Number(e.target.value)) || 10)))} /><span>detik</span></label>
                <div className="ms-pills">{DURS.map((d) => <button key={d} type="button" className={duration === d ? "on" : ""} onClick={() => setDuration(d)}>{d}</button>)}</div>
              </div>
            </>)}
            {group("FPS", null, <div className="ms-pills wide" role="group" aria-label="FPS">{FPS.map((f) => <button key={f} type="button" className={fps === f ? "on" : ""} aria-pressed={fps === f} onClick={() => setFps(f)}>{f}</button>)}</div>)}
            {group("Background", null, <>
              <div className="seg full" role="group" aria-label="Background">
                <button type="button" className={bg === "code" ? "on" : ""} onClick={() => setBg("code")}>Kode</button>
                <button type="button" className={alpha ? "on" : ""} onClick={() => setBg("alpha")}>Transparan</button>
                <button type="button" className={bg === "solid" ? "on" : ""} onClick={() => setBg("solid")}>Solid</button>
              </div>
              {bg === "solid" && <div className="ms-colors">
                <input type="color" aria-label="Warna latar" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} />
                <input className="mono" aria-label="Kode warna" value={color} maxLength={7} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && setColor(e.target.value.toUpperCase())} />
                {QUICK_COLORS.map(([c, l]) => <button key={c} type="button" className="swatch" title={l} aria-label={l} style={{ background: c }} onClick={() => setColor(c)} />)}
              </div>}
              {!mov && alpha && <p className="note">MP4 tanpa alpha: hasil video + file matte. Pakai MOV untuk alpha asli.</p>}
            </>)}
            {!mov && group("Bitrate", <span className="muted mono">Mbps</span>, <div className="ms-pills wide">{BITRATES.map(([v, l]) => <button key={v} type="button" className={mbps === v ? "on" : ""} onClick={() => setMbps(v)}>{l}</button>)}</div>)}
            <label className="mcheck loopchk"><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Loop pratinjau</label>
          </div>
          <div className="ins-foot">
            <div className="sum mono"><span>{ow}×{oh} · {fps} FPS · {fmtNum(total)}F</span><b className="lime">{sumFormat}</b></div>
            {mov && <div className={`note mono ${estMb > 1500 ? "warn" : ""}`}>≈ {fmtNum(estMb)} MB · render ±{mmss(estSec)}{estMb > 1500 ? " · terlalu besar untuk browser" : ""}</div>}
            {files.length > 0 && busy === null && <button type="button" className="linkish" onClick={() => setDialog(true)}>Lihat hasil render terakhir</button>}
          </div>
        </aside>
      </div>

      <iframe ref={renderRef} sandbox="allow-scripts" title="Perekam" aria-hidden="true" tabIndex={-1} className="cve-offscreen" style={{ width: vw, height: vh }} />
      {dialog && <RenderDialog busy={busy} files={files} error={renderErr} warns={warns} loopRes={loopRes} info={{ ow, oh, fps, total, codec, format: sumFormat, duration }}
        onCancel={() => abortRef.current?.abort()} onClose={() => setDialog(false)} />}
    </div>
  );
}

// An AI reply pasted as-is: keep only the HTML document (drops chat text and ``` fences around it).
function cleanReply(t) {
  const a = t.search(/<!DOCTYPE html|<html/i), b = t.toLowerCase().lastIndexOf("</html>");
  return a >= 0 ? t.slice(a, b > a ? b + 7 : undefined) : t.replace(/^```html?\s*|```\s*$/g, "");
}
