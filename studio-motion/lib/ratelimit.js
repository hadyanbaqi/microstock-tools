// In-memory sliding-window limits per client IP (per server instance only; move to Supabase with auth and plans).

const num = (v, d) => { const n = Number(v ?? d); return Number.isFinite(n) ? n : d; };

export function makeLimiter(limit, windowMs) {
  const hits = new Map();
  return function allow(ip) {
    if (!limit) return true;
    const now = Date.now();
    const list = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= limit) {
      hits.set(ip, list);
      return false;
    }
    list.push(now);
    hits.set(ip, list);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    return true;
  };
}

// Paid Apify searches on the server token.
export const allow = makeLimiter(num(process.env.RATE_LIMIT_PER_HOUR, 20), 3600e3);
// "Perbarui tren" scans not paid by the user's own token (server token or demo).
export const allowScan = makeLimiter(num(process.env.SCAN_LIMIT_PER_DAY, 3), 864e5);

// Calls on a visitor's own token: they pay Apify, but each call still uses this server's function time.
export const allowUser = makeLimiter(num(process.env.USER_LIMIT_PER_HOUR, 120), 3600e3);
// Token checks (Pengaturan → Tes token).
export const allowCheck = makeLimiter(30, 3600e3);

export function clientIp(req) {
  // On Vercel the platform sets these itself; a client-sent X-Forwarded-For is only the fallback (local dev).
  return req.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip")
    || req.headers.get("x-forwarded-for")?.split(",").pop().trim() || "local";
}
