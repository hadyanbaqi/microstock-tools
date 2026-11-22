// Security headers for every page and API route. The CSP only allows requests back to this site, so even an
// injected script could not send a visitor's Apify token anywhere else (connect-src 'self'); images only from
// Adobe Stock's CDN; fonts from Google Fonts; no framing.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://*.ftcdn.net",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // The motion preview route inlines the engine source at request time.
  outputFileTracingIncludes: { "/motion-preview": ["./lib/motion.mjs"], "/motion-preview/render": ["./lib/motion.mjs", "./node_modules/mediabunny/dist/bundles/mediabunny.min.mjs"], "/api/motion/html": ["./lib/motion.mjs", "./node_modules/mediabunny/dist/bundles/mediabunny.min.mjs"] },
  async headers() {
    return [{
      // /motion-preview (sandboxed Studio Motion scene preview) sets its own stricter CSP and allows same-origin framing.
      source: "/((?!motion-preview).*)",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ],
    }];
  },
};

export default nextConfig;
