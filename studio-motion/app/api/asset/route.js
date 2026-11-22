import { fetchPooled, payerFor } from "@/lib/tokenPool";
import { analyze } from "@/lib/analyze";
import { getCached, setCached } from "@/lib/cache";
import { allow, allowUser } from "@/lib/ratelimit";
import { userTokenFrom } from "@/lib/token";

export const runtime = "nodejs";
export const maxDuration = 300;

// One asset by its Adobe Stock ID. The actor has no ID input, so this searches Adobe Stock for the
// ID (Adobe resolves content IDs in search) and keeps the matching item. 10 results max = cheap.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  // Plain ID, or an Adobe Stock URL (…/title/123456789): take the last run of digits.
  const raw = String(body.id ?? "").trim();
  const id = /^\d+$/.test(raw) ? raw : (raw.match(/\d{5,12}(?=\D*$)/) ?? [""])[0];
  if (id.length < 5 || id.length > 12) return Response.json({ error: "ID aset tidak valid." }, { status: 400 });

  const key = { assetLookup: id };
  if (!body.fresh) {
    const cached = await getCached(key);
    if (cached) return Response.json({ ...cached.data, cached: true, fetchedAt: cached.at });
  }

  const userToken = userTokenFrom(req);
  const payer = await payerFor(userToken);
  if (payer === "server" && !allow(clientIp(req))) {
    return Response.json({ error: "Batas pencarian per jam tercapai. Coba lagi nanti." }, { status: 429 });
  }
  if ((payer === "user" || payer === "pool") && !allowUser(clientIp(req))) {
    return Response.json({ error: "Terlalu banyak pencarian dalam satu jam. Coba lagi nanti." }, { status: 429 });
  }

  try {
    const { items, source } = await fetchPooled({ query: id, asset: "all", ai: "", order: "relevance", maxItems: 10 }, { userToken });
    const demo = source === "demo";
    // Demo data has random IDs: pretend the first item is the one asked for.
    const hit = demo ? items[0] && { ...items[0], id: Number(id) } : items.find((a) => String(a.id) === id);
    if (!hit) {
      return Response.json({ error: "Aset dengan ID ini tidak ditemukan lewat pencarian Adobe Stock. Pastikan ID/link benar, atau cari lewat keyword." }, { status: 404 });
    }
    const asset = analyze([hit]).assets[0];
    const result = { asset, demo };
    if (!demo) await setCached(key, result, "asset");
    return Response.json({ ...result, cached: false, fetchedAt: Date.now() });
  } catch (e) {
    console.error("asset lookup failed:", e.code ?? "", e.message);
    if (e.code === "BAD_TOKEN") return Response.json({ error: "Token Apify ditolak. Periksa token di Pengaturan Apify." }, { status: 401 });
    if (e.code === "MEMORY") return Response.json({ error: "Apify sedang menjalankan terlalu banyak proses sekaligus (batas memori akun penuh), bukan kredit habis. Coba lagi sebentar." }, { status: 503 });
    if (e.code === "NO_CREDIT") return Response.json({ error: "Apify menolak karena batas pemakaian akun (kredit atau batas bulanan). Cek Billing di console.apify.com." }, { status: 402 });
    return Response.json({ error: "Gagal mengambil data dari Apify. Coba lagi nanti." }, { status: 502 });
  }
}

function clientIp(req) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}
