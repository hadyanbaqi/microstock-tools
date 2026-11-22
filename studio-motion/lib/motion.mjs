// Studio Motion: animation templates for stock video, drawn with the Canvas 2D API so the same code runs in the
// browser (preview + WebCodecs export) and on the owner's Mac (@napi-rs/canvas + FFmpeg, see scripts/render-motion.mjs).
// Every template is deterministic: draw(ctx, S) depends only on S (frame, size, params), never on wall-clock time,
// and S.t = frame / frames runs 0 → 1 over the clip, so all motion is periodic in t and the clip loops seamlessly.
// Templates draw only their elements on a transparent layer; the engine adds the background, alpha and luma matte.

export const MOTION_VERSION = 2;

export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const TAU = Math.PI * 2;
const frac = (x) => x - Math.floor(x);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const easeOut = (u) => 1 - Math.pow(1 - clamp(u), 3);
const hex2rgb = (h) => { const n = parseInt(String(h).replace("#", "").padEnd(6, "0").slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a) => { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${clamp(a)})`; };

// Shared metadata vocabulary for stock video (lower case, no brand names).
const VIDEO_KW = "video, animation, motion graphics, 4k, seamless loop, loop, looping, background, overlay, effect, motion, animated, footage, element, graphic, design, abstract, black background, visual effect, vfx, editing, compositing, transition, digital, modern, creative, cinematic, video editing, post production, template";

// Param types: color | range | select. Each template lists only what changes the look.
export const TEMPLATES = [
  {
    id: "film-grain", name: "Film Grain & Dust", kind: "overlay",
    desc: "Grain film, debu, rambut dan goresan vertikal yang berkedip per frame. Overlay klasik untuk efek film lama.",
    why: "Overlay grain/debu termasuk niche overlay yang laku (aset baru 97–198 dl/bln di vektor; versi video stop motion ±13 dl/bln).",
    params: [
      { key: "color", label: "Warna", type: "color", def: "#ffffff" },
      { key: "grain", label: "Grain", type: "range", min: 0, max: 1, step: 0.05, def: 0.5 },
      { key: "dust", label: "Debu", type: "range", min: 0, max: 80, step: 1, def: 26 },
      { key: "hairs", label: "Rambut", type: "range", min: 0, max: 4, step: 1, def: 1 },
      { key: "scratches", label: "Goresan", type: "range", min: 0, max: 6, step: 1, def: 2 },
      { key: "flicker", label: "Kedip", type: "range", min: 0, max: 1, step: 0.05, def: 0.3 },
    ],
    meta: { title: "Film grain dust and scratches overlay old movie effect on black", keywords: "film grain, dust, scratches, old film, vintage, retro, film effect, noise, grain, analog, old movie, film texture, damaged film, flicker, hair, specks, grunge, distressed, projector" },
    draw(ctx, S) {
      const { W, H, k, p, frame, seed, mk, cache } = S, R = rng(seed * 7919 + frame * 104729);
      ctx.globalAlpha = 1 - p.flicker * R() * 0.45;
      if (p.grain > 0) {
        const T = 256; if (!cache.tile) cache.tile = mk(T, T);
        const tc = cache.tile.getContext("2d"), img = tc.createImageData(T, T), d = img.data, [r, g, b] = hex2rgb(p.color);
        for (let i = 0; i < d.length; i += 4) { const v = R(); d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = v > 0.55 ? Math.pow((v - 0.55) / 0.45, 2) * 255 * p.grain : 0; }
        tc.putImageData(img, 0, 0);
        const sc = Math.max(1, Math.round(k * 1.4)), ts = T * sc, ox = -Math.floor(R() * ts), oy = -Math.floor(R() * ts);
        ctx.imageSmoothingEnabled = false;
        for (let y = oy; y < H; y += ts) for (let x = ox; x < W; x += ts) ctx.drawImage(cache.tile, x, y, ts, ts);
        ctx.imageSmoothingEnabled = true;
      }
      ctx.fillStyle = p.color; ctx.strokeStyle = p.color;
      const n = Math.round(p.dust * (0.6 + 0.8 * R()));
      for (let i = 0; i < n; i++) { const big = R() < 0.08, rr = (big ? 6 + R() * 12 : 1 + R() * 4) * k; ctx.globalAlpha = 0.45 + 0.55 * R();
        ctx.beginPath(); ctx.ellipse(R() * W, R() * H, rr, rr * (0.6 + R() * 0.6), R() * TAU, 0, TAU); ctx.fill(); }
      for (let i = 0; i < p.hairs; i++) { if (R() < 0.45) continue; const x = R() * W, y = R() * H, l = (50 + R() * 150) * k, a = R() * TAU;
        ctx.globalAlpha = 0.7; ctx.lineWidth = 1.6 * k; ctx.beginPath(); ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.cos(a + 1) * l, y + Math.sin(a + 1) * l, x + Math.cos(a) * l * 1.3, y + Math.sin(a) * l * 1.3); ctx.stroke(); }
      // scratches hold for a few frames, so they read as real film damage instead of noise
      for (let i = 0; i < p.scratches; i++) { const Q = rng(seed * 31 + i * 977 + Math.floor(frame / 4) * 13); if (Q() < 0.35) continue;
        const x = Q() * W + (R() - 0.5) * 3 * k, y0 = Q() < 0.5 ? 0 : Q() * H * 0.5, y1 = Q() < 0.5 ? H : y0 + H * (0.3 + Q() * 0.5);
        ctx.globalAlpha = 0.25 + 0.45 * Q(); ctx.lineWidth = (1 + Q() * 1.8) * k; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x + (Q() - 0.5) * 20 * k, y1); ctx.stroke(); }
      ctx.globalAlpha = 1;
    },
  },
  {
    id: "gold-particles", name: "Gold Particles", kind: "overlay",
    desc: "Partikel emas berkilau yang jatuh, naik atau melayang, dengan bintang kilau. Loop mulus.",
    why: "Partikel emas/glitter loop termasuk video motion terlaris (22–27 dl/bln).",
    params: [
      { key: "color", label: "Warna glow", type: "color", def: "#f5b82e" },
      { key: "color2", label: "Warna inti", type: "color", def: "#fff4c9" },
      { key: "count", label: "Jumlah", type: "range", min: 30, max: 400, step: 10, def: 170 },
      { key: "size", label: "Ukuran", type: "range", min: 0.5, max: 2.5, step: 0.1, def: 1 },
      { key: "dir", label: "Arah", type: "select", options: [["down", "Turun"], ["up", "Naik"], ["float", "Melayang"]], def: "down" },
      { key: "loops", label: "Kecepatan", type: "range", min: 1, max: 3, step: 1, def: 1 },
    ],
    meta: { title: "Gold glitter particles falling seamless loop on black background", keywords: "gold, golden, particles, glitter, sparkle, shine, shimmer, bokeh, glow, luxury, magic, festive, celebration, stars, dust, twinkle, christmas, new year, award" },
    draw(ctx, S) {
      const { W, H, k, p, t, seed, cache } = S;
      if (!cache.parts || cache.n !== p.count) { const R = rng(seed); cache.n = p.count;
        cache.parts = Array.from({ length: p.count }, () => ({ x: R(), y: R(), s: 0.4 + R() * R() * 2.2, ph: R(), kx: 1 + Math.floor(R() * 2), tw: 1 + Math.floor(R() * 4), amp: 0.005 + R() * 0.02, spark: R() < 0.16, sp: 1 + Math.floor(R() * 2) })); }
      ctx.globalCompositeOperation = "lighter";
      const m = 40 * k, dir = p.dir === "up" ? -1 : 1;
      for (const q of cache.parts) {
        const y = p.dir === "float" ? q.y * H + Math.sin(TAU * (t * q.kx + q.ph)) * H * 0.04 : frac(q.y + dir * p.loops * q.sp * t) * (H + 2 * m) - m;
        const x = q.x * W + Math.sin(TAU * (t * q.kx + q.ph)) * W * q.amp, b = 0.55 + 0.45 * Math.sin(TAU * (q.tw * t + q.ph)), s = q.s * p.size * 3 * k;
        const g = ctx.createRadialGradient(x, y, 0, x, y, s * 4); g.addColorStop(0, rgba(p.color, 0.55 * b)); g.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s * 4, 0, TAU); ctx.fill();
        ctx.fillStyle = rgba(p.color2, 0.6 + 0.4 * b); ctx.beginPath(); ctx.arc(x, y, s * 0.8, 0, TAU); ctx.fill();
        if (q.spark && b > 0.7) { const l = s * 7 * (b - 0.6) / 0.4; ctx.strokeStyle = rgba(p.color2, b); ctx.lineWidth = Math.max(1, s * 0.35);
          ctx.beginPath(); ctx.moveTo(x - l, y); ctx.lineTo(x + l, y); ctx.moveTo(x, y - l); ctx.lineTo(x, y + l); ctx.stroke(); }
      }
      ctx.globalCompositeOperation = "source-over";
    },
  },
  {
    id: "neon-frame", name: "Neon Frame", kind: "overlay",
    desc: "Bingkai neon bercahaya yang berdenyut, dengan kilatan cahaya yang berjalan mengelilingi bingkai.",
    why: "Frame neon/laser loop laku ±16 dl/bln; cocok untuk intro, judul dan konten media sosial.",
    params: [
      { key: "color", label: "Warna neon", type: "color", def: "#19e3ff" },
      { key: "color2", label: "Warna kilatan", type: "color", def: "#ff3df2" },
      { key: "width", label: "Tebal", type: "range", min: 2, max: 14, step: 1, def: 6 },
      { key: "radius", label: "Sudut", type: "range", min: 0, max: 240, step: 10, def: 60 },
      { key: "inset", label: "Jarak tepi", type: "range", min: 3, max: 25, step: 1, def: 8 },
      { key: "pulses", label: "Denyut", type: "range", min: 0, max: 4, step: 1, def: 2 },
    ],
    meta: { title: "Neon glowing frame border loop with running light on black", keywords: "neon, frame, border, glow, glowing, light, laser, neon light, led, futuristic, cyberpunk, nightclub, rectangle, bright, electric, pulse, intro, title, social media" },
    draw(ctx, S) {
      const { W, H, k, p, t } = S, ins = Math.min(W, H) * p.inset / 100, x = ins, y = ins, w = W - 2 * ins, h = H - 2 * ins, r = Math.min(p.radius * k, w / 2, h / 2);
      const path = () => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
      const pulse = p.pulses ? 0.78 + 0.22 * Math.sin(TAU * p.pulses * t) : 1, lw = p.width * k, per = 2 * (w + h) - (8 - TAU) * r;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      [[lw * 8, 0.12], [lw * 4, 0.26], [lw * 1.8, 0.55], [lw, 1]].forEach(([wd, a]) => { ctx.strokeStyle = rgba(p.color, a * pulse); ctx.lineWidth = wd; path(); ctx.stroke(); });
      ctx.strokeStyle = rgba("#ffffff", 0.75 * pulse); ctx.lineWidth = lw * 0.35; path(); ctx.stroke();
      const seg = per * 0.12; ctx.setLineDash([seg, per - seg]); ctx.lineDashOffset = -t * per;
      [[lw * 6, 0.15], [lw * 2.5, 0.5], [lw * 1.1, 1]].forEach(([wd, a]) => { ctx.strokeStyle = rgba(p.color2, a); ctx.lineWidth = wd; path(); ctx.stroke(); });
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    },
  },
  {
    id: "light-leaks", name: "Light Leaks", kind: "overlay",
    desc: "Bocoran cahaya lensa yang lembut dan bergerak pelan. Dipakai dengan mode blend screen/add.",
    why: "Light leak klasik untuk transisi dan nuansa sinematik; elemen overlay yang dicari editor video.",
    params: [
      { key: "palette", label: "Palet", type: "select", options: [["warm", "Hangat"], ["sunset", "Senja"], ["cool", "Dingin"], ["rainbow", "Pelangi"]], def: "warm" },
      { key: "intensity", label: "Intensitas", type: "range", min: 0.3, max: 1, step: 0.05, def: 0.8 },
      { key: "blobs", label: "Jumlah cahaya", type: "range", min: 3, max: 8, step: 1, def: 5 },
      { key: "loops", label: "Kecepatan", type: "range", min: 1, max: 2, step: 1, def: 1 },
    ],
    meta: { title: "Light leaks overlay warm lens flare transition seamless loop", keywords: "light leak, light leaks, lens flare, flare, film burn, bokeh, warm light, sunlight, glow, transition, cinematic, analog, vintage, orange, golden hour, soft light, dreamy, leak, film effect" },
    draw(ctx, S) {
      const { W, H, p, t, seed } = S, R = rng(seed + 5);
      const PAL = { warm: ["#ff7a1a", "#ffb02e", "#ff4d2e", "#ffd36b"], sunset: ["#ff3d6e", "#ff8a3d", "#c04dff", "#ffcf5c"], cool: ["#2e9bff", "#4df0ff", "#7a5cff", "#bfe8ff"], rainbow: ["#ff3d3d", "#ffd23d", "#3dff8a", "#3d9bff", "#c63dff"] }[p.palette] || [];
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < p.blobs; i++) {
        const bx = 0.1 + R() * 0.8, by = 0.1 + R() * 0.8, ax = 0.15 + R() * 0.25, ay = 0.1 + R() * 0.2, ph = R(), l = p.loops * (1 + Math.floor(R() * 2)), rad = Math.max(W, H) * (0.25 + R() * 0.3);
        const cx = W * (bx + ax * Math.cos(TAU * (l * t + ph))), cy = H * (by + ay * Math.sin(TAU * (l * t + ph))), br = p.intensity * (0.6 + 0.4 * Math.sin(TAU * (t + ph)));
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad), c = PAL[i % PAL.length];
        g.addColorStop(0, rgba(c, 0.75 * br)); g.addColorStop(0.45, rgba(c, 0.28 * br)); g.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      ctx.globalCompositeOperation = "source-over";
    },
  },
  {
    id: "energy-burst", name: "Cartoon Energy Burst", kind: "overlay",
    desc: "Ledakan energi gaya kartun: sinar, gelombang kejut dan percikan. Beberapa ledakan bergantian dalam satu klip.",
    why: "Paket efek kartun/energi dengan alpha adalah video motion terlaris di sampel (21–58 dl/bln).",
    params: [
      { key: "color", label: "Warna 1", type: "color", def: "#ffd400" },
      { key: "color2", label: "Warna 2", type: "color", def: "#ff5a1f" },
      { key: "bursts", label: "Ledakan per klip", type: "range", min: 1, max: 6, step: 1, def: 3 },
      { key: "rays", label: "Sinar", type: "range", min: 8, max: 28, step: 1, def: 16 },
      { key: "size", label: "Ukuran", type: "range", min: 0.5, max: 1.4, step: 0.05, def: 1 },
    ],
    meta: { title: "Cartoon energy burst explosion fx with shockwave on black", keywords: "explosion, burst, energy, cartoon, fx, comic, blast, shockwave, impact, flash, sparks, action, anime, 2d, hand drawn, dynamic, power, boom, fire" },
    draw(ctx, S) {
      const { W, H, k, p, t, seed } = S, b = Math.max(1, Math.round(p.bursts)), i = Math.min(b - 1, Math.floor(t * b)), u = t * b - i, R = rng(seed * 13 + i * 7);
      const cx = W * (0.3 + R() * 0.4), cy = H * (0.3 + R() * 0.4), Rm = Math.min(W, H) * 0.42 * p.size, rot = R() * TAU, c1 = i % 2 ? p.color2 : p.color, c2 = i % 2 ? p.color : p.color2;
      const fade = 1 - clamp((u - 0.55) / 0.4);
      if (u < 0.14) { ctx.fillStyle = rgba("#ffffff", 1 - u / 0.14); ctx.beginPath(); ctx.arc(cx, cy, Rm * (0.25 + u * 2), 0, TAU); ctx.fill(); }
      const r0 = Rm * (0.12 + 0.75 * easeOut(clamp((u - 0.15) / 0.6))), r1 = Rm * (0.3 + 0.7 * easeOut(u * 1.6));
      if (r1 > r0) for (let j = 0; j < p.rays; j++) { const a = rot + j * TAU / p.rays + (R() - 0.5) * 0.15, wdt = (TAU / p.rays) * (0.18 + R() * 0.12), len = r1 * (0.75 + R() * 0.35);
        ctx.fillStyle = rgba(j % 2 ? c1 : c2, fade); ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a - wdt) * r0, cy + Math.sin(a - wdt) * r0); ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); ctx.lineTo(cx + Math.cos(a + wdt) * r0, cy + Math.sin(a + wdt) * r0); ctx.closePath(); ctx.fill(); }
      const ring = Rm * 1.15 * easeOut(u); ctx.strokeStyle = rgba(c1, (1 - u) * 0.9); ctx.lineWidth = 18 * k * (1 - u) + 1; ctx.beginPath(); ctx.arc(cx, cy, ring, 0, TAU); ctx.stroke();
      for (let j = 0; j < 12; j++) { const a = R() * TAU, d = Rm * (0.5 + R() * 0.9) * easeOut(u), s = (6 + R() * 10) * k * (1 - u * 0.7), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        ctx.fillStyle = rgba(j % 3 ? c1 : "#ffffff", fade); ctx.beginPath(); ctx.moveTo(x, y - s * 1.6); ctx.lineTo(x + s * 0.5, y); ctx.lineTo(x, y + s * 1.6); ctx.lineTo(x - s * 0.5, y); ctx.closePath(); ctx.fill(); }
    },
  },
  {
    id: "stop-motion-grunge", name: "Stop Motion Grunge", kind: "overlay",
    desc: "Tekstur grunge yang berganti pose 6–12 kali per detik ala stop motion, dengan noda tepi, bercak dan goresan.",
    why: "Overlay grunge gaya stop motion: aset baru (13–17 bln) masih laku ±13 dl/bln.",
    params: [
      { key: "color", label: "Warna", type: "color", def: "#ffffff" },
      { key: "rate", label: "Pose per detik", type: "select", options: [["6", "6"], ["8", "8"], ["12", "12"]], def: "8" },
      { key: "density", label: "Kepadatan", type: "range", min: 0.2, max: 1, step: 0.05, def: 0.6 },
      { key: "style", label: "Gaya", type: "select", options: [["stains", "Noda"], ["halftone", "Halftone"]], def: "stains" },
    ],
    meta: { title: "Stop motion grunge texture overlay animated distressed frame", keywords: "stop motion, grunge, texture, overlay, distressed, dirty, stains, halftone, rough, edges, vignette, punk, retro, handmade, paper, ink, splatter, worn, collage" },
    draw(ctx, S) {
      const { W, H, k, p, frame, frames, fps, seed } = S, P = Math.max(1, Math.round(frames * Number(p.rate) / fps)), pose = Math.floor(frame * P / frames), R = rng(seed * 101 + pose * 7717);
      ctx.fillStyle = p.color; ctx.strokeStyle = p.color;
      const edge = () => { const s = R() * 4, v = R(); return s < 1 ? [v * W, Math.pow(R(), 2) * H * 0.2] : s < 2 ? [v * W, H - Math.pow(R(), 2) * H * 0.2] : s < 3 ? [Math.pow(R(), 2) * W * 0.15, v * H] : [W - Math.pow(R(), 2) * W * 0.15, v * H]; };
      if (p.style === "halftone") {
        const cell = 22 * k, ph = R() * 10, sc = 0.004 / k;
        for (let y = cell / 2; y < H; y += cell) for (let x = cell / 2; x < W; x += cell) { const e = Math.min(x, W - x, y, H - y) / (Math.min(W, H) * 0.5);
          const v = clamp((1 - e * 1.6) * p.density * 1.4 + 0.25 * Math.sin(x * sc + ph) * Math.cos(y * sc * 1.3 - ph) + (R() - 0.5) * 0.25);
          if (v > 0.05) { ctx.beginPath(); ctx.arc(x, y, cell * 0.5 * Math.sqrt(v), 0, TAU); ctx.fill(); } }
      } else {
        const n = Math.round(320 * p.density);
        for (let i = 0; i < n; i++) { const [x, y] = edge(), r = (3 + R() * R() * 45) * k; ctx.globalAlpha = 0.5 + R() * 0.5; ctx.beginPath();
          for (let j = 0; j < 14; j++) { const a = j * TAU / 14, rr = r * (0.72 + R() * 0.5); j ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + rr, y); } ctx.closePath(); ctx.fill(); }
        for (let i = 0; i < 500 * p.density; i++) { ctx.globalAlpha = 0.4 + R() * 0.6; ctx.beginPath(); ctx.arc(R() * W, R() * H, (0.8 + R() * 2.5) * k, 0, TAU); ctx.fill(); }
      }
      ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5 * k;
      for (let i = 0; i < 6 * p.density; i++) { const x = R() * W, y = R() * H, l = (80 + R() * 300) * k, a = (R() - 0.5) * 0.6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke(); }
      ctx.globalAlpha = 1;
    },
  },
  {
    id: "fog-smoke", name: "Fog & Smoke", kind: "overlay",
    desc: "Kabut/asap lembut yang bergerak ke samping dalam dua lapis kecepatan. Loop mulus.",
    why: "Overlay kabut/asap putih di latar hitam: aset baru 2026 sudah laku (±8 dl/bln).",
    params: [
      { key: "color", label: "Warna", type: "color", def: "#ffffff" },
      { key: "density", label: "Ketebalan", type: "range", min: 0.2, max: 1, step: 0.05, def: 0.6 },
      { key: "dir", label: "Arah", type: "select", options: [["right", "Ke kanan"], ["left", "Ke kiri"]], def: "right" },
      { key: "height", label: "Posisi", type: "select", options: [["low", "Bawah"], ["full", "Penuh"]], def: "low" },
    ],
    meta: { title: "White fog and smoke overlay drifting seamless loop on black", keywords: "fog, smoke, mist, haze, cloud, steam, atmosphere, mysterious, spooky, ground fog, white smoke, vapor, gas, drifting, soft, dreamy, horror, halloween, magic" },
    draw(ctx, S) {
      const { W, H, p, t, seed, cache } = S, dir = p.dir === "left" ? -1 : 1;
      if (!cache.puffs) { const R = rng(seed + 3); cache.puffs = Array.from({ length: 26 }, (_, i) => ({ x: R(), y: R(), r: 0.12 + R() * 0.22, ph: R(), layer: i % 2 })); }
      for (const q of cache.puffs) {
        const rad = Math.max(W, H) * q.r, sp = q.layer ? 2 : 1, x = frac(q.x + dir * sp * t) * (W + 2 * rad) - rad;
        const y = p.height === "low" ? H * (0.55 + q.y * 0.5) : H * (0.05 + q.y * 0.95), a = p.density * (0.13 + 0.06 * Math.sin(TAU * (t + q.ph))) * (q.layer ? 0.8 : 1);
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, rgba(p.color, a)); g.addColorStop(0.5, rgba(p.color, a * 0.5)); g.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
      }
    },
  },
  {
    id: "doodle-marker", name: "Animated Doodles", kind: "overlay",
    desc: "Elemen coretan tangan yang tergambar sendiri: lingkaran, garis bawah, panah, bintang, hati, centang. Muncul lalu hilang.",
    why: "Paket doodle/scribble animasi dengan alpha laku ±5 dl/bln; elemen editing yang selalu dicari.",
    params: [
      { key: "color", label: "Warna", type: "color", def: "#ffffff" },
      { key: "width", label: "Tebal", type: "range", min: 3, max: 16, step: 1, def: 8 },
      { key: "jitter", label: "Goyang tangan", type: "range", min: 0, max: 1, step: 0.05, def: 0.5 },
    ],
    meta: { title: "Animated hand drawn doodle elements scribbles arrows and stars", keywords: "doodle, hand drawn, scribble, marker, sketch, arrow, circle, underline, star, heart, check mark, highlight, annotation, pen, chalk, handwritten, drawing, line art, elements" },
    draw(ctx, S) {
      const { W, H, k, p, t, seed, cache } = S;
      if (!cache.shapes) {
        const R = rng(seed + 11), J = () => (R() - 0.5) * 0.06 * p.jitter, pts = [];
        const circle = () => { for (let i = 0; i <= 70; i++) { const a = -0.3 + i / 70 * TAU * 1.12; pts.push([0.5 + 0.44 * Math.cos(a) + J(), 0.5 + 0.34 * Math.sin(a) + J()]); } };
        const S1 = [];
        S1.push(() => { circle(); });
        S1.push(() => { for (let i = 0; i <= 40; i++) pts.push([0.05 + i / 40 * 0.9, 0.55 + Math.sin(i / 40 * TAU * 2) * 0.05 + J()]); for (let i = 0; i <= 30; i++) pts.push([0.9 - i / 30 * 0.75, 0.7 + J() * 0.5]); });
        S1.push(() => { for (let i = 0; i <= 30; i++) { const u = i / 30; pts.push([0.08 + u * 0.8, 0.75 - Math.sin(u * Math.PI) * 0.35 + J()]); } pts.push([0.88, 0.75], [0.62, 0.68], [0.88, 0.75], [0.82, 0.5]); });
        S1.push(() => { for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i * TAU * 2 / 5, r = 0.42; pts.push([0.5 + Math.cos(a) * r + J(), 0.52 + Math.sin(a) * r + J()]); } });
        S1.push(() => { for (let i = 0; i <= 60; i++) { const a = i / 60 * TAU, x = 16 * Math.pow(Math.sin(a), 3), y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a); pts.push([0.5 + x / 38 + J(), 0.46 - y / 38 + J()]); } });
        S1.push(() => { pts.push([0.15, 0.5], [0.4, 0.75], [0.88, 0.2]); });
        cache.shapes = S1.map((f) => { pts.length = 0; f(); const ps = pts.slice(); let L = 0; const acc = [0]; for (let i = 1; i < ps.length; i++) { L += Math.hypot(ps[i][0] - ps[i - 1][0], ps[i][1] - ps[i - 1][1]); acc.push(L); } return { ps, acc, L }; });
      }
      const cols = 3, rows = 2, cw = W / cols, ch = H / rows, sz = Math.min(cw, ch) * 0.72;
      ctx.strokeStyle = p.color; ctx.lineWidth = p.width * k; ctx.lineCap = "round"; ctx.lineJoin = "round";
      cache.shapes.forEach((sh, i) => {
        const u = frac(t - i * 0.06), a = clamp(u / 0.4), b = clamp((u - 0.72) / 0.22); if (a <= b) return;
        const ox = (i % cols) * cw + (cw - sz) / 2, oy = Math.floor(i / cols) * ch + (ch - sz) / 2, from = sh.L * easeOut(b), to = sh.L * easeOut(a);
        ctx.beginPath(); let started = false;
        for (let j = 1; j < sh.ps.length; j++) { const s0 = sh.acc[j - 1], s1 = sh.acc[j]; if (s1 < from || s0 > to) continue;
          const lerp = (s) => { const f = (s - s0) / Math.max(1e-9, s1 - s0); return [ox + sz * (sh.ps[j - 1][0] + (sh.ps[j][0] - sh.ps[j - 1][0]) * f), oy + sz * (sh.ps[j - 1][1] + (sh.ps[j][1] - sh.ps[j - 1][1]) * f)]; };
          const A = lerp(Math.max(s0, from)), B = lerp(Math.min(s1, to)); if (!started) { ctx.moveTo(A[0], A[1]); started = true; } ctx.lineTo(B[0], B[1]); }
        ctx.stroke();
      });
    },
  },
];

export const RESOLUTIONS = { "4k": [3840, 2160], hd: [1920, 1080], vertical: [1080, 1920], square: [1080, 1080] };
export const FPS = [24, 25, 30];

export function getTemplate(id) { return TEMPLATES.find((x) => x.id === id) ?? null; }

// Fill in defaults and clamp every value, so a spec from MCP or a URL can never break a render.
// Template params: fill defaults and clamp to the template's ranges.
function templateParams(tpl, src = {}) {
  const p = {};
  for (const d of tpl.params) { const v = src?.[d.key];
    if (d.type === "range") { const n = Number(v); p[d.key] = Number.isFinite(n) ? clamp(n, d.min, d.max) : d.def; }
    else if (d.type === "color") p[d.key] = /^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toLowerCase() : d.def;
    else p[d.key] = d.options.some(([o]) => o === String(v)) ? String(v) : d.def; }
  return p;
}
// Free params of a custom scene: plain JSON values only (numbers, short strings, booleans, small arrays).
function freeParams(src = {}) {
  const p = {}, ok = (v) => (typeof v === "number" && Number.isFinite(v)) || typeof v === "boolean" || (typeof v === "string" && v.length <= 200);
  for (const [k, v] of Object.entries(src && typeof src === "object" ? src : {}).slice(0, 40)) {
    if (!/^[A-Za-z0-9_]{1,30}$/.test(k)) continue;
    if (ok(v)) p[k] = v; else if (Array.isArray(v) && v.length <= 50 && v.every(ok)) p[k] = v;
  }
  return p;
}
export const MAX_CODE = 30000;

// Fill in defaults and clamp every value, so a spec from MCP or a URL can never break a render.
// A spec with `code` is a custom scene written for one research brief (template "custom").
export function normalizeSpec(spec = {}) {
  // HTML animation (Studio Motion "Editor HTML"): rendered only in the browser, frame by frame (lib/htmlMotion.mjs).
  if (typeof spec.html === "string" && spec.html.trim()) {
    return { v: MOTION_VERSION, template: "html", html: spec.html.slice(0, 400000), aspect: ["16:9", "9:16", "1:1"].includes(spec.aspect) ? spec.aspect : "16:9",
      resolution: RESOLUTIONS[spec.resolution] ? spec.resolution : "hd", fps: [24, 25, 30, 60].includes(Number(spec.fps)) ? Number(spec.fps) : 30,
      duration: clamp(Math.round(Number(spec.duration) || 10), 5, 60), seed: 1, bg: "#000000", params: {} };
  }
  const custom = typeof spec.code === "string" && spec.code.trim().length > 0;
  const tpl = custom ? null : (getTemplate(spec.template) ?? TEMPLATES[0]);
  const res = RESOLUTIONS[spec.resolution] ? spec.resolution : "4k", fps = FPS.includes(Number(spec.fps)) ? Number(spec.fps) : 30;
  const duration = clamp(Math.round(Number(spec.duration) || 10), 5, 60), seed = Math.abs(Math.round(Number(spec.seed))) || 1;
  const bg = /^#[0-9a-f]{6}$/i.test(String(spec.bg)) ? String(spec.bg).toLowerCase() : "#000000";
  const base = { v: MOTION_VERSION, resolution: res, fps, duration, seed, bg };
  if (custom) return { ...base, template: "custom", params: freeParams(spec.params), code: spec.code.slice(0, MAX_CODE) };
  return { ...base, template: tpl.id, params: templateParams(tpl, spec.params) };
}

/* ---------- custom scenes ---------- */
// A scene is the body of function (ctx, S, H) { ... } drawing one frame on a transparent layer.
// S: { W, H, k (= min(W,H)/1080), t (0→1 over the clip, loop), frame, frames, fps, p (params), seed, cache (per render) }.
// H: helpers below + H.part(id, ctx, S, params) to reuse a template as an ingredient (its own cache, ctx saved/restored).
export const SCENE_API = {
  signature: "Isi fungsi (ctx, S, H) yang menggambar SATU frame di layer transparan; jangan menggambar latar (latar ditambahkan mesin). Semua gerak harus periodik di S.t (0→1) agar loop mulus; acak per frame pakai H.rng(S.seed + S.frame). Simpan data mahal di S.cache.",
  S: "W, H, k (skala = min(W,H)/1080), t, frame, frames, fps, p (params), seed, cache",
  H: "TAU, rng(seed)→()=>0..1, frac, clamp(x,a,b), lerp(a,b,u), easeOut(u), easeInOut(u), pulse(t,n,phase), rgba(hex,a), hex2rgb(hex), noise(seed,scale)→(x,y)=>0..1, part(id, ctx, S, params)",
  parts: "id template mana pun dari daftar template (mis. 'film-grain', 'gold-particles', 'neon-frame', 'light-leaks', 'energy-burst', 'stop-motion-grunge', 'fog-smoke', 'doodle-marker'); params = parameter template itu.",
  example: "H.part('light-leaks', ctx, S, { palette: S.p.palette || 'warm', intensity: 0.7 });\nconst R = H.rng(S.seed);\nfor (let i = 0; i < 40; i++) { const x = R() * S.W, y = H.frac(R() + S.t) * S.H, r = (4 + R() * 10) * S.k;\n  ctx.fillStyle = H.rgba(S.p.color || '#ffd400', 0.5 + 0.5 * Math.sin(H.TAU * (S.t * 2 + R())));\n  ctx.beginPath(); ctx.arc(x, y, r, 0, H.TAU); ctx.fill(); }",
};

function valueNoise(seed, sc) {
  const hash = (i, j) => { let h = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const sm = (u) => u * u * (3 - 2 * u);
  return (x, y) => { x /= sc; y /= sc; const i = Math.floor(x), j = Math.floor(y), u = sm(x - i), v = sm(y - j), a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
}
function makeHelpers(state) {
  const parts = (state.parts ??= {});
  return {
    TAU, rng, frac, clamp, easeOut, lerp: (a, b, u) => a + (b - a) * u, easeInOut: (u) => (u = clamp(u), u * u * (3 - 2 * u)),
    pulse: (t, n = 1, ph = 0) => 0.5 + 0.5 * Math.sin(TAU * (n * t + ph)), rgba, hex2rgb, noise: valueNoise,
    part(id, ctx, S, params = {}, ns) {
      const tpl = getTemplate(id); if (!tpl) throw new Error(`Bahan "${id}" tidak ada.`);
      ctx.save(); try { tpl.draw(ctx, { ...S, p: templateParams(tpl, params), cache: (parts[ns || id] ??= {}) }); } finally { ctx.restore(); }
    },
  };
}
const compiled = new Map();
export function compileScene(code) {
  if (compiled.has(code)) return compiled.get(code);
  const fn = new Function("ctx", "S", "H", `"use strict";\n${code}`); // eslint-disable-line no-new-func
  compiled.set(code, fn); return fn;
}

// Draw one frame of a normalized spec onto a transparent layer context. state.cache persists across frames of one render.
export function drawFrame(ctx, spec, frame, W, H, state) {
  const frames = spec.fps * spec.duration, f = frame % frames;
  const S = { W, H, k: Math.min(W, H) / 1080, p: spec.params, t: f / frames, frame: f, frames, fps: spec.fps, seed: spec.seed, mk: state.mk, cache: (state.cache ??= {}) };
  ctx.save(); ctx.clearRect(0, 0, W, H);
  try {
    if (spec.template === "custom") compileScene(spec.code)(ctx, S, (state.H ??= makeHelpers(state)));
    else getTemplate(spec.template).draw(ctx, S);
  } finally { ctx.restore(); }
}

// Default stock metadata for a spec (title ≤70 chars, no commas; 40 lower-case keywords).
export function defaultMeta(spec, extraKeywords = "") {
  const tpl = getTemplate(spec.template), kw = [];
  for (const x of `${extraKeywords}, ${tpl?.meta.keywords ?? ""}, ${VIDEO_KW}`.split(",")) { const s = x.trim().toLowerCase(); if (s && /^[a-z0-9 -]+$/.test(s) && !kw.includes(s)) kw.push(s); }
  return { title: tpl?.meta.title ?? "", keywords: kw.slice(0, 40) };
}
