#!/usr/bin/env node
// Render a Studio Motion spec to stock-ready video files with @napi-rs/canvas + FFmpeg (runs on the owner's Mac).
// Usage: node render-motion.mjs <job.json> <outDir>
//   job.json: { "name": "file-base-name", "spec": { template, params, resolution, fps, duration, seed, bg }, "outputs": ["mp4","matte","alpha"] }
// Outputs (overlay templates): <name>.mp4 (H.264 on the background colour), <name>-matte.mp4 (luma matte from the alpha),
// <name>-alpha.mov (PNG codec with real alpha, optional; large for noisy templates), <name>-poster.jpg (middle frame).
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";

const here = dirname(fileURLToPath(import.meta.url));
const { normalizeSpec, drawFrame, RESOLUTIONS, MOTION_VERSION } = await import(join(here, "motion.mjs"));

const [jobPath, outDir = "."] = process.argv.slice(2);
if (!jobPath) { console.error("usage: node render-motion.mjs job.json outDir"); process.exit(2); }
const job = JSON.parse(readFileSync(jobPath, "utf8"));
// A job made by a newer StockScope than this copy of the engine must not silently render something else.
if ((job.spec?.v ?? 1) > MOTION_VERSION || (job.spec?.code && MOTION_VERSION < 2)) { console.error(`engine v${MOTION_VERSION} terlalu lama untuk job v${job.spec?.v}: salin ulang motion.mjs dari StockScope.`); process.exit(3); }
const spec = normalizeSpec(job.spec), [W, H] = RESOLUTIONS[spec.resolution], frames = spec.fps * spec.duration;
const name = String(job.name || spec.template).replace(/[^a-z0-9-]/gi, "-").slice(0, 26).toLowerCase();
const outs = new Set(job.outputs?.length ? job.outputs : ["mp4", "matte"]);
mkdirSync(outDir, { recursive: true });

const layer = createCanvas(W, H), ctx = layer.getContext("2d"), S = `${W}x${H}`;
// One FFmpeg process per output, one after another: three 4K encoders at once do not fit in the 4 GB VM.
const x264 = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p", "-x264-params", "rc-lookahead=20", "-threads", "4", "-movflags", "+faststart", "-an"];
const PASSES = {
  mp4: { file: `${name}.mp4`, vf: ["-filter_complex", `color=c=${spec.bg.replace("#", "0x")}:s=${S}:r=${spec.fps}[bg];[bg][0:v]overlay=shortest=1:format=auto,format=yuv420p[v]`, "-map", "[v]"], enc: x264 },
  matte: { file: `${name}-matte.mp4`, vf: ["-vf", "alphaextract,format=yuv420p"], enc: x264 },
  alpha: { file: `${name}-alpha.mov`, vf: [], enc: ["-c:v", "png", "-pix_fmt", "rgba", "-an"] },
};

async function pass(key) {
  const P = PASSES[key], state = { cache: {}, mk: (w, h) => createCanvas(w, h) };
  const ff = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", S, "-r", String(spec.fps), "-i", "-", ...P.vf, ...P.enc, join(outDir, P.file)], { stdio: ["pipe", "inherit", "inherit"] });
  let dead = null; ff.on("error", (e) => (dead = e)); ff.stdin.on("error", (e) => (dead = e));
  const closed = new Promise((res) => ff.on("close", (code, sig) => res(sig ? `signal ${sig}` : code)));
  for (let f = 0; f < frames; f++) {
    if (dead) break;
    drawFrame(ctx, spec, f, W, H, state);
    const ok = ff.stdin.write(Buffer.from(ctx.getImageData(0, 0, W, H).data.buffer));
    if (!ok) await new Promise((r) => ff.stdin.once("drain", r));
    if (key === [...outs][0] && f === Math.floor(frames / 2)) { const pc = createCanvas(W, H), px = pc.getContext("2d"); px.fillStyle = spec.bg; px.fillRect(0, 0, W, H); px.drawImage(layer, 0, 0);
      writeFileSync(join(outDir, `${name}-poster.jpg`), pc.toBuffer("image/jpeg", 88)); }
    if (f % spec.fps === 0) process.stdout.write(`\r${key} ${f}/${frames}`);
  }
  ff.stdin.end();
  const code = await closed;
  if (code !== 0) throw new Error(`ffmpeg ${key}: ${code}${dead ? " (" + dead.message + ")" : ""}`);
  console.log(`\r${key} ok ${P.file}`);
}

const t0 = Date.now();
try { for (const k of ["mp4", "matte", "alpha"]) if (outs.has(k)) await pass(k); }
catch (e) { console.error("\n" + e.message); process.exit(1); }
console.log(`ok ${name} ${S} ${spec.fps}fps ${spec.duration}s in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
