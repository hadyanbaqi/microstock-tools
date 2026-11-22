// Default Studio Motion scene: the StockSells heat wave. A grid of rounded cells lights up in the app's one-hue heatmap ramp
// (graphite → orange) as waves leave the centre; the "Dua blok S" mark pulses with each wave. Everything is driven by
// window.STUDIO.u() with whole-number frequencies, so the loop is seamless at any duration, size, FPS or background.
// No backticks or template placeholders inside: the page is stored as a plain template literal.
export const DEFAULT_NAME = "stocksells-heat";

export const DEFAULT_HTML = String.raw`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8" />
<title>StockSells heat wave</title>
<style>
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
  canvas { display: block; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
(function () {
  // Ikut pengaturan Studio (ukuran, durasi loop, latar). Semua gerak memakai u (0..1) berfrekuensi bulat, jadi loop mulus.
  var S = window.STUDIO || { width: 1920, height: 1080, duration: 10, fps: 30, background: "code", transparent: false,
    u: function (ms) { return ((ms == null ? performance.now() : ms) / 1000 / 10) % 1; } };
  var W = S.width, H = S.height, CX = W / 2, CY = H / 2, U = Math.min(W, H), TAU = Math.PI * 2;

  // ---- Atur di sini ----
  var BRAND = ["Stock", "Sells"];   // teks di bawah logo
  var SHOW_TEXT = true;             // false = hanya logo
  var WAVES = 2;                    // jumlah gelombang per loop (bilangan bulat)
  var ACCENT = [255, 106, 43];

  var canvas = document.getElementById("c");
  canvas.width = W; canvas.height = H;
  var ctx = canvas.getContext("2d");

  var seed = 20261117;
  function rand() {
    seed = (seed + 0x6d2b79f5) | 0;
    var x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var smooth = function (a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // Heatmap ramp: graphite → orange (same hue family as the StockSells dashboard)
  var STOPS = [[0, 26, 26, 30], [0.3, 58, 36, 26], [0.55, 138, 58, 20], [0.8, 255, 106, 43], [1, 255, 163, 107]];
  function ramp(v) {
    for (var i = 1; i < STOPS.length; i++) {
      if (v <= STOPS[i][0]) {
        var a = STOPS[i - 1], b = STOPS[i], t = (v - a[0]) / (b[0] - a[0]);
        return "rgb(" + Math.round(a[1] + (b[1] - a[1]) * t) + "," + Math.round(a[2] + (b[2] - a[2]) * t) + "," + Math.round(a[3] + (b[3] - a[3]) * t) + ")";
      }
    }
    return "rgb(255,163,107)";
  }

  // Grid of cells, centred; positions and noise are made once
  var cell = U / 19, cols = Math.ceil(W / cell) + 1, rows = Math.ceil(H / cell) + 1;
  var gx = CX - (cols * cell) / 2 + cell / 2, gy = CY - (rows * cell) / 2 + cell / 2;
  var half = Math.hypot(W, H) / 2, cells = [];
  for (var j = 0; j < rows; j++) {
    for (var i = 0; i < cols; i++) {
      var x = gx + i * cell, y = gy + j * cell, d = Math.hypot(x - CX, y - CY);
      cells.push({ x: x, y: y, n: rand(), dn: d / half, r: Math.hypot((x - CX) / 1.25, y - (CY + U * 0.03)) / U });
    }
  }

  // StockSells mark ("Dua blok S")
  var TOP = new Path2D("M24 8 H52 V30 H24 A11 11 0 0 1 24 8 Z");
  var BOTTOM = new Path2D("M12 34 H40 A11 11 0 0 1 40 56 H12 Z");
  var LOGO = U * 0.21, LOGO_Y = CY - U * 0.05;

  function draw() {
    var u = S.u();
    ctx.clearRect(0, 0, W, H);
    if (S.background === "code") { ctx.fillStyle = "#0a0a0b"; ctx.fillRect(0, 0, W, H); }
    var beat = Math.cos(TAU * WAVES * u);          // 1 at the moment a wave leaves the centre
    var pulse = Math.pow(Math.max(0, beat), 6);

    for (var k = 0; k < cells.length; k++) {
      var c = cells[k];
      var wave = 0.5 + 0.5 * Math.cos(TAU * (c.dn * 3 - WAVES * u));
      var heat = Math.pow(wave, 4) * (0.65 + 0.5 * c.n);
      heat += 0.18 * Math.max(0, Math.sin(TAU * (3 * u + c.n))) * (0.3 + wave);   // soft sparkle
      heat = clamp(heat, 0, 1);
      var a = smooth(0.2, 0.31, c.r) * (0.22 + 0.78 * (1 - smooth(0.5, 1.05, c.dn)));
      if (a < 0.01) continue;
      var s = cell * 0.8 * (0.85 + 0.2 * heat);
      ctx.globalAlpha = a;
      ctx.fillStyle = ramp(heat);
      ctx.beginPath();
      ctx.roundRect(c.x - s / 2, c.y - s / 2, s, s, s * 0.28);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Glow behind the mark, in step with the waves
    var g = ctx.createRadialGradient(CX, LOGO_Y, 0, CX, LOGO_Y, U * 0.42);
    var ga = 0.05 + 0.1 * pulse;
    g.addColorStop(0, "rgba(" + ACCENT[0] + "," + ACCENT[1] + "," + ACCENT[2] + "," + ga + ")");
    g.addColorStop(1, "rgba(" + ACCENT[0] + "," + ACCENT[1] + "," + ACCENT[2] + ",0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Mark: the two blocks drift against each other, the whole mark pops on every wave
    var sc = (LOGO / 64) * (1 + 0.035 * pulse + 0.012 * Math.sin(TAU * u));
    var drift = Math.sin(TAU * u) * 1.8;
    ctx.save();
    ctx.translate(CX, LOGO_Y);
    ctx.scale(sc, sc);
    ctx.translate(-32, -32);
    ctx.shadowColor = "rgba(255,106,43,0.45)";
    ctx.shadowBlur = U * 0.05;
    ctx.fillStyle = "#ff6a2b";
    ctx.save(); ctx.translate(drift, 0); ctx.fill(TOP); ctx.restore();
    ctx.fillStyle = "#ffa36b";
    ctx.save(); ctx.translate(-drift, 0); ctx.fill(BOTTOM); ctx.restore();
    ctx.restore();

    if (SHOW_TEXT) {
      ctx.font = "650 " + Math.round(U * 0.052) + 'px Geist, Inter, "Segoe UI", system-ui, sans-serif';
      ctx.textBaseline = "alphabetic";
      var w1 = ctx.measureText(BRAND[0]).width, w2 = ctx.measureText(BRAND[1]).width;
      var x0 = CX - (w1 + w2) / 2, ty = LOGO_Y + LOGO * 0.5 + U * 0.095;
      ctx.textAlign = "left";
      ctx.fillStyle = "#f5f5f4"; ctx.fillText(BRAND[0], x0, ty);
      ctx.fillStyle = "#ff6a2b"; ctx.fillText(BRAND[1], x0 + w1, ty);
    }
  }

  (function tick() { draw(); requestAnimationFrame(tick); })();
})();
</script>
</body>
</html>
`;
