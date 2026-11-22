// Web Worker: encodes one RGBA frame at a time into ProRes 4444 (ffmpeg.wasm, @ffmpeg/core). The page turns the
// returned one-frame .mov into the final multi-frame .mov (lib/prores.mjs). Classic worker: importScripts is allowed.
let core = null, busy = Promise.resolve();

async function load() {
  importScripts("/ffmpeg/ffmpeg-core.js");
  core = await self.createFFmpegCore({ locateFile: (p) => "/ffmpeg/" + p });
  core.setLogger(() => {});
}

async function encode({ rgba, w, h }) {
  core.FS.writeFile("in.rgba", new Uint8Array(rgba));
  core.exec(
    "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w}x${h}`, "-i", "in.rgba",
    "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuva444p10le",
    "-c:v", "prores_ks", "-profile:v", "4", "-vendor", "apl0",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
    "-frames:v", "1", "-f", "mov", "out.mov");
  let out;
  try { out = core.FS.readFile("out.mov"); } catch { throw new Error("ffmpeg tidak menghasilkan frame ProRes."); }
  try { core.FS.unlink("out.mov"); } catch {}
  try { core.FS.unlink("in.rgba"); } catch {}
  return out;
}

self.onmessage = (e) => {
  const { id, type } = e.data;
  // One job at a time: ffmpeg.wasm shares one filesystem.
  busy = busy.then(async () => {
    try {
      if (type === "load") { if (!core) await load(); self.postMessage({ id, ok: true }); return; }
      const out = await encode(e.data);
      self.postMessage({ id, ok: true, mov: out.buffer }, [out.buffer]);
    } catch (err) { self.postMessage({ id, ok: false, error: String(err && err.message || err) }); }
  });
};
