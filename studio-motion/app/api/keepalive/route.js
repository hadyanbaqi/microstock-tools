// Daily Vercel cron (vercel.json): one tiny read so the free Supabase project is never paused for inactivity.
// With CRON_SECRET set, only Vercel's cron (Authorization: Bearer CRON_SECRET) may call it.
import { hasDb, rest } from "@/lib/supabase";
import { safeEqual } from "@/lib/auth";
import { clientIp, makeLimiter } from "@/lib/ratelimit";

const allowPing = makeLimiter(30, 3600e3);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (secret && !safeEqual(req.headers.get("authorization"), `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  if (!secret && !allowPing(clientIp(req))) return new Response("Too many requests", { status: 429 });
  if (!hasDb) return Response.json({ ok: true, db: false });
  try {
    await rest("search_results?select=key&limit=1");
    return Response.json({ ok: true, db: true, at: new Date().toISOString() });
  } catch (e) {
    console.error("keepalive failed:", e.message);
    return Response.json({ ok: false }, { status: 502 });
  }
}
