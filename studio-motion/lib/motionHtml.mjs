// Standalone "render in Chrome" page for one Studio Motion job. The owner opens the .html file in Chrome on the Mac:
// it previews the loop and, on "Render", encodes the exact frames with WebCodecs + Mediabunny (both inlined, so the
// file works offline) and downloads <name>.mp4 + <name>-matte.mp4 + <name>-poster.jpg. Claude then runs the CSV pipeline.
// Inputs are source texts so this works both in a Next.js route and in a plain Node script.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const noClose = (s) => String(s).replace(/<\/script/gi, "<\\/script");
const json = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
// Mediabunny's ESM bundle ends with one `export{a as B,...}`; turn it into a global so it loads as a plain inline module
// (dynamic import() of a blob: URL is blocked in some viewers, e.g. app previews).
function mbGlobal(src) {
  const i = src.lastIndexOf("export{"); if (i < 0) throw new Error("Mediabunny bundle: export list not found");
  const j = src.indexOf("}", i), list = src.slice(i + 7, j).split(",").map((x) => x.trim()).filter(Boolean)
    .map((x) => { const [a, b] = x.split(/\s+as\s+/); return `${b || a}:${a}`; });
  return `${src.slice(0, i)}globalThis.Mediabunny={${list.join(",")}};${src.slice(j + 1).replace(/^;/, "")}`;
}

