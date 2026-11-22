"use client";
import { ASPECTS, OUT_RES, injectRuntime } from "@/lib/htmlMotion.mjs";
import { parseFrameMov, movLayout } from "@/lib/prores.mjs";

// Shared by the Editor HTML (one video) and the bulk render of Claude's orders (MotionStudio).
export const outSize = (aspect, res) => { const [w, h] = ASPECTS[aspect] || ASPECTS["16:9"], s = OUT_RES[res] / Math.min(w, h); return [Math.round(w * s / 2) * 2, Math.round(h * s / 2) * 2]; };
export const fileBase = (name) => (name || "video").toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 26) || "video";

// One sandboxed frame host; resolves when the injected document has loaded.
// opts { duration, fps }: the Studio settings the page reads as window.STUDIO.
export function loadFrame(iframe, html, mode, w, h, bg = "code", opts = {}) {
  let cancel = () => {};
  const promise = new Promise((resolve, reject) => {
    const doc = injectRuntime(html, mode, w, h, bg, opts); let done = false;
    const onMsg = (e) => { if (e.source !== iframe.contentWindow) return;
      if (e.data?.cveReady) iframe.contentWindow.postMessage({ cveHtml: doc }, "*");
      if (e.data?.cveLoaded && !done) { done = true; window.removeEventListener("message", onMsg); resolve(e.data); } };
    window.addEventListener("message", onMsg);
    iframe.src = `/motion-preview/html?r=${Date.now()}`;
    const timer = setTimeout(() => { if (!done) { done = true; window.removeEventListener("message", onMsg); reject(new Error("Halaman HTML tidak selesai dimuat (10 detik).")); } }, 10000);
    // A newer Run supersedes this load: drop its listener so the old code cannot answer the new frame.
    cancel = () => { done = true; clearTimeout(timer); window.removeEventListener("message", onMsg); };
  });
  promise.cancel = () => cancel();
  promise.catch(() => {}); // a cancelled load never settles; avoid unhandled rejections on timeouts nobody awaits
  return promise;
}

// ProRes 4444 encoder: a Web Worker running ffmpeg.wasm (public/ffmpeg), one frame at a time. Frames are put into one
// QuickTime .mov by lib/prores.mjs. Straight (non-premultiplied) RGBA in, so transparency is real alpha.
export function proresEncoder({ width, height, fps }) {
  const worker = new Worker("/ffmpeg/prores-worker.js"); let seq = 0, stsd = null; const sizes = [], parts = [];
  const waiting = new Map();
  worker.onmessage = (e) => { const w = waiting.get(e.data.id); if (!w) return; waiting.delete(e.data.id); e.data.ok ? w.resolve(e.data) : w.reject(new Error(e.data.error)); };
  worker.onerror = (e) => { for (const w of waiting.values()) w.reject(new Error(e.message || "Worker ProRes gagal dimuat.")); waiting.clear(); };
  const call = (msg, transfer = []) => new Promise((resolve, reject) => { const id = ++seq; waiting.set(id, { resolve, reject }); worker.postMessage({ id, ...msg }, transfer); });
  return {
    load: () => call({ type: "load" }),
    // rgba: ArrayBuffer of width*height*4 bytes (transferred). Resolves when that frame is encoded and stored.
    async add(rgba) {
      const r = await call({ type: "frame", rgba, w: width, h: height }, [rgba]);
      const { frame, stsd: sd } = parseFrameMov(new Uint8Array(r.mov));
      stsd ||= sd; sizes.push(frame.length); parts.push(new Blob([frame])); // Blob parts are kept by the browser, not in JS memory
    },
    finish() {
      worker.terminate();
      const { head, tail } = movLayout({ sizes, stsd, width, height, fps });
      return new Blob([head, ...parts, tail], { type: "video/quicktime" });
    },
    cancel() { worker.terminate(); },
  };
}

