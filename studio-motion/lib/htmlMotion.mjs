// Studio Motion "Editor HTML": render any HTML/CSS/SVG/JS animation to an exact, frame-by-frame video in the browser.
// The page runs in a sandboxed iframe (/motion-preview/html, own CSP, no network). RUNTIME is injected before the
// page's own scripts and replaces time: in "frame" mode requestAnimationFrame, performance.now, Date.now, setTimeout
// and setInterval follow a virtual clock, and every CSS/Web animation is paused and seeked to that time. snapshot()
// freezes the DOM at that instant (animated computed values written as !important rules, canvases as images) and
// serializes it into an SVG <foreignObject> data URL that the parent draws onto the encoder canvas.

export const MAX_HTML = 400000;
export const ASPECTS = { "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080] };
export const OUT_RES = { "720p": 720, "1080p": 1080, "4k": 2160 };

export const RUNTIME = String.raw`(() => {
  const MODE = window.__CVE_MODE || "live";
  const W0 = window.__CVE_W || 1920, H0 = window.__CVE_H || 1080;
  // Studio settings the page can follow (htmlPrompt tells AIs to read them): canvas size, loop length, fps, background.
  const DUR = window.__CVE_DURATION || 10, FPS0 = window.__CVE_FPS || 30, BG = window.__CVE_BG || "code";
  window.STUDIO = Object.freeze({ width: W0, height: H0, duration: DUR, fps: FPS0, background: BG === "alpha" ? "transparent" : BG,
    transparent: BG === "alpha", u: (ms) => { const v = (ms === undefined ? performance.now() : ms) / 1000 / DUR; return v - Math.floor(v); } });
  { const r = document.documentElement; r.style.setProperty("--studio-w", W0 + "px"); r.style.setProperty("--studio-h", H0 + "px");
    r.style.setProperty("--studio-duration", DUR + "s"); if (BG === "alpha") r.classList.add("studio-transparent"); if (BG !== "code") r.classList.add("studio-custom-bg"); }
  let vt = 0, ids = 0, n = 0;
  const realNow = performance.now.bind(performance), realDate = Date.now, base = realDate();
  const frames = new Map(), timers = new Map();
  if (MODE === "frame") {
    performance.now = () => vt;
    Date.now = () => base + vt;
    const RD = Date; window.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(base + vt); } static now() { return base + vt; } };
    window.requestAnimationFrame = (cb) => { const i = ++ids; frames.set(i, cb); return i; };
    window.cancelAnimationFrame = (i) => frames.delete(i);
    window.setTimeout = (cb, ms, ...a) => { const i = ++ids; timers.set(i, { cb, at: vt + (+ms || 0), a }); return i; };
    window.setInterval = (cb, ms, ...a) => { const i = ++ids; timers.set(i, { cb, at: vt + Math.max(1, +ms || 0), every: Math.max(1, +ms || 0), a }); return i; };
    window.clearTimeout = window.clearInterval = (i) => timers.delete(i);
  }
  const err = (m) => parent.postMessage({ cveError: String(m) }, "*");
  addEventListener("error", (e) => err(e.message || "Script error"));
  function seek(ms) {
    vt = ms;
    for (let guard = 0; guard < 1000; guard++) { let due = null, id = 0; for (const [i, t] of timers) if (t.at <= vt && (!due || t.at < due.at)) { due = t; id = i; }
      if (!due) break; if (due.every) due.at += due.every; else timers.delete(id); try { typeof due.cb === "function" ? due.cb(...due.a) : 0; } catch (e) { err(e.message); } }
    const cbs = [...frames.values()]; frames.clear();
    for (const cb of cbs) { try { cb(vt); } catch (e) { err(e.message); } }
    for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = vt; } catch (e) {} }
  }
  const kebab = (p) => p.startsWith("--") ? p : p.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()).replace(/^css-/, "");
  const SKIP = new Set(["offset", "computedOffset", "easing", "composite"]);
  // CSS 3D: the capture draws perspective, rotateX/Y and backface-visibility, but paints the faces of a preserve-3d
  // object in DOM order. Sort them like the browser would: the children of every preserve-3d element get a z-index from
  // their depth (far first), computed from the transforms of the 3D context (offsets, transform-origin, translate/rotate/scale).
  let hosts3d = null, z3 = 0;
  const px = (v) => parseFloat(v) || 0;
  function local3d(el, cs, dx, dy) {
    const o = cs.transformOrigin.split(" ").map(px); let m = new DOMMatrix().translate(dx + o[0], dy + o[1], o[2] || 0);
    if (cs.translate && cs.translate !== "none") { const t = cs.translate.split(" ").map(px); m = m.translate(t[0], t[1] || 0, t[2] || 0); }
    if (cs.rotate && cs.rotate !== "none") { const r = cs.rotate.split(" ");
      m = m.multiply(new DOMMatrix(r.length === 1 ? "rotate(" + r[0] + ")" : r.length === 2 ? "rotate" + r[0].toUpperCase() + "(" + r[1] + ")" : "rotate3d(" + r.join(",") + ")")); }
    if (cs.scale && cs.scale !== "none") { const s = cs.scale.split(" ").map(Number); m = m.scale(s[0], s[1] ?? s[0], s[2] ?? 1); }
    if (cs.transform && cs.transform !== "none") m = m.multiply(new DOMMatrix(cs.transform));
    return m.translate(-o[0], -o[1], -(o[2] || 0));
  }
  const rel = (k, host) => k.offsetParent === host ? [k.offsetLeft, k.offsetTop] : [k.offsetLeft - host.offsetLeft, k.offsetTop - host.offsetTop];
  function chain3d(host) { // host's transform and those of its ancestors inside the same 3D context
    let m = new DOMMatrix(), el = host;
    while (el && el.nodeType === 1) { const cs = getComputedStyle(el), p = el.parentElement;
      m = local3d(el, cs, ...(p ? rel(el, p) : [0, 0])).multiply(m);
      if (!p || getComputedStyle(p).transformStyle !== "preserve-3d") break; el = p; }
    return m;
  }
  function depth3d(rules) {
    if (!hosts3d) hosts3d = [...document.querySelectorAll("*")].filter((el) => getComputedStyle(el).transformStyle === "preserve-3d");
    for (const host of hosts3d) {
      const kids = [...host.children].filter((k) => !/^(SCRIPT|STYLE|TEMPLATE)$/.test(k.tagName)); if (kids.length < 2) continue;
      const A = chain3d(host);
      kids.map((k) => { const cs = getComputedStyle(k), [dx, dy] = rel(k, host);
          const c = A.multiply(local3d(k, cs, dx, dy)).transformPoint(new DOMPoint(k.offsetWidth / 2, k.offsetHeight / 2, 0));
          return { k, z: c.z, pos: cs.position }; })
        .sort((a, b) => a.z - b.z)
        .forEach((x, i) => { let id = x.k.getAttribute("data-cvez"); if (!id) { id = "z" + (++z3); x.k.setAttribute("data-cvez", id); }
          rules.push('[data-cvez="' + id + '"]{z-index:' + (i + 1) + "!important" + (x.pos === "static" ? ";position:relative!important" : "") + "}"); });
    }
  }
  function snapshot(outW, outH) {
    const rules = [];
    try { depth3d(rules); } catch (e) {}
    for (const a of document.getAnimations()) {
      const ef = a.effect, el = ef && ef.target; if (!el || !el.setAttribute) continue;
      let id = el.getAttribute("data-cve"); if (!id) { id = "a" + (++n); el.setAttribute("data-cve", id); }
      const pe = ef.pseudoElement || "", cs = getComputedStyle(el, pe || null), props = new Set();
      for (const k of ef.getKeyframes()) for (const p of Object.keys(k)) if (!SKIP.has(p)) props.add(kebab(p));
      const decl = [...props].map((p) => { const v = cs.getPropertyValue(p); return v ? p + ":" + v + " !important" : ""; }).filter(Boolean).join(";");
      if (decl) rules.push('[data-cve="' + id + '"]' + pe + "{" + decl + "}");
    }
    const live = document.querySelectorAll("canvas"), root = document.documentElement.cloneNode(true);
    root.querySelectorAll("script,noscript").forEach((s) => s.remove());
    root.querySelectorAll("canvas").forEach((c, i) => { const im = document.createElement("img"); try { im.src = live[i].toDataURL("image/png"); } catch (e) {}
      im.setAttribute("style", (c.getAttribute("style") || "") + ";width:" + (live[i].clientWidth || live[i].width) + "px;height:" + (live[i].clientHeight || live[i].height) + "px");
      if (c.className) im.setAttribute("class", c.getAttribute("class")); if (c.id) im.id = c.id; c.replaceWith(im); });
    // form state and scroll are not serialized by default
    const st = document.createElement("style");
    st.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}" + rules.join("");
    (root.querySelector("head") || root).appendChild(st);
    const xhtml = new XMLSerializer().serializeToString(root);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + outW + '" height="' + outH + '" viewBox="0 0 ' + W0 + " " + H0 + '"><foreignObject x="0" y="0" width="' + W0 + '" height="' + H0 + '">' + xhtml + "</foreignObject></svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  // Fast path: when the only thing on screen is one full-frame <canvas> (what htmlPrompt asks for), send its pixels as an
  // ImageBitmap instead of PNG-encoding it into an SVG snapshot. Returns { canvas, bg } or null (then snapshot() is used).
  const clear = (c) => !c || c === "transparent" || /^rgba\(.*,\s*0\)$/.test(c);
  function soloCanvas() {
    const cv = document.querySelectorAll("canvas"); let pick = null;
    for (const c of cv) { const r = c.getBoundingClientRect(); if (r.width * r.height > 0) { if (pick) return null; pick = c; } }
    if (!pick) return null;
    const r = pick.getBoundingClientRect(), cs = getComputedStyle(pick);
    if (Math.abs(r.left) > 1 || Math.abs(r.top) > 1 || Math.abs(r.width - W0) > 1 || Math.abs(r.height - H0) > 1) return null;
    if (cs.transform !== "none" || cs.filter !== "none" || cs.mixBlendMode !== "normal" || +cs.opacity < 1 || cs.visibility !== "visible" || cs.borderStyle !== "none" || cs.objectFit !== "fill") return null;
    const up = new Set(); for (let a = pick.parentElement; a; a = a.parentElement) up.add(a);
    for (const el of document.body ? document.body.querySelectorAll("*") : []) { if (el === pick || up.has(el) || /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(el.tagName)) continue;
      if (pick.contains(el)) continue; const b = el.getBoundingClientRect(); if (b.width * b.height > 0 && getComputedStyle(el).visibility !== "hidden") return null; }
    let bg = "";
    for (const a of up) { const s = getComputedStyle(a); if (s.backgroundImage !== "none" || s.filter !== "none" || +s.opacity < 1 || s.boxShadow !== "none" || s.transform !== "none") return null;
      for (const pe of ["::before", "::after"]) { const c = getComputedStyle(a, pe).content; if (c && c !== "none" && c !== "normal") return null; }
      if (a !== document.documentElement && a !== document.body && !clear(s.backgroundColor)) return null; }
    const hb = getComputedStyle(document.documentElement).backgroundColor, bb = document.body ? getComputedStyle(document.body).backgroundColor : "";
    bg = !clear(hb) ? hb : !clear(bb) ? bb : "";
    return { canvas: pick, bg };
  }
  // Things the frame capture cannot draw: SVG SMIL animation elements. (CSS 3D is drawn: see depth3d.)
  function warnings() { const w = [];
    if (document.querySelector("animate,animateTransform,animateMotion,set")) w.push("smil");
    return w; }
  addEventListener("message", async (e) => {
    const d = e.data; if (e.source !== parent || !d || typeof d !== "object") return;
    // Preview scrubbing (frame mode): jump the virtual clock without capturing.
    // Forward jumps replay the skipped frames (d.dt apart), so scripts that build state frame by frame stay right.
    if (d.cveSeek) { try { if (d.dt > 0 && d.t > vt) for (let x = vt + d.dt, k = 0; x < d.t - 1e-6 && k < 7200; x += d.dt, k++) seek(x); seek(d.t); }
      catch (x) { err(x && x.message || x); } return; }
    if (d.cveCapture) { try { seek(d.t); if (d.fonts !== false && document.fonts) await document.fonts.ready;
        const warn = d.n === 0 ? warnings() : null, solo = d.fast !== false && typeof createImageBitmap === "function" ? soloCanvas() : null;
        if (solo) { let bmp = null; try { bmp = await createImageBitmap(solo.canvas); } catch (x) {}
          if (bmp) { parent.postMessage({ cveFrame: d.n, bmp, bg: solo.bg, warn }, "*", [bmp]); return; } }
        parent.postMessage({ cveFrame: d.n, url: snapshot(d.w, d.h), warn }, "*"); }
      catch (x) { parent.postMessage({ cveFrame: d.n, error: String(x && x.message || x) }, "*"); } }
  });
  addEventListener("load", () => { const a = document.documentElement.getBoundingClientRect(), b = document.body ? document.body.getBoundingClientRect() : a;
    parent.postMessage({ cveLoaded: true, w: Math.round(Math.max(a.width, b.width)), h: Math.round(Math.max(a.height, b.height)) }, "*"); });
})();`;

// Background override for the page: "code" keeps the page's own background, "alpha" makes html/body transparent (the
// render then writes a luma matte), "#rrggbb" paints a solid colour. Appended last so it wins over the page's styles.
export function bgStyle(bg) {
  if (!bg || bg === "code") return "";
  const c = bg === "alpha" ? "transparent" : /^#[0-9a-f]{3,8}$/i.test(bg) ? bg : "transparent";
  return `<style id="cve-bg">html,body{background:${c}!important;background-color:${c}!important;background-image:none!important}</style>`;
}

// Put the runtime before every script of the page (right after <head>, or first thing when there is no head).
// opts: { duration, fps } from the Studio settings, exposed to the page as window.STUDIO and CSS variables.
export function injectRuntime(html, mode, w, h, bg = "code", opts = {}) {
  const g = `window.__CVE_MODE=${JSON.stringify(mode)};window.__CVE_W=${+w || 1920};window.__CVE_H=${+h || 1080};` +
    `window.__CVE_DURATION=${+opts.duration > 0 ? +opts.duration : 10};window.__CVE_FPS=${+opts.fps > 0 ? +opts.fps : 30};window.__CVE_BG=${JSON.stringify(String(bg || "code"))};`;
  const tag = `<script>${g}${RUNTIME.replace(/<\/script/gi, "<\\/script")}</script>`;
  let s = String(html || "");
  // <head> exactly (not <header>): a page with a <header> element and no <head> must not get the runtime mid-body.
  if (/<head(?:\s[^>]*)?>/i.test(s)) s = s.replace(/<head(?:\s[^>]*)?>/i, (m) => m + tag);
  else if (/<html(?:\s[^>]*)?>/i.test(s)) s = s.replace(/<html(?:\s[^>]*)?>/i, (m) => m + "<head>" + tag + "</head>");
  else s = "<!DOCTYPE html><html><head>" + tag + "</head><body>" + s + "</body></html>";
  const over = bgStyle(bg);
  if (!over) return s;
  return /<\/body>/i.test(s) ? s.replace(/<\/body>(?![\s\S]*<\/body>)/i, over + "</body>") : s + over;
}

// HTML viewport for an output size: the short side is 1080 px (what htmlPrompt asks for), so 4K renders a 1920×1080
// page at 2× and custom sizes keep their shape.
export function viewportFor(w, h) {
  const s = 1080 / Math.min(w, h);
  return [Math.round((w * s) / 2) * 2, Math.round((h * s) / 2) * 2];
}

// Does this HTML read the Studio settings (window.STUDIO / --studio-* variables)? Used for the editor's hint.
export const followsStudio = (html) => /\bSTUDIO\b|--studio-(w|h|duration)/.test(String(html || ""));

// What the chosen Studio background means for the code (Sesuai kode / Transparan / Warna solid).
function backgroundRule(background) {
  if (background === "alpha") return "Transparent (the Studio writes a luma matte): never paint a full-frame fill. Keep the subject bright and solid, because the matte is built from the frame's alpha.";
  if (/^#[0-9a-f]{6}$/i.test(background)) return `Solid ${background.toUpperCase()} painted by the Studio (for example green screen for Premiere Pro, CapCut, After Effects, DaVinci Resolve). The subject, glows and particles must NEVER use this color or close hues, and must keep crisp edges with tight glows, so keying leaves no holes. Choose contrasting colors such as gold, amber, cyan, magenta, silver or white.`;
  return "Designed in the code: choose one that suits the idea, set it on html, body in CSS, and draw any scenery only while S.background is \"code\".";
}

// The rules every HTML must follow (shared by the single prompt and the batch prompt).
function htmlRules(aspect, duration, background = "code") {
  const [w, h] = Object.hasOwn(ASPECTS, aspect) ? ASPECTS[aspect] : ASPECTS["16:9"];
  return `=========================================
CRITICAL REQUIREMENTS (STRICT ENFORCEMENT)
=========================================
1. ZERO EXTERNAL DEPENDENCIES:
   - One self-contained file: CSS and JS inline, images only as inline SVG or data URIs.
   - No libraries, no CDN, no web fonts, no network. System fonts only (Inter, Arial, Helvetica, sans-serif). No GIF, video or audio.

2. FOLLOW THE STUDIO SETTINGS (NEVER HARD-CODE SIZE, DURATION OR BACKGROUND):
   - The owner changes these per render, so read them from window.STUDIO:
     const S = window.STUDIO || { width: ${w}, height: ${h}, duration: ${duration}, fps: 30, background: "code", transparent: false, u: (ms) => ((ms ?? performance.now()) / 1000 / ${duration}) % 1 };
   - S.width × S.height = canvas size (16:9, 9:16, 1:1 or custom). S.duration = loop length in seconds. S.u(ms) = loop position 0..1.
   - html, body { margin:0; width:100vw; height:100vh; overflow:hidden; }. Main elements use S.width × S.height, or var(--studio-w) / var(--studio-h) in CSS.
   - Compute layout from those values: center = S.width/2, scale from Math.min(S.width, S.height), so it stays tidy in every ratio.

3. PERFECT SEAMLESS LOOP (CLOSED-FORM MATH):
   - Compute every property directly from u = S.u(ms). No cumulative updates (no x += vx), no state carried between frames.
   - Periodic motion uses WHOLE cycles per loop: Math.sin(u * TWO_PI * n), rotation n × 360°, position frac(u * n + offset), with n an INTEGER. Never use 0.5 or 1.5, or the video jumps at the loop point.
   - For CSS @keyframes use animation-duration: var(--studio-duration) or calc(var(--studio-duration) / n).

4. BACKGROUND:
   - S.background is "code", "transparent" or a "#rrggbb" color from the Studio. Paint your own background ONLY when it is "code". Otherwise the Studio's choice must stay visible.
   - In CSS, hide any full-screen background element with .studio-custom-bg (set on <html> whenever the Studio picks the background).
   - Background for this video: ${backgroundRule(background)}

5. ANIMATION METHOD (the Studio captures every frame through a virtual clock):
   - Prefer one visible full-screen <canvas> with the native 2D API, driven by requestAnimationFrame / performance.now(), and nothing else visible: the Studio then copies its pixels directly (fastest render). CSS @keyframes, the Web Animations API, SVG and DOM also work, but render slower.
   - CSS 3D works (perspective, rotateX/rotateY/translateZ, transform-style: preserve-3d, backface-visibility): faces are depth-sorted per frame by their centre, so build 3D objects from planes that never cut through each other (cubes, cards, coins, carousels).
   - FORBIDDEN, the frame capture cannot draw it: SVG SMIL (<animate>, <animateTransform>).
   - On canvas, fake 3D cheaply: for a rotating disc, coin or card, draw a pre-rendered face sprite with a horizontal scale of Math.cos(angle), add a thin edge strip, and slide a specular highlight across it.
   - Randomness must be fixed: use a small seeded PRNG during setup only, never Math.random().

6. PERFORMANCE RULES (every frame is captured, heavy code makes the render slow or crash):
   - NEVER use ctx.shadowBlur, ctx.shadowColor, ctx.filter, or CSS filter / backdrop-filter. For any glow, pre-render a soft radial sprite once to an offscreen canvas and draw it with ctx.drawImage.
   - Paint everything static once into offscreen canvases during setup (never attach them to the page) and blit them per frame. Do not create gradients inside render().
   - Maximum 60 particles or sprites. No getImageData / putImageData.
   - No new objects, arrays or canvases inside render(). No ctx.save()/restore() inside particle loops: use setTransform and globalAlpha, then reset once.
   - End render() with ctx.globalAlpha = 1 and ctx.globalCompositeOperation = "source-over".

7. SAFE FOR STOCK:
   - No brand text, logos, people's names, famous characters or watermarks.`;
}

// Ready-to-fill page for the single prompt. Batch skips it so that many files fit in one answer.
function starterHtml(aspect, duration) {
  const [w, h] = Object.hasOwn(ASPECTS, aspect) ? ASPECTS[aspect] : ASPECTS["16:9"];
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Short descriptive title</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100vw; height: 100vh; overflow: hidden; background: #0b1020; }
  #canvas { display: block; width: 100vw; height: 100vh; }
</style>
</head>
<body>
<canvas id="canvas"></canvas>
<script>
(function () {
  const S = window.STUDIO || { width: ${w}, height: ${h}, duration: ${duration}, fps: 30, background: "code", transparent: false, u: (ms) => ((ms ?? performance.now()) / 1000 / ${duration}) % 1 };
  const W = S.width, H = S.height, CX = W / 2, CY = H / 2, UNIT = Math.min(W, H), TWO_PI = Math.PI * 2;
  const canvas = document.getElementById("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Seeded PRNG: setup only
  let seed = 1234;
  function rand() {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }

  function makeLayer(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  // Own scenery, painted once, only when the Studio leaves the background to the code
  const scenery = S.background === "code" ? makeLayer(W, H) : null;
  if (scenery) {
    const g = scenery.getContext("2d");
    // paint the static background here
  }

  // Soft glow sprite, built once
  const glow = makeLayer(256, 256);
  (function () {
    const g = glow.getContext("2d"), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, "rgba(255, 214, 120, 1)");
    gr.addColorStop(0.25, "rgba(255, 180, 60, 0.55)");
    gr.addColorStop(1, "rgba(255, 160, 40, 0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  })();

  // Particles: max 60, INTEGER speeds keep the loop seamless
  const particles = [];
  for (let i = 0; i < 40; i++) particles.push({ radius: UNIT * (0.15 + rand() * 0.3), speed: 1 + Math.floor(rand() * 3), size: UNIT * (0.01 + rand() * 0.02), phase: rand() * TWO_PI });

  function render(u) {
    const loop = u * TWO_PI;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    if (scenery) ctx.drawImage(scenery, 0, 0);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i], a = p.phase + loop * p.speed;
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(a * 2);
      ctx.drawImage(glow, CX + Math.cos(a) * p.radius - p.size, CY + Math.sin(a) * p.radius - p.size, p.size * 2, p.size * 2);
    }

    // DRAW THE MAIN SUBJECT HERE: prominent, fluid, professional microstock polish.

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  render(0); // the preview is never blank
  function tick(ms) {
    render(S.u(ms));
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
</script>
</body>
</html>`;
}

// Prompt the owner can paste into any AI (or Claude uses through MCP) so the HTML renders exactly, loops, and follows the
// Studio settings (size, duration, background) instead of hard-coding them.
export function htmlPrompt({ idea = "", aspect = "16:9", duration = 10, background = "code" } = {}) {
  return `You are a world-class Creative Coder & Motion Graphics Engineer.
Create one single-file, production-ready HTML animation for stock video (Adobe Stock / Shutterstock), rendered frame by frame in Studio Motion.

${htmlRules(aspect, duration, background)}

8. ZERO CONVERSATIONAL FILLER:
   - Output ONLY the complete raw HTML. Start with <!DOCTYPE html> and end with </html>. No introduction, no markdown, no notes after the code.

SPECIFICATIONS:
- Default ratio: ${aspect}
- Default loop length: ${duration} seconds
- Subject: ${idea || "choose a concept that sells well as stock footage"}

=========================================
FOLLOW THIS STRUCTURE (rename, extend, and remove whatever does not suit the idea):
=========================================
${starterHtml(aspect, duration)}

Generate the 100% complete HTML now for the subject above. No omissions, no placeholders.`;
}

// ---------- Batch: one prompt → many HTML files, pasted back in one go and split by markers ----------
// mode "variasi": one brief, `count` clearly different takes. mode "daftar": one file per line of `brief`.
export const BATCH_MAX = 50;
export const batchIdeas = (text) => String(text || "").split("\n").map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean);
export function batchPrompt({ brief = "", mode = "variasi", count = 10, aspect = "16:9", duration = 10, background = "code" } = {}) {
  const ideas = mode === "daftar" ? batchIdeas(brief).slice(0, BATCH_MAX) : [];
  const n = mode === "daftar" ? ideas.length : Math.min(BATCH_MAX, Math.max(1, Math.round(count) || 1));
  const what = mode === "daftar"
    ? `Buat ${n} file, satu per ide berikut (urutan = nomor file):\n${ideas.map((x, i) => `${i + 1}. ${x}`).join("\n")}`
    : `Brief: ${String(brief).trim() || "animasi stock footage yang laku"}

Buat ${n} file dari brief yang sama, tapi tiap file harus JELAS BERBEDA supaya tidak ditolak sebagai konten mirip: ubah minimal 3 hal sekaligus dari palet warna, komposisi/tata letak, bentuk objek, gaya visual (flat, neon, line art, glassmorphism, isometrik 2D, papercut, gradien halus…), pola gerak, ritme/kecepatan, dan kepadatan elemen. Mengganti warna saja tidak cukup.
Sebelum kode, tulis daftar konsep singkat: satu baris per nomor (1–${n}), supaya tidak ada yang kembar.`;
  return `Buatkan ${n} file HTML animasi untuk video stock (Adobe Stock / Shutterstock), rasio ${aspect}, loop ${duration} detik.
${what}

FORMAT JAWABAN WAJIB (Studio Motion memecah jawaban per penanda ini, jadi tulis persis):
<!-- ===== VIDEO 1/${n} · nama-file ===== -->
<!DOCTYPE html>
… kode lengkap …
</html>
<!-- ===== SELESAI 1/${n} ===== -->
- nama-file: huruf kecil a-z, angka dan tanda -, maks 20 karakter, unik dan menggambarkan isinya (mis. gold-dust-orbit).
- Tiap file lengkap dan berdiri sendiri. Jangan ada penjelasan di antara blok; blok kode markdown boleh, tapi penanda tetap di luar kode HTML.
- Buat kodenya ringkas (sebaiknya di bawah 25 KB per file) supaya banyak file muat dalam satu jawaban.
- Kalau jawaban hampir mencapai batas panjang: selesaikan file yang sedang ditulis, tulis <!-- ===== LANJUT DARI k ===== --> (k = nomor berikutnya), lalu berhenti. Saat saya ketik "lanjut", teruskan dari nomor k dengan format yang sama tanpa mengulang file sebelumnya, sampai nomor ${n}.

${htmlRules(aspect, duration, background)}`;
}

// Text to ask the AI for the rest of a batch.
export const batchContinue = (next, total) => `lanjut dari nomor ${next}${total ? ` sampai ${total}` : ""}, format dan penanda sama, tanpa mengulang file sebelumnya.`;

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 20).replace(/-+$/, "");
// Static checks on pasted HTML (no execution): what the frame capture cannot draw, truncation, size.
export function htmlWarnings(html) {
  const w = [], s = String(html || "");
  if (!/<\/html>\s*$/i.test(s)) w.push("terpotong");
  if (/<(animate|animateTransform|animateMotion|set)\b/i.test(s)) w.push("smil");
  if (s.length > MAX_HTML) w.push("besar");
  if (!followsStudio(s)) w.push("kunci");
  const code = s.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ""); // a comment that names a banned call must not count
  if (/\bshadowBlur\b|\.filter\s*=|backdrop-filter|filter\s*:\s*blur/i.test(code)) w.push("berat");
  if (/\bMath\.random\s*\(/.test(code)) w.push("acak");
  return w;
}
// What to tell the AI when it rewrites a file that failed the checks above (Agent's automatic second attempt).
const FIX = {
  terpotong: "the file stopped before </html>: write it more compactly and finish it",
  smil: "it used SVG SMIL, which the capture cannot draw: use requestAnimationFrame instead",
  kunci: "it hard-coded size or duration: read everything from window.STUDIO",
  berat: "it used shadowBlur or a filter, which is too slow: use a pre-rendered glow sprite",
  acak: "it used Math.random(), which changes per render: use a small seeded PRNG during setup",
};
export const qualityFix = (warns = []) => warns.map((w) => FIX[w]).filter(Boolean).join("; ");

// Extra ratios of a batch render: same short side as the Studio output, so the sharpness stays the same.
export const RATIOS = [["16:9", "169"], ["9:16", "916"], ["1:1", "11"]];
export function sizeForAspect(aspect, ow, oh) {
  const s = Math.min(ow, oh), long = Math.round((s * 16) / 9 / 2) * 2;
  return aspect === "1:1" ? [s, s] : aspect === "9:16" ? [s, long] : [long, s];
}
// Splits a pasted AI answer into HTML files: by "VIDEO n/N · name" markers, else by each <!DOCTYPE html> … </html>.
export function splitBatch(text) {
  const src = String(text || "").replace(/\r\n?/g, "\n"), out = [];
  const take = (chunk) => {
    const c = chunk.replace(/```[a-z]*\n?/gi, ""), a = c.search(/<!DOCTYPE html|<html[\s>]/i); if (a < 0) return "";
    const b = c.toLowerCase().lastIndexOf("</html>");
    return (b > a ? c.slice(a, b + 7) : c.slice(a).replace(/<!--\s*=+\s*(SELESAI|LANJUT)[\s\S]*$/i, "")).trim();
  };
  const re = /<!--\s*=+\s*VIDEO\s+(\d+)\s*(?:\/\s*(\d+))?\s*[·•|:\-–—]?\s*([^=]*?)\s*=+\s*-->/gi, marks = [...src.matchAll(re)];
  if (marks.length) {
    marks.forEach((m, i) => { const html = take(src.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : src.length));
      if (html) out.push({ n: +m[1], of: m[2] ? +m[2] : null, name: slug(m[3]), html }); });
  } else {
    const starts = [...src.matchAll(/<!DOCTYPE html/gi)].map((m) => m.index);
    starts.forEach((p, i) => { const html = take(src.slice(p, starts[i + 1] ?? src.length)); if (html) out.push({ n: i + 1, of: null, name: "", html }); });
  }
  return out.map((x) => ({ ...x, name: x.name || slug((x.html.match(/<title>([^<]*)<\/title>/i) || [])[1]) || `video-${x.n}`, warns: htmlWarnings(x.html) }));
}

export const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Retro sunset grid loop</title>
<style>
  html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #070210; }
  svg { display: block; }
  .sun { transform-origin: 960px 430px; animation: pulse 5s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
</style>
</head>
<body>
<svg id="stage" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#05010d"/><stop offset=".35" stop-color="#13052e"/><stop offset=".62" stop-color="#3c0959"/>
      <stop offset=".84" stop-color="#9e1268"/><stop offset=".96" stop-color="#ff2a7a"/><stop offset="1" stop-color="#ff9e3d"/>
    </linearGradient>
    <linearGradient id="sunG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset=".55" stop-color="#ff9e3d"/><stop offset="1" stop-color="#ff2a7a"/></linearGradient>
    <clipPath id="sunCut"><rect x="0" y="0" width="1920" height="650"/></clipPath>
    <clipPath id="sunDisc"><circle cx="960" cy="430" r="260"/></clipPath>
  </defs>
  <rect width="1920" height="650" fill="url(#sky)"/>
  <g class="sun" clip-path="url(#sunCut)">
    <circle cx="960" cy="430" r="260" fill="url(#sunG)"/>
    <g fill="#3c0959" clip-path="url(#sunDisc)"><rect x="600" y="470" width="720" height="10"/><rect x="600" y="510" width="720" height="16"/><rect x="600" y="555" width="720" height="22"/><rect x="600" y="605" width="720" height="28"/></g>
  </g>
  <rect y="650" width="1920" height="430" fill="#0b0320"/>
  <g id="grid" stroke-linecap="round"></g>
  <rect y="646" width="1920" height="6" fill="#ff9ad5"/>
</svg>
<script>
  // Perspective grid drawn with SVG lines from the clock (not CSS 3D): one line spacing per second, so any length loops.
  const g = document.getElementById("grid"), NS = "http://www.w3.org/2000/svg", Y0 = 650, VX = 960;
  const line = (x1, y1, x2, y2, c, w) => { const l = document.createElementNS(NS, "line"); l.setAttribute("x1", x1); l.setAttribute("y1", y1);
    l.setAttribute("x2", x2); l.setAttribute("y2", y2); l.setAttribute("stroke", c); l.setAttribute("stroke-width", w); g.appendChild(l); };
  function draw(t) {
    g.textContent = "";
    for (let i = -14; i <= 14; i++) line(VX + i * 6, Y0, VX + i * 260, 1080, "#22d3ee", 3);
    const phase = (t / 1000) % 1;
    for (let k = 0; k < 24; k++) { const z = k + 1 - phase; if (z <= 0.2) continue; const y = Y0 + 430 / z; if (y > 1080) continue; line(0, y, 1920, y, "#ff2a7a", Math.max(1.5, 5 / z)); }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
</script>
</body>
</html>`;
