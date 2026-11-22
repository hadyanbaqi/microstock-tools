"use client";
import { ASPECTS, OUT_RES, injectRuntime } from "@/lib/htmlMotion.mjs";

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

// Renders `html` frame by frame in `frame` (an offscreen sandboxed iframe sized to the page viewport) and encodes it
// with Mediabunny: H.264 MP4, or VP9 WebM when the browser has no H.264 encoder. Returns { ext, video, matte, poster,
// loop: { ok, seam, step } (does the last frame flow into frame 0?), fast: every frame came through the canvas fast path }.
// size: { vw, vh, ow, oh } (page viewport and output); without it aspect + res decide. bg: "code" (page background),
// "alpha" (transparent page: video on black + a luma matte track, white = visible) or "#rrggbb" (solid colour).
export async function renderHtml({ html, frame, aspect = "16:9", res = "1080p", size, bg = "code", fps = 30, duration = 10, mbps = 40, signal, onProgress, onWarn, fast: useFast = true, onSteps }) {
  const [vw, vh] = size ? [size.vw, size.vh] : ASPECTS[aspect] || ASPECTS["16:9"], [ow, oh] = size ? [size.ow, size.oh] : outSize(aspect, res);
  const alpha = bg === "alpha";
  frame.style.width = `${vw}px`; frame.style.height = `${vh}px`;
  const { Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, canEncodeVideo } = await import("mediabunny");
  const codec = (await canEncodeVideo("avc", { width: ow, height: oh })) ? "avc" : (await canEncodeVideo("vp9", { width: ow, height: oh })) ? "vp9" : null;
  if (!codec) throw new Error(`Browser ini tidak bisa meng-encode video ${ow}×${oh}. Pakai Google Chrome terbaru.`);
  const ext = codec === "avc" ? "mp4" : "webm";
  const outputs = [];
  const track = async () => {
    const c = document.createElement("canvas"); c.width = ow; c.height = oh;
    const output = new Output({ format: codec === "avc" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(), target: new BufferTarget() });
    const src = new CanvasSource(c, { codec, bitrate: mbps * 1e6, keyFrameInterval: 1 }); output.addVideoTrack(src, { frameRate: fps }); await output.start();
    const t = { canvas: c, ctx: c.getContext("2d"), output, src }; outputs.push(t); return t;
  };
  try {
    await loadFrame(frame, html, "frame", vw, vh, bg, { duration, fps });
    const main = await track(), matteT = alpha ? await track() : null;
    const canvas = main.canvas, ctx = main.ctx, src = main.src;
    // Transparent page: the frame is drawn on a clear layer; the video gets it over black, the matte its white silhouette.
    const layer = alpha ? Object.assign(document.createElement("canvas"), { width: ow, height: oh }) : null, lctx = layer?.getContext("2d");
    const sil = alpha ? Object.assign(document.createElement("canvas"), { width: ow, height: oh }) : null, sctx = sil?.getContext("2d");
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
    let th0 = null, prev = null, fast = 0; const steps = [];
    const t0 = performance.now();
    for (let n = 0; n < total; n++) {
      if (signal?.aborted) throw new Error("Render dibatalkan.");
      const d = await capture(n); if (d.warn?.length) onWarn?.(d.warn); if (d.bmp) fast++;
      if (alpha) {
        lctx.clearRect(0, 0, ow, oh); await paint(d, lctx);
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, ow, oh); ctx.drawImage(layer, 0, 0);
        sctx.globalCompositeOperation = "copy"; sctx.drawImage(layer, 0, 0);
        sctx.globalCompositeOperation = "source-in"; sctx.fillStyle = "#fff"; sctx.fillRect(0, 0, ow, oh);
        matteT.ctx.fillStyle = "#000"; matteT.ctx.fillRect(0, 0, ow, oh); matteT.ctx.drawImage(sil, 0, 0);
        await matteT.src.add(n / fps, 1 / fps);
      } else { ctx.clearRect(0, 0, ow, oh); await paint(d, ctx); }
      { const th = thumb(canvas); if (n === 0) th0 = th; else steps.push(diff(prev, th)); prev = th; }
      if (n === Math.floor(total / 2)) poster = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));
      await src.add(n / fps, 1 / fps);
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
    for (const t of outputs) await t.output.finalize();
    const blob = (t) => new Blob([t.output.target.buffer], { type: `video/${ext}` });
    return { ext, video: blob(main), matte: matteT ? blob(matteT) : null, poster, loop, fast: fast === total };
  } catch (e) { for (const t of outputs) { try { await t.output.cancel(); } catch {} } throw e; }
  finally { frame.src = "about:blank"; }
}

