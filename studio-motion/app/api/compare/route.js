import { listStoredSummaries } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stored keyword searches with their metrics, for "Bandingkan niche". Reads only stored data: never calls Apify.
export async function GET() {
  try {
    return Response.json({ items: await listStoredSummaries() });
  } catch (e) {
    console.error("compare list failed:", e.message);
    if (/fetch failed|ENOTFOUND|ECONNREFUSED/i.test(e.message)) return Response.json({ items: [], error: "Database (Supabase) tidak bisa dihubungi." }, { status: 503 });
    return Response.json({ items: [], error: "Gagal membaca pencarian tersimpan." }, { status: 500 });
  }
}