// Renders `html` frame by frame in `frame` (an offscreen sandboxed iframe sized to the page viewport) and encodes it
// with Mediabunny: H.264 MP4, or VP9 WebM when the browser has no H.264 encoder. Returns { ext, video, matte, poster,
// loop: { ok, seam, step } (does the last frame flow into frame 0?), fast: every frame came through the canvas fast path }.
// size: { vw, vh, ow, oh } (page viewport and output); without it aspect + res decide. bg: "code" (page background),
// "alpha" (transparent page: video on black + a luma matte track, white = visible) or "#rrggbb" (solid colour).
export async function renderHtml({ html, frame, aspect = "16:9", res = "1080p", size, bg = "code", fps = 30, duration = 10, mbps = 40, signal, onProgress, onWarn, fast: useFast = true, onSteps, format = "mp4" }) {
  const [vw, vh] = size ? [size.vw, size.vh] : ASPECTS[aspect] || ASPECTS["16:9"], [ow, oh] = size ? [size.ow, size.oh] : outSize(aspect, res);
  const alpha = bg === "alpha", mov = format === "mov"; // mov = ProRes 4444 (real alpha); mp4 = H.264 (+ luma matte for alpha)
  frame.style.width = `${vw}px`; frame.style.height = `${vh}px`;
  const { Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, canEncodeVideo } = mov ? {} : await import("mediabunny");
  const codec = mov ? null : (await canEncodeVideo("avc", { width: ow, height: oh })) ? "avc" : (await canEncodeVideo("vp9", { width: ow, height: oh })) ? "vp9" : null;
  if (!mov && !codec) throw new Error(`Browser ini tidak bisa meng-encode video ${ow}×${oh}. Pakai Google Chrome terbaru.`);
  const ext = mov ? "mov" : codec === "avc" ? "mp4" : "webm";
  const outputs = [];
  const enc = mov ? proresEncoder({ width: ow, height: oh, fps }) : null;
  const track = async () => {
    const c = document.createElement("canvas"); c.width = ow; c.height = oh;
    if (mov) { const t = { canvas: c, ctx: c.getContext("2d", { willReadFrequently: true }) }; outputs.push(t); return t; }
    const output = new Output({ format: codec === "avc" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(), target: new BufferTarget() });
    const src = new CanvasSource(c, { codec, bitrate: mbps * 1e6, keyFrameInterval: 1 }); output.addVideoTrack(src, { frameRate: fps }); await output.start();
    const t = { canvas: c, ctx: c.getContext("2d"), output, src }; outputs.push(t); return t;
  };
  try {
    await loadFrame(frame, html, "frame", vw, vh, bg, { duration, fps });
    if (enc) { try { await enc.load(); } catch (e) { throw new Error(`Encoder ProRes tidak bisa dimuat (${e.message}). Pakai Google Chrome terbaru.`); } }
    const main = await track(), matteT = alpha && !mov ? await track() : null;
    const canvas = main.canvas, ctx = main.ctx, src = main.src;
    // Transparent page: the frame is drawn on a clear layer; the video gets it over black, the matte its white silhouette.
    const layer = alpha ? Object.assign(document.createElement("canvas"), { width: ow, height: oh }) : null, lctx = layer?.getContext("2d", { willReadFrequently: true });
    const sil = alpha && !mov ? Object.assign(document.createElement("canvas"), { width: ow, height: oh }) : null, sctx = sil?.getContext("2d");
    const total = Math.round(fps * duration); let poster = null;
    const capture = (n) => new Promise((resolve, reject) => {
      // A page that never answers (infinite loop) must not hang the render: give up after 30 s or on cancel.
      const done = () => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); window.removeEventListener("message", onMsg); };
      const onMsg = (e) => { if (e.source !== frame.contentWindow || e.data?.cveFrame !== n) return; done(); e.data.error ? reject(new Error(e.data.error)) : resolve(e.data); };
      const onAbort = () => { done(); reject(new Error("Render dibatalkan.")); };
      const timer = setTimeout(() => { done(); reject(new Error("Halaman tidak merespons (30 dtk). Cek skrip di HTML: mungkin ada loop tanpa akhir.")); }, 30000);
      signal?.addEventListener("abort", onAbort);
      window.addEventListener("message", onMsg); frame.contentWindow.postMessage({ cveCapture: true, n, t: (n * 1000) / fps, w: ow, h: oh, fast: useFast }, "*"); });
    // A frame arrives as pixels (canvas-only page: ImageBitmap, fast) or as an SVG snapshot URL (any other page).
    const paint = async (d, g) => {
      if (d.bmp) { if (d.bg) { g.fillStyle = d.bg; g.fillRect(0, 0, ow, oh); } g.drawImage(d.bmp, 0, 0, ow, oh); d.bmp.close?.(); return; }
      const im = new Image(); im.src = d.url; await im.decode(); g.drawImage(im, 0, 0, ow, oh);
    };
    // Loop check: when the video repeats, the step from the last frame back to frame 0 must look like any other step.
    // Compared on small thumbnails against every other frame-to-frame change of the video, so fast motion is not a "jump".
    const TW = 192, TH = Math.max(2, Math.round((192 * oh) / ow));
    const tc = Object.assign(document.createElement("canvas"), { width: TW, height: TH }), tg = tc.getContext("2d", { willReadFrequently: true });
    const thumb = (src) => { tg.fillStyle = "#000"; tg.fillRect(0, 0, TW, TH); tg.drawImage(src, 0, 0, TW, TH); return tg.getImageData(0, 0, TW, TH).data; };
    const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s / (a.length / 4) / 3; };
    let th0 = null, prev = null, fast = 0, pending = null; const steps = [];
    const t0 = performance.now();
    for (let n = 0; n < total; n++) {
      if (signal?.aborted) throw new Error("Render dibatalkan.");
      const d = await capture(n); if (d.warn?.length) onWarn?.(d.warn); if (d.bmp) fast++;
      if (alpha) {
        lctx.clearRect(0, 0, ow, oh); await paint(d, lctx);
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, ow, oh); ctx.drawImage(layer, 0, 0);
        if (matteT) {
          sctx.globalCompositeOperation = "copy"; sctx.drawImage(layer, 0, 0);
          sctx.globalCompositeOperation = "source-in"; sctx.fillStyle = "#fff"; sctx.fillRect(0, 0, ow, oh);
          matteT.ctx.fillStyle = "#000"; matteT.ctx.fillRect(0, 0, ow, oh); matteT.ctx.drawImage(sil, 0, 0);
          await matteT.src.add(n / fps, 1 / fps);
        }
      } else { ctx.clearRect(0, 0, ow, oh); await paint(d, ctx); }
      { const th = thumb(canvas); if (n === 0) th0 = th; else steps.push(diff(prev, th)); prev = th; }
      if (n === Math.floor(total / 2)) poster = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));
      if (enc) {
        // Straight RGBA of this frame (the transparent layer when the page is transparent) goes to the ProRes worker; one frame
        // is encoded while the next is captured.
        const px = (alpha ? lctx : ctx).getImageData(0, 0, ow, oh).data.buffer;
        if (pending) await pending;
        pending = enc.add(px); pending.catch(() => {});
      } else await src.add(n / fps, 1 / fps);
      if (n % 3 === 0 || n === total - 1) { const p = (n + 1) / total, el = (performance.now() - t0) / 1000; onProgress?.({ p, n: n + 1, total, elapsed: el, left: Math.round(el / p - el) }); }
    }
    let loop = null;
    if (th0 && steps.length > 1) {
      // The seam is fine when it is no bigger than the changes the video already contains: stepped ("on twos") motion,
      // glitches, flashes and cuts inside the loop all show up as large steps, so compare with the largest ones.
      const sorted = [...steps].sort((a, b) => a - b), big = sorted[sorted.length - 1], mid = sorted[Math.floor(sorted.length / 2)];
      const seam = diff(prev, th0), r1 = (v) => Math.round(v * 10) / 10;
      loop = { ok: seam <= Math.max(1.5, big * 1.25), seam: r1(seam), step: r1(big), median: r1(mid) };
    }
    if (enc) { await pending; const video = enc.finish(); return { ext, video, matte: null, poster, loop, fast: fast === total }; }
    for (const t of outputs) await t.output.finalize();
    const blob = (t) => new Blob([t.output.target.buffer], { type: `video/${ext}` });
    return { ext, video: blob(main), matte: matteT ? blob(matteT) : null, poster, loop, fast: fast === total };
  } catch (e) { enc?.cancel(); for (const t of outputs) { try { await t.output?.cancel(); } catch {} } throw e; }
  finally { frame.src = "about:blank"; }
}

