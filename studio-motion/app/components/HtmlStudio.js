"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ModelPicker, { useModelChoice } from "./ModelPicker";
import { MAX_HTML, followsStudio, htmlPrompt, SAMPLE_HTML, viewportFor } from "@/lib/htmlMotion.mjs";
import { canPickFolder, canSaveAs, loadFrame, renderHtml, fileBase, saveAs, writeFile } from "./htmlRender";
import { CopyButton } from "./ui";
import AgentView from "./AgentView";
import BatchPanel from "./BatchPanel";

// Studio Motion: write/paste/receive (from Claude via MCP) an HTML animation, scrub it frame by frame in a sandboxed
// preview that runs on the same virtual clock as the render (lib/htmlMotion.mjs), and render it to H.264 MP4 with
// WebCodecs/Mediabunny. Transparent background = MP4 on black + luma matte (what Shutterstock asks for); browsers have
// no ProRes encoder, so MOV with alpha stays with the Mac renderer.
const FPS = [24, 25, 30, 50, 60];
const DURS = [5, 10, 15, 30];
const SIZES = [["1920x1080", "Full HD · 16:9"], ["1080x1920", "Vertikal · 9:16"], ["1080x1080", "Persegi · 1:1"], ["3840x2160", "4K UHD · stock"]];
const ASPECT_SIZE = { "16:9": "1920x1080", "9:16": "1080x1920", "1:1": "1080x1080" };
const BITRATES = [[16, "16"], [40, "40"], [100, "100"]];
const QUICK_COLORS = [["#00FF00", "Green screen"], ["#000000", "Hitam"], ["#FFFFFF", "Putih"], ["#0F172A", "Navy"]];
const WARN = { smil: "Ada animasi SVG SMIL (<animate>): tidak ikut terekam. Ganti dengan CSS @keyframes atau JavaScript." };
// Image idea: the reference only tells the niche; the AI designs something new so the result is not similar.
const SOURCES = [["agent", "Agent", "Riset → ide → kode otomatis"], ["manual", "Manual", "Satu HTML: tulis, tempel, ide"], ["bulk", "Bulk", "Banyak file HTML atau jawaban AI"]];
const ANTI_SIMILAR = "Lihat gambar ini HANYA untuk mengetahui topik/niche pasarnya, lalu LUPAKAN bentuk visualnya supaya hasilnya 100% berbeda dan tidak mirip.\n1. Rancang konsep visual dan gerakan baru dari nol (objek, komposisi, gaya, koreografi animasi) yang tetap dibutuhkan pembeli di niche itu.\n2. Wujudkan ide itu sebagai satu file HTML mengikuti aturan di bawah.\n\n";

const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1).replace(".", ",")} MB` : `${Math.round(b / 1e3)} KB`);
const fmtNum = (n) => (n ?? 0).toLocaleString("id-ID");
const clock = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return `${String(m).padStart(2, "0")}:${r.toFixed(2).padStart(5, "0").replace(".", ",")}`; };
const mmss = (s) => (Number.isFinite(s) ? `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "--:--");
const even = (v, d) => Math.min(4096, Math.max(256, Math.round((Number(v) || d) / 2) * 2));