export function motionHtml({ job, engine, mediabunny }) {
  const name = String(job.name || "video").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 26);
  const data = { name, title: job.title || "", keywords: job.keywords || "", spec: job.spec, outputs: (job.outputs || ["mp4", "matte"]).filter((o) => o !== "alpha"), alpha: (job.outputs || []).includes("alpha") };
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)} · Render Studio Motion</title>
<style>
:root{--bg:#0c0d0e;--card:#17181a;--line:rgba(255,255,255,.08);--ink:#f4f4f2;--mute:#9a9b98;--lime:#c8f031;--on:#0c0d0e;--red:#ff6b62}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 Inter,system-ui,-apple-system,sans-serif;padding:24px 16px}
main{max-width:1000px;margin:0 auto;display:grid;gap:16px}h1{font-size:22px;font-weight:800;text-transform:uppercase;margin:0;letter-spacing:.02em}h1 em{color:var(--lime);font-style:normal}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px}canvas{display:block;width:100%;height:auto;border-radius:12px;background:#000}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}button{font:inherit;border:1px solid var(--line);background:#222326;color:var(--ink);border-radius:999px;padding:8px 16px;cursor:pointer}
button.on{background:#fff;color:#111}button.go{background:var(--lime);color:var(--on);border:0;font-weight:700;padding:10px 22px}button:disabled{opacity:.5;cursor:default}
.bar{height:8px;background:#222326;border-radius:99px;overflow:hidden;flex:1;min-width:160px}.bar i{display:block;height:100%;width:0;background:var(--lime)}
.mute{color:var(--mute)}.err{color:var(--red)}a{color:var(--lime)}code{background:#222326;padding:1px 6px;border-radius:6px}ol{margin:6px 0 0;padding-left:20px}
dl{display:grid;grid-template-columns:110px 1fr;gap:4px 12px;margin:0}dt{color:var(--mute)}dd{margin:0;word-break:break-word}
</style></head><body><main>
<h1>Render <em>video</em></h1>
<div class="card"><canvas id="c" width="960" height="540"></canvas>
  <div class="row" style="margin-top:12px"><button id="vColor" class="on">Warna</button><button id="vMatte">Luma matte</button><span class="mute" id="info"></span></div></div>
<div class="card"><div class="row"><button class="go" id="go">Render &amp; unduh</button><button id="stop" hidden>Batal</button><div class="bar"><i id="bar"></i></div><span id="pct" class="mute">siap</span></div>
  <p id="msg" class="mute" style="margin:10px 0 0"></p><div id="files" class="row" style="margin-top:8px"></div></div>
<div class="card"><dl><dt>File</dt><dd id="fFiles"></dd><dt>Judul</dt><dd id="fTitle"></dd><dt>Keywords</dt><dd id="fKw" class="mute"></dd></dl>
  <ol class="mute"><li>Klik <b>Render &amp; unduh</b>, biarkan tab ini terbuka sampai 100% (Chrome mungkin bertanya "unduh beberapa file": izinkan).</li>
  <li>Pindahkan file hasil unduhan ke <code>Microstok/_FILE-KERJA/v01-video-overlays</code> (atau folder batch yang disebut Claude).</li>
  <li>Bilang ke Claude "sudah dirender": CSV dan folder platform diurus Claude.</li></ol></div>
</main>
<script type="module">${noClose(mbGlobal(mediabunny))}</script>
<script type="application/json" id="job">${json(data)}</script>
<script type="module">
${noClose(engine)}
const JOB = JSON.parse(document.getElementById("job").textContent), spec = normalizeSpec(JOB.spec), [W, H] = RESOLUTIONS[spec.resolution], FR = spec.fps * spec.duration;
const $ = (id) => document.getElementById(id), mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const suffix = { mp4: "", matte: "-matte" };
$("fTitle").textContent = JOB.title; $("fKw").textContent = JOB.keywords;
$("fFiles").textContent = JOB.outputs.map((o) => JOB.name + suffix[o] + ".mp4").concat(JOB.name + "-poster.jpg").join(" · ") + (JOB.alpha ? " (MOV alpha hanya bisa dari render Mac)" : "");
if (!("VideoEncoder" in window)) $("msg").innerHTML = '<span class="err">Penampil ini tidak bisa merender video. Buka file ini di Google Chrome (klik kanan file → Open With → Google Chrome).</span>';
$("info").textContent = W + "×" + H + " · " + spec.fps + " fps · " + spec.duration + " dtk · loop";
function compose(dst, layer, mode) {
  const c = dst.getContext("2d"), w = dst.width, h = dst.height; c.globalCompositeOperation = "source-over";
  if (mode === "matte") { c.clearRect(0, 0, w, h); c.drawImage(layer, 0, 0, w, h); c.globalCompositeOperation = "source-in"; c.fillStyle = "#fff"; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = "destination-over"; c.fillStyle = "#000"; c.fillRect(0, 0, w, h); c.globalCompositeOperation = "source-over"; return; }
  c.fillStyle = spec.bg; c.fillRect(0, 0, w, h); c.drawImage(layer, 0, 0, w, h);
}
// Preview (960 px wide, real time). Paused while rendering so the encoder gets the CPU.
let view = "color", raf = 0, busy = false;
const cv = $("c"); cv.width = 960; cv.height = Math.round(960 * H / W);
const pl = mk(cv.width, cv.height), pctx = pl.getContext("2d"), pstate = { cache: {}, mk };
function preview() { cancelAnimationFrame(raf); const t0 = performance.now(); let last = -1;
  const tick = (now) => { if (busy) return; const f = Math.floor(((now - t0) / 1000) * spec.fps) % FR;
    if (f !== last) { last = f; try { drawFrame(pctx, spec, f, pl.width, pl.height, pstate); compose(cv, pl, view); } catch (e) { $("msg").innerHTML = '<span class="err">Adegan error: ' + e.message + "</span>"; return; } }
    raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); }
$("vColor").onclick = () => { view = "color"; $("vColor").className = "on"; $("vMatte").className = ""; };
$("vMatte").onclick = () => { view = "matte"; $("vMatte").className = "on"; $("vColor").className = ""; };
preview();
function save(blob, file) { const a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = file; a.textContent = file + " (" + (blob.size / 1e6).toFixed(1) + " MB)"; $("files").append(a); a.click(); }
let ctl = null;
$("stop").onclick = () => ctl && ctl.abort();
$("go").onclick = async () => {
  busy = true; ctl = new AbortController(); $("go").disabled = true; $("stop").hidden = false; $("files").innerHTML = ""; $("msg").textContent = "Menyiapkan encoder…";
  try {
    const mb = globalThis.Mediabunny; if (!mb) throw new Error("Encoder belum termuat. Buka file ini di Google Chrome.");
    const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, QUALITY_VERY_HIGH, canEncodeVideo } = mb;
    if (!(await canEncodeVideo("avc", { width: W, height: H }))) throw new Error("Chrome ini tidak bisa meng-encode H.264 " + W + "×" + H + ". Pakai Google Chrome terbaru di Mac (bukan Chromium).");
    const layer = mk(W, H), lctx = layer.getContext("2d"), state = { cache: {}, mk }, tracks = [];
    for (const o of JOB.outputs) { const canvas = mk(W, H), output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
      const src = new CanvasSource(canvas, { codec: "avc", bitrate: QUALITY_VERY_HIGH, keyFrameInterval: 1 }); output.addVideoTrack(src, { frameRate: spec.fps }); await output.start(); tracks.push({ o, canvas, output, src }); }
    const t0 = performance.now(); $("msg").textContent = "Merender " + FR + " frame…";
    for (let f = 0; f < FR; f++) {
      if (ctl.signal.aborted) { await Promise.all(tracks.map((t) => t.output.cancel())); throw new Error("Render dibatalkan."); }
      drawFrame(lctx, spec, f, W, H, state);
      if (f === Math.floor(FR / 2)) { const pc = mk(W, H); compose(pc, layer, "color"); pc.toBlob((b) => b && save(b, JOB.name + "-poster.jpg"), "image/jpeg", 0.88); }
      for (const t of tracks) { compose(t.canvas, layer, t.o); await t.src.add(f / spec.fps, 1 / spec.fps); }
      if (f % 3 === 0 || f === FR - 1) { const p = (f + 1) / FR, el = (performance.now() - t0) / 1000; $("bar").style.width = (p * 100).toFixed(1) + "%";
        $("pct").textContent = Math.round(p * 100) + "% · sisa ±" + Math.max(0, Math.round(el / p - el)) + " dtk"; await new Promise((r) => setTimeout(r)); }
    }
    $("msg").textContent = "Menyelesaikan file…";
    for (const t of tracks) { await t.output.finalize(); save(new Blob([t.output.target.buffer], { type: "video/mp4" }), JOB.name + suffix[t.o] + ".mp4"); }
    $("msg").textContent = "Selesai dalam " + Math.round((performance.now() - t0) / 1000) + " dtk. Pindahkan file ke folder batch lalu kabari Claude.";
  } catch (e) { $("msg").innerHTML = '<span class="err">' + e.message + "</span>"; }
  finally { busy = false; $("go").disabled = false; $("stop").hidden = true; preview(); }
};
</script></body></html>`;
}