// Starts a browser download of a blob (Chrome asks once to allow several downloads from this site).
// Save into a folder the owner picked once (Chrome): no download prompt per file, nothing held in memory afterwards.
export const canPickFolder = () => typeof window !== "undefined" && "showDirectoryPicker" in window;
export async function writeFile(dir, blob, name) {
  const handle = await dir.getFileHandle(name, { create: true }), w = await handle.createWritable();
  await w.write(blob); await w.close();
}

// "Save as": the owner picks the place (and may rename) for one file. Chrome/Edge show the system dialog; other
// browsers download as usual. Returns "saved" | "cancel" | "download".
export const canSaveAs = () => typeof window !== "undefined" && "showSaveFilePicker" in window;
export async function saveAs(blob, name) {
  if (!canSaveAs()) { saveBlob(blob, name); return "download"; }
  const ext = (name.match(/\.[a-z0-9]+$/i) || [".mp4"])[0].toLowerCase(), type = blob.type || (ext === ".jpg" ? "image/jpeg" : ext === ".webm" ? "video/webm" : "video/mp4");
  try {
    const h = await window.showSaveFilePicker({ id: "studio-motion-render", suggestedName: name, startIn: "downloads", types: [{ description: ext === ".jpg" ? "Gambar" : "Video", accept: { [type.split(";")[0]]: [ext] } }] });
    const w = await h.createWritable(); await w.write(blob); await w.close(); return "saved";
  } catch (e) { if (e?.name === "AbortError") return "cancel"; saveBlob(blob, name); return "download"; }
}

export function saveBlob(blob, name) {
  const a = document.createElement("a"), url = URL.createObjectURL(blob); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
