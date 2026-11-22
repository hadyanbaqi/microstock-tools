import { SESSION_COOKIE, SESSION_DAYS, safeEqual, sessionValue } from "@/lib/auth";
import { clientIp, makeLimiter } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowTry = makeLimiter(10, 15 * 60e3);
// Whole-site cap on top of the per-IP one: rotating IPs cannot run an unlimited guessing campaign.
const allowAny = makeLimiter(60, 15 * 60e3);

export async function POST(req) {
  if (!process.env.SITE_PASSWORD) return Response.json({ error: "SITE_PASSWORD belum diisi di server." }, { status: 503 });
  if (!allowTry(clientIp(req)) || !allowAny("all")) return Response.json({ error: "Terlalu banyak percobaan. Coba lagi 15 menit lagi." }, { status: 429 });
  const { password } = await req.json().catch(() => ({}));
  if (!safeEqual(password, process.env.SITE_PASSWORD)) {
    await new Promise((r) => setTimeout(r, 700)); // slows down guessing
    return Response.json({ error: "Password salah." }, { status: 401 });
  }
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", `${SESSION_COOKIE}=${await sessionValue()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
  return res;
}
