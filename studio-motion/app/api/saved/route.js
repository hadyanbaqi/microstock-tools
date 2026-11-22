import { listSaved } from "@/lib/cache";
import { workspaceFrom } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This workspace's searches already paid for and stored: reopening them is free.
export async function GET(req) {
  try {
    const rows = await listSaved(workspaceFrom(req), 40);
    return Response.json({
      items: rows.map((r) => ({ params: r.params, query: r.query, creatorId: r.creator_id, count: r.item_count, source: r.source, at: r.updated_at,
        velocity: r.velocity ?? null, score: r.score ?? null })),
    });
  } catch (e) {
    console.error("saved list failed:", e.message);
    return Response.json({ items: [], error: "Gagal membaca pencarian tersimpan." }, { status: 500 });
  }
}
