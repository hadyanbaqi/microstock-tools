export const dynamic = "force-dynamic";

// Sandboxed host for Studio Motion "Editor HTML". Loaded in <iframe sandbox="allow-scripts"> (opaque origin: no cookies,
// storage or Apify token); its own CSP blocks every request (connect-src 'none', no external images, fonts or scripts).
// The parent posts { cveHtml } (already injected with the time runtime from lib/htmlMotion.mjs); this page replaces itself
// with that document. The CSP of this response stays in force after document.write.
const CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'";
const HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#000"><script>
addEventListener("message", function (e) { if (e.source !== parent || !e.data || typeof e.data.cveHtml !== "string") return;
  document.open(); document.write(e.data.cveHtml); document.close(); });
parent.postMessage({ cveReady: true }, "*");
</script></body></html>`;

export function GET() {
  return new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": CSP, "X-Frame-Options": "SAMEORIGIN",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store" } });
}
