import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

// Sandboxed preview for Studio Motion custom scenes. A scene is code (written by Claude via MCP buat_video), so it
// runs only here: the page is loaded in <iframe sandbox="allow-scripts"> (opaque origin: no cookies, no localStorage,
// no Apify token) and its own CSP blocks every network request (connect-src 'none'). The parent sends the spec with
// postMessage; this page draws it with the same engine as the Mac renderer (lib/motion.mjs, inlined below).
const PREVIEW = `
const cv = document.getElementById("c"), msg = document.getElementById("m");
const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
let spec = null, view = "color", raf = 0;
function compose(layer) {
  const c = cv.getContext("2d"), W = cv.width, H = cv.height; c.globalCompositeOperation = "source-over";
  if (view === "matte") { c.clearRect(0, 0, W, H); c.drawImage(layer, 0, 0); c.globalCompositeOperation = "source-in"; c.fillStyle = "#fff"; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = "destination-over"; c.fillStyle = "#000"; c.fillRect(0, 0, W, H); c.globalCompositeOperation = "source-over"; return; }
  c.fillStyle = spec.bg; c.fillRect(0, 0, W, H); c.drawImage(layer, 0, 0);
}
function start() {
  cancelAnimationFrame(raf); if (!spec) return;
  const [W, H] = RESOLUTIONS[spec.resolution], w = 960, h = Math.round(w * H / W);
  cv.width = w; cv.height = h; msg.textContent = "";
  const layer = mk(w, h), lctx = layer.getContext("2d"), state = { cache: {}, mk }, frames = spec.fps * spec.duration, t0 = performance.now();
  let last = -1;
  const tick = (now) => { const f = Math.floor(((now - t0) / 1000) * spec.fps) % frames;
    if (f !== last) { last = f;
      try { drawFrame(lctx, spec, f, w, h, state); compose(layer); }
      catch (e) { msg.textContent = "Adegan error: " + e.message; parent.postMessage({ motionError: e.message }, "*"); return; } }
    raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);
}
// Bulk render from Studio Motion: the parent sends { spec, quiet: true } once, then { cap: { n, w, h, matte } } per frame and
// gets back the colour frame (+ luma matte) as ImageBitmaps. The scene code still runs only inside this sandbox.
let rs = null;
function composeTo(dst, layer, mode) {
  const c = dst.getContext("2d"), W = dst.width, H = dst.height; c.globalCompositeOperation = "source-over";
  if (mode === "matte") { c.clearRect(0, 0, W, H); c.drawImage(layer, 0, 0); c.globalCompositeOperation = "source-in"; c.fillStyle = "#fff"; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = "destination-over"; c.fillStyle = "#000"; c.fillRect(0, 0, W, H); c.globalCompositeOperation = "source-over"; return; }
  c.fillStyle = spec.bg; c.fillRect(0, 0, W, H); c.drawImage(layer, 0, 0);
}
async function capture({ n, w, h, matte }) {
  if (!rs || rs.w !== w || rs.h !== h) rs = { w, h, layer: mk(w, h), out: mk(w, h), state: { cache: {}, mk } };
  try {
    drawFrame(rs.layer.getContext("2d"), spec, n, w, h, rs.state);
    composeTo(rs.out, rs.layer, "color"); const color = await createImageBitmap(rs.out), list = [color]; let m = null;
    if (matte) { composeTo(rs.out, rs.layer, "matte"); m = await createImageBitmap(rs.out); list.push(m); }
    parent.postMessage({ capN: n, color, matte: m }, "*", list);
  } catch (err) { parent.postMessage({ capN: n, error: err.message }, "*"); }
}
addEventListener("message", (e) => {
  if (e.source !== parent || !e.data || typeof e.data !== "object") return;
  if (e.data.cap) { if (spec) capture(e.data.cap); else parent.postMessage({ capN: e.data.cap.n, error: "spec belum dikirim" }, "*"); return; }
  if (e.data.view) view = e.data.view === "matte" ? "matte" : "color";
  if (e.data.spec) { spec = normalizeSpec(e.data.spec); rs = null; }
  if (e.data.quiet) { cancelAnimationFrame(raf); parent.postMessage({ motionSpec: true }, "*"); return; }
  start();
});
parent.postMessage({ motionReady: true }, "*");
`;

const CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'";

export async function GET() {
  const engine = await fs.readFile(path.join(process.cwd(), "lib", "motion.mjs"), "utf8");
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:transparent;color:#f4f4f2;font:13px Inter,system-ui,sans-serif}canvas{display:block;width:100%;height:auto}#m{position:absolute;left:12px;bottom:10px;color:#ff6b62}</style>
</head><body><canvas id="c" width="960" height="540"></canvas><div id="m"></div>
<script type="module">${engine.replace(/<\/script/gi, "<\\/script")}\n${PREVIEW}</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": CSP, "X-Frame-Options": "SAMEORIGIN",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
}
