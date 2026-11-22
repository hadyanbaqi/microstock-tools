// ProRes 4444 in a QuickTime .mov, without a muxer library.
// ffmpeg.wasm (public/ffmpeg, run by public/ffmpeg/prores-worker.js) encodes ONE frame at a time into a tiny .mov;
// this file takes the encoded frame and the sample description out of that .mov and writes the final multi-frame .mov.
// ProRes is intra-only, so every frame is independent and the frames can simply be put one after another.

const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(n >>> 8) & 255, n & 255];
const fourcc = (s) => [...s].map((c) => c.charCodeAt(0));
const concat = (arrs) => { const out = new Uint8Array(arrs.reduce((a, b) => a + b.length, 0)); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };
const box = (type, ...payload) => { const body = concat(payload.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)))); return concat([Uint8Array.from([...u32(body.length + 8), ...fourcc(type)]), body]); };
const full = (type, version, flags, ...payload) => box(type, [version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...payload);

const readU32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const typeAt = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

// Child boxes of b[start, end): [{ type, start, end, body }]
function boxes(b, start = 0, end = b.length) {
  const out = []; let o = start;
  while (o + 8 <= end) {
    let size = readU32(b, o); const type = typeAt(b, o + 4); let head = 8;
    if (size === 1) { size = readU32(b, o + 12); head = 16; } // 64-bit size (the high word is 0 for our sizes)
    if (size === 0) size = end - o;
    if (size < head || o + size > end) break;
    out.push({ type, start: o, end: o + size, body: o + head }); o += size;
  }
  return out;
}
const find = (b, list, type) => list.find((x) => x.type === type);

// Takes the one frame and the sample description (stsd box, with colour tags) out of a single-frame .mov made by ffmpeg.
export function parseFrameMov(b) {
  const top = boxes(b);
  const mdat = find(b, top, "mdat"), moov = find(b, top, "moov");
  if (!mdat || !moov) throw new Error("Hasil ProRes tidak valid (mdat/moov tidak ada).");
  const trak = find(b, boxes(b, moov.body, moov.end), "trak");
  const mdia = find(b, boxes(b, trak.body, trak.end), "mdia");
  const minf = find(b, boxes(b, mdia.body, mdia.end), "minf");
  const stbl = find(b, boxes(b, minf.body, minf.end), "stbl");
  const stsd = find(b, boxes(b, stbl.body, stbl.end), "stsd");
  return { frame: b.subarray(mdat.body, mdat.end), stsd: b.slice(stsd.start, stsd.end) };
}

// sizes: byte size of every frame, in order. Returns { head, tail }: write head, then the frame bytes in order, then tail.
export function movLayout({ sizes, stsd, width, height, fps }) {
  const n = sizes.length, total = sizes.reduce((a, b) => a + b, 0), ts = fps * 1000, dur = n * 1000;
  const ftyp = box("ftyp", fourcc("qt  "), u32(0x20050300), fourcc("qt  "));
  const mdatHead = Uint8Array.from([...u32(1), ...fourcc("mdat"), 0, 0, 0, 0, ...u32(total + 16)]); // 64-bit size
  const dataStart = ftyp.length + mdatHead.length;
  const matrix = [...u32(0x10000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x10000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)];
  const mvhd = full("mvhd", 0, 0, u32(0), u32(0), u32(ts), u32(dur), u32(0x10000), u16(0x100), new Uint8Array(10), matrix, new Uint8Array(24), u32(2));
  const tkhd = full("tkhd", 0, 3, u32(0), u32(0), u32(1), u32(0), u32(dur), new Uint8Array(8), u16(0), u16(0), u16(0), u16(0), matrix, u32(width << 16), u32(height << 16));
  const mdhd = full("mdhd", 0, 0, u32(0), u32(0), u32(ts), u32(dur), u16(0x55c4), u16(0));
  const hdlr = full("hdlr", 0, 0, u32(0), fourcc("vide"), new Uint8Array(12), [12, ...fourcc("VideoHandler")]);
  const vmhd = full("vmhd", 0, 1, u16(0), u16(0), u16(0), u16(0));
  const dinf = box("dinf", full("dref", 0, 0, u32(1), full("url ", 0, 1)));
  const stts = full("stts", 0, 0, u32(1), u32(n), u32(1000));
  const stsc = full("stsc", 0, 0, u32(1), u32(1), u32(n), u32(1));
  const stsz = full("stsz", 0, 0, u32(0), u32(n), ...sizes.map((s) => u32(s)));
  const stco = full("stco", 0, 0, u32(1), u32(dataStart));
  const stbl = box("stbl", stsd, stts, stsc, stsz, stco);
  const moov = box("moov", mvhd, box("trak", tkhd, box("mdia", mdhd, hdlr, box("minf", vmhd, dinf, stbl))));
  return { head: concat([ftyp, mdatHead]), tail: moov, total };
}
