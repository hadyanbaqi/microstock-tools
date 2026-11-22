// Default Studio Motion scene: the StockSells heat wave, written as a bare script (the Studio supplies the page, canvas,
// loop and helpers: see toHtml in lib/htmlMotion.mjs). A grid of rounded cells lights up in the app's one-hue heatmap ramp
// (graphite → orange) as waves leave the centre; the "Dua blok S" mark pulses with each wave. Everything is driven by u
// with whole-number frequencies, so the loop is seamless at any duration, size, FPS or background.
// No backticks or template placeholders inside: the script is stored as a plain template literal.
export const DEFAULT_NAME = "stocksells-heat";

export const DEFAULT_CODE = String.raw`// StockSells heat wave: gelombang heatmap + logo. Studio menyediakan ctx, W, H, CX, CY, UNIT, TWO_PI, S, rand, clamp, smooth.

// ---- Atur di sini ----
const BRAND = ["Stock", "Sells"];   // teks di bawah logo
const SHOW_TEXT = true;             // false = hanya logo
const WAVES = 2;                    // jumlah gelombang per loop (bilangan bulat)

// Heatmap ramp: graphite → orange (satu keluarga warna dengan dashboard StockSells)
const STOPS = [[0, 26, 26, 30], [0.3, 58, 36, 26], [0.55, 138, 58, 20], [0.8, 255, 106, 43], [1, 255, 163, 107]];
function ramp(v) {
  for (let i = 1; i < STOPS.length; i++) {
    if (v <= STOPS[i][0]) {
      const a = STOPS[i - 1], b = STOPS[i], t = (v - a[0]) / (b[0] - a[0]);
      return "rgb(" + Math.round(lerp(a[1], b[1], t)) + "," + Math.round(lerp(a[2], b[2], t)) + "," + Math.round(lerp(a[3], b[3], t)) + ")";
    }
  }
  return "rgb(255,163,107)";
}

// Grid sel di tengah layar, dibuat sekali
const cell = UNIT / 19, cols = Math.ceil(W / cell) + 1, rows = Math.ceil(H / cell) + 1;
const gx = CX - (cols * cell) / 2 + cell / 2, gy = CY - (rows * cell) / 2 + cell / 2;
const half = Math.hypot(W, H) / 2, cells = [];
for (let j = 0; j < rows; j++) {
  for (let i = 0; i < cols; i++) {
    const x = gx + i * cell, y = gy + j * cell;
    cells.push({ x, y, n: rand(), dn: Math.hypot(x - CX, y - CY) / half, r: Math.hypot((x - CX) / 1.25, y - (CY + UNIT * 0.03)) / UNIT });
  }
}

// Logo StockSells ("Dua blok S")
const TOP = new Path2D("M24 8 H52 V30 H24 A11 11 0 0 1 24 8 Z");
const BOTTOM = new Path2D("M12 34 H40 A11 11 0 0 1 40 56 H12 Z");
const LOGO = UNIT * 0.21, LOGO_Y = CY - UNIT * 0.05;
const halo = glow(255, 106, 43);

function render(u) {
  if (S.background === "code") { ctx.fillStyle = "#0a0a0b"; ctx.fillRect(0, 0, W, H); }
  const beat = Math.cos(TWO_PI * WAVES * u);          // 1 saat gelombang keluar dari tengah
  const pulse = Math.pow(Math.max(0, beat), 6);

  for (let k = 0; k < cells.length; k++) {
    const c = cells[k];
    const wave = 0.5 + 0.5 * Math.cos(TWO_PI * (c.dn * 3 - WAVES * u));
    let heat = Math.pow(wave, 4) * (0.65 + 0.5 * c.n);
    heat += 0.18 * Math.max(0, Math.sin(TWO_PI * (3 * u + c.n))) * (0.3 + wave);   // kilau halus
    heat = clamp(heat, 0, 1);
    const a = smooth(0.2, 0.31, c.r) * (0.22 + 0.78 * (1 - smooth(0.5, 1.05, c.dn)));
    if (a < 0.01) continue;
    const s = cell * 0.8 * (0.85 + 0.2 * heat);
    ctx.globalAlpha = a;
    ctx.fillStyle = ramp(heat);
    ctx.beginPath();
    ctx.roundRect(c.x - s / 2, c.y - s / 2, s, s, s * 0.28);
    ctx.fill();
  }

  // Cahaya di belakang logo, searah gelombang
  ctx.globalAlpha = 0.35 + 0.65 * pulse;
  const hs = UNIT * 0.9;
  ctx.drawImage(halo, CX - hs / 2, LOGO_Y - hs / 2, hs, hs);
  ctx.globalAlpha = 1;

  // Logo: dua blok bergeser berlawanan, membesar sedikit di setiap gelombang
  const sc = (LOGO / 64) * (1 + 0.035 * pulse + 0.012 * Math.sin(TWO_PI * u));
  const drift = Math.sin(TWO_PI * u) * 1.8;
  ctx.setTransform(sc, 0, 0, sc, CX - 32 * sc, LOGO_Y - 32 * sc);
  ctx.fillStyle = "#ff6a2b";
  ctx.translate(drift, 0); ctx.fill(TOP); ctx.translate(-drift, 0);
  ctx.fillStyle = "#ffa36b";
  ctx.translate(-drift, 0); ctx.fill(BOTTOM);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (SHOW_TEXT) {
    ctx.font = "650 " + Math.round(UNIT * 0.052) + 'px Geist, Inter, "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    const w1 = ctx.measureText(BRAND[0]).width, w2 = ctx.measureText(BRAND[1]).width;
    const x0 = CX - (w1 + w2) / 2, ty = LOGO_Y + LOGO * 0.5 + UNIT * 0.095;
    ctx.fillStyle = "#f5f5f4"; ctx.fillText(BRAND[0], x0, ty);
    ctx.fillStyle = "#ff6a2b"; ctx.fillText(BRAND[1], x0 + w1, ty);
  }
}
`;