// ---------- preview: frame-mode page driven by the parent's clock ----------
const Preview = memo(function Preview({ code, runKey, vw, vh, ow, oh, fps, duration, bg, color, loop, onErrors, onDocSize }) {
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
  const scale = Math.min(box[0] / vw, box[1] / vh) || 0.3;
  const zoom = Math.round(((scale * vw) / ow) * 100);

  return (
    <div className="ms-card ms-preview">
      <div className="ms-cardhead">
        <div><h2 className="ms-h">Pratinjau</h2><p className="ms-sub">Geser timeline untuk cek timing sebelum render</p></div>
        <span className="ms-tag mono">{ow}×{oh}</span><span className="ms-tag mono">{fps} FPS</span>
        <button type="button" className={`mini ${grid ? "on" : ""}`} aria-pressed={grid} onClick={() => setGrid((v) => !v)} title="Garis bantu safe area & rule of thirds">⊞ Grid</button>
        <span className="ms-tag mono" title="Ukuran tampilan dibanding ukuran video">Zoom {zoom}%</span>
      </div>
      <div className="ms-viewport" ref={boxRef} style={{ aspectRatio: `${ow} / ${oh}` }}>
        <div className={`ms-stage ${bg === "alpha" ? "checker" : ""}`} style={{ width: vw * scale, height: vh * scale }}>
          <iframe ref={frameRef} sandbox="allow-scripts" title="Pratinjau animasi HTML"
            style={{ width: vw, height: vh, transform: `scale(${scale})`, visibility: code.trim() ? "visible" : "hidden" }} />
          {grid && <div className="ms-grid" aria-hidden="true"><i /><span /></div>}
        </div>
        {!code.trim() && <div className="cve-empty"><b>Belum ada kode animasi</b><span>Tulis ide atau tempel kode HTML.</span></div>}
        <span className="ms-floating mono">{bg === "alpha" ? "Latar transparan" : bg === "solid" ? `Latar ${color}` : "Latar sesuai kode"}</span>
      </div>
      <div className="ms-transport">
        <div className="ms-scrub">
          <span className="mono ms-now">{clock(n / fps)}</span>
          <input type="range" min={0} max={total - 1} step={1} value={n} aria-label="Timeline frame"
            onChange={(e) => { setPlaying(false); jump(Number(e.target.value) / fps); }} />
          <span className="mono muted">{clock(duration)}</span>
        </div>
        <div className="ms-row">
          <button type="button" className="primary" disabled={!code.trim()} onClick={() => setPlaying((p) => !p)}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
          <button type="button" disabled={!code.trim()} onClick={() => { jump(0); setPlaying(true); }}>↻ Ulang</button>
          <button type="button" className="mini mono" disabled={!code.trim()} onClick={() => step(-1)} title="Mundur 1 frame">−1F</button>
          <button type="button" className="mini mono" disabled={!code.trim()} onClick={() => step(1)} title="Maju 1 frame">+1F</button>
          <span className="ms-frames mono"><span className="muted">Frame</span> <b>{fmtNum(n + 1)}</b> <span className="muted">/ {fmtNum(total)} ·</span> <b className="lime">{Math.round(((n + 1) / total) * 100)}%</b></span>
        </div>
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
          <div className="ms-pipe mono">{info.ow}×{info.oh} · {info.fps} FPS · {info.mbps} Mbps · H.264{info.matte ? " + luma matte" : ""}</div>
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
          <button type="button" className="mini" onClick={async () => { let d; try { d = await window.showDirectoryPicker({ id: "stockscope-render", mode: "readwrite", startIn: "downloads" }); } catch { return; }
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

export default function HtmlStudio({ job, onJobUsed, onSent, active, onKeys }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [inTab, setInTab] = useState("code");
  const [image, setImage] = useState(null);
  const [imgNote, setImgNote] = useState("");
  const [idea, setIdea] = useState("");
  const [gen, setGen] = useState(null);
  const [ai, setAi] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [sizeKey, setSizeKey] = useState("1920x1080");
  const [cw, setCw] = useState(1920), [ch, setCh] = useState(1080);
  const [fps, setFps] = useState(30);
  const [duration, setDuration] = useState(10);
  const [bg, setBg] = useState("code");
  const [color, setColor] = useState("#00FF00");
  const [mbps, setMbps] = useState(40);
  const [loop, setLoop] = useState(true);
  const [auto, setAuto] = useState(true);
  const [runKey, setRunKey] = useState(0);
  const [errors, setErrors] = useState([]);
  const [docSize, setDocSize] = useState(null);
  const [warns, setWarns] = useState([]);
  const [loopRes, setLoopRes] = useState(null); // { ok, seam, step, fast } of the last render
  const [busy, setBusy] = useState(null);
  const [dialog, setDialog] = useState(false);
  const [source, setSource] = useState("manual"); // how videos enter the Studio: agent | manual | bulk
  const [slot, setSlot] = useState(null); // where BatchPanel portals its input card
  const [files, setFiles] = useState([]);
  const [renderErr, setRenderErr] = useState("");
  const [err, setErr] = useState("");
  const [caret, setCaret] = useState([1, 1]);
  const renderRef = useRef(null), abortRef = useRef(null), fileRef = useRef(null), rootRef = useRef(null), taRef = useRef(null), gutterRef = useRef(null);

  const [ow, oh] = sizeKey === "custom" ? [cw, ch] : sizeKey.split("x").map(Number);
  const [vw, vh] = useMemo(() => viewportFor(ow, oh), [ow, oh]);
  const total = Math.max(1, Math.round(fps * duration));
  const lines = useMemo(() => code.split("\n").length, [code]);
  const matte = bg === "alpha";
  const run = () => setRunKey((k) => k + 1);

  const tabFree = useRef(false);
  const htmlModel = useModelChoice("html");
  useEffect(() => {
    const load = () => fetch("/api/motion/generate").then((r) => r.json()).then(setAi).catch(() => setAi({ enabled: false }));
    load();
    window.addEventListener("stockscope:models-changed", load); // a new key/model was saved in Koneksi
    return () => window.removeEventListener("stockscope:models-changed", load);
  }, []);
  useEffect(() => {
    if (!job) return;
    setSource("manual"); setInTab("code"); setCode(job.spec.html); setName(job.name);
    if (ASPECT_SIZE[job.spec.aspect]) setSizeKey(ASPECT_SIZE[job.spec.aspect]);
    if (FPS.includes(job.spec.fps)) setFps(job.spec.fps);
    setDuration(job.spec.duration || 10); setBg("code"); run(); onJobUsed?.();
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [job]); // eslint-disable-line react-hooks/exhaustive-deps
  // Auto run 0.8 s after typing stops.
  useEffect(() => { if (!auto) return; const t = setTimeout(run, 800); return () => clearTimeout(t); }, [code, auto]);

  function loadCode(html, base, opts = {}) {
    setCode(html); setName(base); setInTab("code"); setErr(""); if (!opts.keepTab) setSource("manual");
    if (opts.bg) { if (opts.bg === "alpha") setBg("alpha"); else if (opts.bg.startsWith("#")) { setBg("solid"); setColor(opts.bg.toUpperCase()); } }
    run();
  }
  async function paste() {
    try { const t = await navigator.clipboard.readText(); if (t.trim()) loadCode(t, name); else setErr("Clipboard kosong."); }
    catch { setInTab("code"); setErr("Browser menolak akses clipboard: klik kotak kode lalu tekan Ctrl/Cmd+V."); taRef.current?.focus(); }
  }
  function importFile(file) {
    if (!file) return;
    if (file.size > MAX_HTML) { setErr(`File terlalu besar (maks ${Math.round(MAX_HTML / 1000)} KB).`); return; }
    const fr = new FileReader(); fr.onload = () => loadCode(String(fr.result), file.name.replace(/\.html?$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20));
    fr.onerror = () => setErr("File tidak bisa dibaca."); fr.readAsText(file);
  }
  // One file opens in the editor; several go straight to the queue.
  function importFiles(files) {
    if (files.length < 2) { importFile(files[0]); return; }
    setSource("bulk"); window.dispatchEvent(new CustomEvent("stockscope:batch-files", { detail: { files } }));
  }
  const showQueue = () => document.getElementById("batch")?.scrollIntoView({ behavior: "smooth", block: "start" });
  // The Agent's plan decides the ratio and loop of what it writes, so the render must use the same ones.
  function applyPlan({ aspect: a, duration: d }) { if (ASPECT_SIZE[a]) setSizeKey(ASPECT_SIZE[a]); if (d) setDuration(d); }
  function saveHtml() { const a = document.createElement("a"), url = URL.createObjectURL(new Blob([code], { type: "text/html" })); a.href = url; a.download = `${fileBase(name)}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }

  // Reference image: downscaled in the browser (max 1568 px JPEG) before it is sent. Read as a data: URL (CSP blocks blob: images).
  function takeImage(file) {
    if (!file || !file.type.startsWith("image/")) { setErr("Pilih file gambar (PNG, JPG atau WEBP)."); return; }
    const fr = new FileReader(); fr.onerror = () => setErr("Gambar tidak bisa dibaca.");
    fr.onload = () => { const im = new Image(); im.onerror = () => setErr("Format gambar tidak didukung browser ini.");
      im.onload = () => { const k = Math.min(1, 1568 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); setImage({ url: c.toDataURL("image/jpeg", 0.88), name: file.name || "gambar" }); setErr(""); };
      im.src = fr.result; };
    fr.readAsDataURL(file);
  }
  const aspect = ow === oh ? "1:1" : ow > oh ? "16:9" : "9:16";
  const background = bg === "alpha" ? "alpha" : bg === "solid" ? color : "code";
  const promptFor = () => inTab === "image"
    ? ANTI_SIMILAR + htmlPrompt({ idea: imgNote || "animasi baru untuk niche dari gambar referensi", aspect, duration, background })
    : htmlPrompt({ idea, aspect, duration, background });

  // "Kirim ke Claude": the idea/image becomes a request that Claude answers from chat through MCP.
  async function sendToClaude() {
    if (inTab === "image" && !image) { setErr("Unggah atau tempel gambar dulu."); return; }
    if (inTab === "text" && !idea.trim()) { setErr("Tulis idenya dulu."); return; }
    setErr(""); setSending(true);
    try {
      const body = inTab === "image" ? { idea: imgNote, image: image.url, aspect, duration } : { idea, aspect, duration };
      const r = await fetch("/api/motion/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Gagal mengirim (${r.status}). Coba lagi.`);
      setSent(j.request); onSent?.(j.request);
    } catch (x) { setErr(x.message); } finally { setSending(false); }
  }

  // "Buat dengan API" (only with ANTHROPIC_API_KEY): streams the HTML into the editor.
  async function generate() {
    if (inTab === "image" && !image) { setErr("Unggah atau tempel gambar dulu."); return; }
    if (inTab === "text" && !idea.trim()) { setErr("Tulis idenya dulu."); return; }
    const body = { ...(inTab === "image" ? { idea: imgNote, image: image?.url, aspect, duration } : { idea, aspect, duration }), background, model: htmlModel.model || undefined };
    setErr(""); const ac = new AbortController(); setGen({ ac, n: 0 });
    try {
      const r = await fetch("/api/motion/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ac.signal });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Gagal membuat HTML (${r.status}).`); }
      setInTab("code"); setCode(""); const rd = r.body.getReader(), dec = new TextDecoder(); let out = "";
      for (;;) { const { value, done } = await rd.read(); if (done) break; out += dec.decode(value, { stream: true }); setCode(out); setGen({ ac, n: out.length }); }
      const e = out.match(/<!-- CVE_ERROR (.*?) -->/); if (e) throw new Error(`API Claude berhenti: ${e[1]}`);
      const a = out.search(/<!DOCTYPE html|<html/i), b = out.toLowerCase().lastIndexOf("</html>");
      const html = a >= 0 ? out.slice(a, b > a ? b + 7 : undefined) : out.replace(/^```html?\s*|```\s*$/g, "");
      setCode(html); if (!name) setName((inTab === "image" ? imgNote : idea).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20).replace(/-+$/, "") || "ai-video"); run();
    } catch (x) { if (x.name !== "AbortError") setErr(x.message); } finally { setGen(null); }
  }

  async function render() {
    if (!code.trim()) { setErr("Belum ada kode HTML. Tempel kode atau tulis ide dulu."); setInTab("code"); return; }
    if (code.length > MAX_HTML) { setErr(`HTML terlalu besar (maks ${Math.round(MAX_HTML / 1000)} KB).`); return; }
    setErr(""); setWarns([]); setRenderErr(""); setLoopRes(null);
    setFiles((fs) => { fs.forEach((f) => URL.revokeObjectURL(f.url)); return []; });
    const ac = new AbortController(); abortRef.current = ac; setBusy({ p: 0, n: 0, elapsed: 0 }); setDialog(true);
    try {
      const pageBg = bg === "alpha" ? "alpha" : bg === "solid" ? color : "code";
      const out = await renderHtml({ html: code, frame: renderRef.current, size: { vw, vh, ow, oh }, bg: pageBg, fps, duration, mbps, signal: ac.signal, onProgress: setBusy, onWarn: setWarns });
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
  const format = `MP4 H.264${matte ? " + matte" : ""}`;

  return (
    <div className="ms" ref={rootRef}>
      {/* 1. Hero */}
      <section className="ms-hero">
        <div className="ms-hero-main">
          <div className="ms-kicker"><b>Studio Motion · HTML/CSS/JS ke video</b><span className="muted mono">render frame demi frame di browser</span></div>
          <h1 className="page-title">Studio <em>Motion</em></h1>
          <p className="tagline">Kode animasi HTML + CSS + JavaScript jadi stock footage: motion graphics, partikel, gradien bergerak, sampai overlay transparan, dirender tepat frame demi frame jadi <b>MP4 H.264</b> plus <b>luma matte</b> untuk latar transparan. Claude juga bisa mengirim kodenya lewat MCP.</p>
        </div>
        <div className="ms-hero-side">
          <div className="ms-flow mono"><b>Tulis kode</b> → Pratinjau → Render → <b>Unduh</b></div>
          <div className="btns">
            <input ref={fileRef} type="file" accept=".html,.htm,text/html" multiple hidden onChange={(e) => { importFiles([...e.target.files]); e.target.value = ""; }} />
            <button type="button" onClick={() => fileRef.current?.click()}>Import .html</button>
            <button type="button" onClick={paste}>Tempel kode</button>
            <button type="button" onClick={showQueue}>Antrean ↓</button>
            <button type="button" className="primary" disabled={busy !== null} onClick={render}>Render video →</button>
          </div>
        </div>
      </section>

      {/* 2. Three ways in; all of them end in the same preview, settings and queue */}
      <div className="ms-opts three ms-sources" role="tablist" aria-label="Cara membuat video">
        {SOURCES.map(([k, l, d]) => <button key={k} type="button" role="tab" aria-selected={source === k} className={source === k ? "on" : ""} onClick={() => setSource(k)}><b>{l}</b><span>{d}</span></button>)}
      </div>

      {/* 3. Workspace */}
      <section className="ms-work">
        <div className="ms-agent" hidden={source !== "agent"}>
          <AgentView active={active && source === "agent"} onKeys={onKeys} studio={{ aspect, duration, background }} onApply={applyPlan} onQueue={showQueue} />
        </div>
        <div className="ms-slot" ref={setSlot} hidden={source !== "bulk"} />
        <div className={`ms-card ms-editor ${inTab === "code" ? "fit" : ""}`} hidden={source !== "manual"}>
          <div className="ms-cardhead">
            <div className="seg" role="tablist" aria-label="Sumber video">
              {[["code", "Kode HTML"], ["text", "Ide teks"], ["image", "Ide gambar"]].map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={inTab === k} className={inTab === k ? "on" : ""} onClick={() => setInTab(k)}>{l}</button>)}
            </div>
            {inTab === "code" && <>
              <label className="mcheck"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto</label>
              <button type="button" className="mini primary" disabled={!code.trim()} onClick={run} title="Ctrl/Cmd + Enter">↻ Jalankan</button>
            </>}
          </div>

          {inTab === "code" && <>
            <div className="ms-toolbar">
              <CopyButton label="Salin prompt AI" text={promptFor()} />
              <button type="button" className="mini" onClick={() => loadCode(SAMPLE_HTML, "retro-sunset-grid", { bg: "code" })}>Contoh</button>
              {code && <button type="button" className="mini" onClick={saveHtml}>Simpan .html</button>}
              {code && <button type="button" className="mini" onClick={() => { setCode(""); setName(""); setErrors([]); }}>Kosongkan</button>}
            </div>
            <div className="cve-code ms-code">
              <pre ref={gutterRef} aria-hidden="true">{Array.from({ length: lines }, (_, i) => i + 1).join("\n")}</pre>
              <textarea ref={taRef} spellCheck={false} value={code} aria-label="Kode HTML animasi" placeholder="Tulis atau tempel kode HTML lengkap (mulai dari <!DOCTYPE html>), dengan <style> dan <script> di dalamnya…"
                onChange={(e) => setCode(e.target.value)} onSelect={onCaret} onKeyUp={onCaret} onClick={onCaret}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); }
                  if (e.key === "Escape") tabFree.current = true; // Esc, then Tab leaves the editor (keyboard users)
                  else if (e.key === "Tab" && !e.shiftKey && tabFree.current) tabFree.current = false;
                  else if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); const t = e.target, s = t.selectionStart; setCode(code.slice(0, s) + "  " + code.slice(t.selectionEnd)); requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2; }); }
                }}
                onScroll={(e) => { if (gutterRef.current) gutterRef.current.scrollTop = e.target.scrollTop; }} />
            </div>
            <div className="ms-status mono">
              <span><i className={errors.length ? "dot err" : "dot"} />{gen ? `AI sedang menulis… ${fmtSize(gen.n)}` : errors.length ? "Ada error di HTML" : code.trim() ? (follows ? "Mengikuti pengaturan Studio" : "Pratinjau terkunci ke frame") : "Siap"}</span>
              <span>Ln {caret[0]}, Col {caret[1]} · {fmtSize(new Blob([code]).size)}</span>
            </div>
          </>}

          {inTab === "text" && <div className="cve-idea-box">
            <label className="mparam"><span>Ide video</span>
              <textarea rows={8} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Contoh: partikel emas berkilau melayang pelan di latar hitam, loop 10 detik, cocok untuk overlay perayaan" /></label>
            {ideaActions()}
          </div>}

          {inTab === "image" && <div className="cve-idea-box">
            <label className={`cve-drop ${image ? "has" : ""}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); takeImage(e.dataTransfer.files[0]); }}
              onPaste={(e) => { const f = [...e.clipboardData.files][0]; if (f) takeImage(f); }} tabIndex={0}>
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => takeImage(e.target.files[0])} />
              {image ? <><img src={image.url} alt="Gambar referensi" /><span className="muted">{image.name} · klik untuk ganti</span></>
                : <><b>Unggah gambar referensi</b><span className="muted">Klik, seret file ke sini, atau tempel (Ctrl/Cmd+V). Gambar hanya dipakai untuk mengenali niche-nya; hasilnya dirancang baru supaya tidak mirip.</span></>}
            </label>
            <label className="mparam"><span>Catatan (opsional)</span>
              <textarea rows={3} value={imgNote} onChange={(e) => setImgNote(e.target.value)} placeholder="Contoh: warna biru neon, partikel lebih banyak" /></label>
            {ideaActions()}
          </div>}
          {err && <div className="notice err">{err}</div>}
        </div>

        <div className="ms-mid" hidden={source === "agent"}>
          <Preview code={code} runKey={runKey} vw={vw} vh={vh} ow={ow} oh={oh} fps={fps} duration={duration} bg={bg} color={color} loop={loop}
            onErrors={setErrors} onDocSize={setDocSize} />
          {errors.map((m, i) => <div key={i} className="notice err">Error di HTML: {m}</div>)}
          {code.trim() && (follows
            ? <div className="notice okbox ms-follow">✓ Kode ini mengikuti pengaturan Studio: ukuran, durasi loop dan latar berubah sesuai Pengaturan video di bawah.</div>
            : <div className="notice ms-follow">Kode ini tidak membaca pengaturan Studio, jadi ukuran, durasi loop dan latar mengikuti angka di dalam kodenya. FPS, resolusi 16:9/4K dan bitrate tetap berlaku.
                Untuk HTML baru, pakai <b>Salin prompt AI</b> atau Kirim ke Claude: aturannya sudah meminta kode memakai <code>window.STUDIO</code>.</div>)}
          {sizeMismatch && <div className="notice">Ukuran HTML {docSize[0]}×{docSize[1]} lebih besar dari kanvas {vw}×{vh}, jadi sebagian akan terpotong. Pakai width/height 100% atau {vw}×{vh} px.</div>}
        </div>

        <div className="ms-card ms-settings">
          <div className="ms-cardhead">
            <div><h2 className="ms-h">Pengaturan video</h2><p className="ms-sub">Untuk kebutuhan microstock</p></div>
            <label className="mcheck"><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Loop</label>
          </div>
          <div className="ms-settings-body">
            <div className="ms-group">
              <div className="ms-label">Durasi & FPS <span className="ms-tag mono lime">{fmtNum(total)} frame</span></div>
              <div className="ms-two">
                <label className="ms-box"><span>Durasi (detik)</span><input type="number" min={1} max={60} value={duration} onChange={(e) => setDuration(Math.min(60, Math.max(1, Math.round(Number(e.target.value)) || 10)))} /></label>
                <div className="ms-box"><span>Cepat</span><div className="ms-pills">{DURS.map((d) => <button key={d} type="button" className={duration === d ? "on" : ""} onClick={() => setDuration(d)}>{d}s</button>)}</div></div>
              </div>
              <div className="ms-pills wide" role="group" aria-label="FPS">{FPS.map((f) => <button key={f} type="button" className={fps === f ? "on" : ""} aria-pressed={fps === f} onClick={() => setFps(f)}>{f}</button>)}</div>
            </div>

            <div className="ms-group">
              <div className="ms-label">Resolusi</div>
              <div className="ms-opts">
                {SIZES.map(([k, l]) => <button key={k} type="button" className={sizeKey === k ? "on" : ""} aria-pressed={sizeKey === k} onClick={() => setSizeKey(k)}><b className="mono">{k.replace("x", "×")}</b><span>{l}</span></button>)}
              </div>
              <div className={`ms-custom ${sizeKey === "custom" ? "on" : ""}`}>
                <button type="button" className="linkish" onClick={() => setSizeKey("custom")}>Custom:</button>
                <input type="number" aria-label="Lebar" value={cw} min={256} max={4096} onFocus={() => setSizeKey("custom")} onChange={(e) => setCw(Number(e.target.value))} onBlur={() => setCw(even(cw, 1920))} />
                <span className="muted">×</span>
                <input type="number" aria-label="Tinggi" value={ch} min={256} max={4096} onFocus={() => setSizeKey("custom")} onChange={(e) => setCh(Number(e.target.value))} onBlur={() => setCh(even(ch, 1080))} />
              </div>
            </div>

            <div className="ms-group">
              <div className="ms-label">Latar</div>
              <div className="ms-opts three">
                <button type="button" className={bg === "code" ? "on" : ""} onClick={() => setBg("code")}><b>Sesuai kode</b><span>Latar dari HTML</span></button>
                <button type="button" className={bg === "alpha" ? "on" : ""} onClick={() => setBg("alpha")}><b>Transparan</b><span>+ luma matte</span></button>
                <button type="button" className={bg === "solid" ? "on" : ""} onClick={() => setBg("solid")}><b>Warna solid</b><span>Green screen</span></button>
              </div>
              {bg === "solid" && <div className="ms-colors">
                <input type="color" aria-label="Warna latar" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} />
                <input className="mono" aria-label="Kode warna" value={color} maxLength={7} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && setColor(e.target.value.toUpperCase())} />
                {QUICK_COLORS.map(([c, l]) => <button key={c} type="button" className="mini" title={l} onClick={() => setColor(c)}><i style={{ background: c }} />{l}</button>)}
              </div>}
            </div>

            <div className="ms-group">
              <div className="ms-label">Bitrate (Mbps)</div>
              <div className="ms-pills wide">{BITRATES.map(([v, l]) => <button key={v} type="button" className={mbps === v ? "on" : ""} onClick={() => setMbps(v)}>{l}</button>)}</div>
            </div>

            <label className="ms-group ms-label-input"><span className="ms-label">Nama file</span>
              <input value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 20))} maxLength={20} placeholder="mis. gold-particles" />
              <span className="hint" style={{ margin: 0 }}>Maks 20 huruf, supaya “-matte.mp4” tetap ≤30 karakter.</span>
            </label>
          </div>
          <div className="ms-cta">
            <button type="button" className="primary" disabled={busy !== null} onClick={render}>{busy !== null ? `Merender… ${Math.round((busy.p || 0) * 100)}%` : "Render frame demi frame →"}</button>
            <div className="ms-cta-sum mono"><span>{ow}×{oh} · {fps} FPS · {fmtNum(total)}F</span><b className="lime">{format}</b></div>
            {files.length > 0 && busy === null && <button type="button" className="linkish" onClick={() => setDialog(true)}>Lihat hasil render terakhir</button>}
          </div>
        </div>
      </section>

      {/* 4. The queue every source fills, rendered one after another with the settings above */}
      <BatchPanel settings={{ ow, oh, vw, vh, fps, duration, bg, color, mbps, aspect }} slot={slot}
        onPreview={(x) => { setSource((s) => (s === "agent" ? "bulk" : s)); loadCode(x.html, x.name, { keepTab: true }); rootRef.current?.querySelector(".ms-mid")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />

      <iframe ref={renderRef} sandbox="allow-scripts" title="Perekam" aria-hidden="true" tabIndex={-1} className="cve-offscreen" style={{ width: vw, height: vh }} />
      {dialog && <RenderDialog busy={busy} files={files} error={renderErr} warns={warns} loopRes={loopRes} info={{ ow, oh, fps, total, mbps, matte, format, duration }}
        onCancel={() => abortRef.current?.abort()} onClose={() => setDialog(false)} />}
    </div>
  );

  function ideaActions() {
    return (
      <>
        <div className="btns" style={{ marginTop: 4 }}>
          <button type="button" className="primary" disabled={sending} onClick={sendToClaude}>{sending ? "Mengirim…" : "Kirim ke Claude"}</button>
          {ai?.enabled && <button type="button" disabled={!!gen} onClick={generate}>{gen ? "AI sedang menulis…" : "Buat dengan API"}</button>}
          {gen && <button type="button" onClick={() => gen.ac.abort()}>Berhenti</button>}
          <CopyButton label="Salin prompt" text={promptFor()} />
        </div>
        {ai?.enabled && <ModelPicker task="html" choice={htmlModel} label="Model AI untuk HTML" />}
        {sent ? <div className="notice ok cve-sent">Terkirim ({sent.has_image ? "dengan gambar" : "teks"}, {sent.aspect}, {sent.duration} dtk). Sekarang bilang ke Claude di chat:
            <b> “buatkan video dari permintaan”</b> <CopyButton label="Salin kalimat" text="buatkan video dari permintaan di Studio Motion" />
            <br />Kode HTML-nya otomatis terbuka di editor, lalu tinggal Render.</div>
          : <p className="hint">Pakai langganan Claude kamu: ide{inTab === "image" ? " dan gambar" : ""} dikirim ke Claude lewat MCP, Claude menulis kode HTML-nya, lalu kode itu otomatis terbuka di editor. Rasio {aspect} dan durasi {duration} dtk ikut terkirim.</p>}
      </>
    );
  }
}
