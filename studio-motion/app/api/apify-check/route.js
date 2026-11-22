import { checkToken } from "@/lib/apify";
import { allowCheck, clientIp } from "@/lib/ratelimit";
import { userTokenFrom } from "@/lib/token";

export const runtime = "nodejs";

// Tells the settings panel whether a token works and, if so, whose account it is.
// GET without a token header reports whether the server has its own token.
export async function GET(req) {
  const token = userTokenFrom(req);
  if (!token) {
    if (req.headers.get("x-apify-token")) return Response.json({ ok: false, error: "Format token tidak valid." }, { status: 400 });
    return Response.json({ ok: false, serverToken: !!process.env.APIFY_TOKEN });
  }
  if (!allowCheck(clientIp(req))) return Response.json({ ok: false, error: "Terlalu banyak tes token. Coba lagi nanti." }, { status: 429 });
  try {
    const r = await checkToken(token);
    return Response.json(r, { status: r.ok ? 200 : 401 });
  } catch (e) {
    console.error("apify check failed:", e.message);
    return Response.json({ ok: false, error: "Tidak bisa menghubungi Apify. Coba lagi nanti." }, { status: 502 });
  }
}