// Custom scenes and templates (lib/motion.mjs) made through MCP: the code runs only in the sandboxed /motion-preview page,
// which returns each frame (and its luma matte) as ImageBitmaps; here they are encoded like the HTML videos.
const SCENE_RES = { "4k": [3840, 2160], hd: [1920, 1080], vertical: [1080, 1920], square: [1080, 1080] };
export async function renderScene({ spec, frame, res = "4k", mbps = 40, matte = true, signal, onProgress }) {
  const [w0, h0] = SCENE_RES[spec.resolution] || SCENE_RES["4k"], s = OUT_RES[res] / Math.min(w0, h0);
  const ow = Math.round(w0 * s / 2) * 2, oh = Math.round(h0 * s / 2) * 2, fps = spec.fps || 30, total = Math.round(fps * (spec.duration || 10));
  const { Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, canEncodeVideo } = await import("mediabunny");
  const codec = (await canEncodeVideo("avc", { width: ow, height: oh })) ? "avc" : (await canEncodeVideo("vp9", { width: ow, height: oh })) ? "vp9" : null;
  if (!codec) throw new Error(`Browser ini tidak bisa meng-encode video ${ow}×${oh}. Pakai Google Chrome terbaru.`);
  const ext = codec === "avc" ? "mp4" : "webm", tracks = [];
  const wait = (test, ms, what) => new Promise((resolve, reject) => {
    const onMsg = (e) => { if (e.source !== frame.contentWindow || !test(e.data)) return; clearTimeout(tm); window.removeEventListener("message", onMsg); e.data.error ? reject(new Error(`Adegan error: ${e.data.error}`)) : resolve(e.data); };
    const tm = setTimeout(() => { window.removeEventListener("message", onMsg); reject(new Error(what)); }, ms);
    window.addEventListener("message", onMsg); });
  try {
    const ready = wait((d) => d?.motionReady, 15000, "Halaman render adegan tidak termuat (15 detik).");
    frame.src = `/motion-preview?r=${Date.now()}`; await ready;
    const set = wait((d) => d?.motionSpec, 10000, "Adegan tidak menerima spesifikasi."); frame.contentWindow.postMessage({ spec, quiet: true }, "*"); await set;
    for (const kind of matte ? ["color", "matte"] : ["color"]) {
      const canvas = document.createElement("canvas"); canvas.width = ow; canvas.height = oh;
      const output = new Output({ format: codec === "avc" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(), target: new BufferTarget() });
      const src = new CanvasSource(canvas, { codec, bitrate: mbps * 1e6, keyFrameInterval: 1 }); output.addVideoTrack(src, { frameRate: fps }); await output.start();
      tracks.push({ kind, canvas, ctx: canvas.getContext("2d"), output, src });
    }
    let poster = null; const t0 = performance.now();
    for (let n = 0; n < total; n++) {
      if (signal?.aborted) throw new Error("Render dibatalkan.");
      const got = wait((d) => d?.capN === n, 30000, `Frame ${n} tidak selesai (30 detik).`);
      frame.contentWindow.postMessage({ cap: { n, w: ow, h: oh, matte } }, "*"); const d = await got;
      for (const t of tracks) { const bmp = t.kind === "matte" ? d.matte : d.color; t.ctx.drawImage(bmp, 0, 0); bmp.close?.(); await t.src.add(n / fps, 1 / fps); }
      if (n === Math.floor(total / 2)) poster = await new Promise((r) => tracks[0].canvas.toBlob(r, "image/jpeg", 0.9));
      if (n % 3 === 0 || n === total - 1) { const p = (n + 1) / total, el = (performance.now() - t0) / 1000; onProgress?.({ p, left: Math.round(el / p - el) }); }
    }
    for (const t of tracks) await t.output.finalize();
    const blob = (t) => new Blob([t.output.target.buffer], { type: `video/${ext}` });
    return { ext, video: blob(tracks[0]), matte: tracks[1] ? blob(tracks[1]) : null, poster };
  } catch (e) { for (const t of tracks) { try { await t.output.cancel(); } catch {} } throw e; }
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
    const h = await window.showSaveFilePicker({ id: "stockscope-render", suggestedName: name, startIn: "downloads", types: [{ description: ext === ".jpg" ? "Gambar" : "Video", accept: { [type.split(";")[0]]: [ext] } }] });
    const w = await h.createWritable(); await w.write(blob); await w.close(); return "saved";
  } catch (e) { if (e?.name === "AbortError") return "cancel"; saveBlob(blob, name); return "download"; }
}

export function saveBlob(blob, name) {
  const a = document.createElement("a"), url = URL.createObjectURL(blob); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
