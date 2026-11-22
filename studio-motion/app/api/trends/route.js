import { fetchAssets } from "@/lib/apify";
import { fetchPooled, payerFor, poolSummary } from "@/lib/tokenPool";
import { allowScan, clientIp } from "@/lib/ratelimit";
import { userTokenFrom } from "@/lib/token";
import { ITEMS_PER_THEME, PER_ORDER, SCAN_COST, THEMES, themeById } from "@/lib/themes";
import { keywordTrends } from "@/lib/trends";
import { createScan, finishScan, getScan, hasDb, latestTrends, runningScan, saveTheme } from "@/lib/trendStore";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const runningThemes = new Set(); // "scanId:theme" calls in flight (this instance)

// A scan's themes must be run within this time after it starts.
const THEME_WINDOW_MS = 30 * 60e3;

// Stored trends (free): latest finished scan + a running one, if any. Never calls Apify.
export async function GET(req) {
  try {
    const [latest, running] = await Promise.all([latestTrends(), runningScan()]);
    return Response.json({
      ...latest, running, themes: THEMES, cost: SCAN_COST, perTheme: ITEMS_PER_THEME, storage: hasDb ? "database" : "local",
      // Who would pay if this browser started a scan now.
      payer: await payerFor(userTokenFrom(req)),
    });
  } catch (e) {
    console.error("trends GET failed:", e.message);
    return Response.json({ error: "Gagal membaca tren tersimpan." }, { status: 500 });
  }
}

// Scans run step by step from the browser (start → one call per theme → finish), so each request
// stays short and the page can show progress. Only started by an explicit, confirmed click.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const userToken = userTokenFrom(req);
  try {
    if (body.action === "start") {
      const busy = await runningScan();
      if (busy) return Response.json({ error: "Pembaruan tren lain sedang berjalan. Tunggu sampai selesai.", running: busy }, { status: 409 });
      const paidBy = await payerFor(userToken);
      // With a shared database, a demo scan would sit next to real data and block real scans while it runs.
      if (paidBy === "demo" && hasDb) {
        return Response.json({ error: "Pasang token Apify Anda dulu untuk memperbarui tren. Hasil tren tersimpan tetap bisa dilihat gratis." }, { status: 402 });
      }
      if ((paidBy === "server" || paidBy === "demo") && !allowScan(clientIp(req))) {
        return Response.json({ error: "Batas pembaruan tren hari ini tercapai. Pasang token Apify Anda sendiri atau coba besok." }, { status: 429 });
      }
      const scan = await createScan({
        themes_total: THEMES.length, items_per_theme: ITEMS_PER_THEME,
        cost_estimate: paidBy === "demo" ? 0 : SCAN_COST, paid_by: paidBy, is_demo: paidBy === "demo",
      });
      // Each Apify account has its own memory cap: with several pool tokens more themes can run at once.
      const usable = paidBy === "pool" ? (await poolSummary().catch(() => ({ usable: 1 }))).usable : 1;
      return Response.json({ scan, themes: THEMES, parallel: Math.min(6, Math.max(2, usable * 2)) });
    }

    const scan = Number.isInteger(Number(body.scanId)) && Number(body.scanId) > 0 ? await getScan(Number(body.scanId)) : null;
    if (!scan) return Response.json({ error: "Pembaruan tren tidak ditemukan." }, { status: 404 });

    if (body.action === "theme") {
      const theme = themeById(body.theme);
      if (!theme) return Response.json({ error: "Tema tidak dikenal." }, { status: 400 });
      if (scan.status !== "running" || Date.now() - new Date(scan.created_at).getTime() > THEME_WINDOW_MS) {
        return Response.json({ error: "Pembaruan tren ini sudah ditutup." }, { status: 409 });
      }
      if (scan.themes_done.includes(theme.id)) return Response.json({ theme: theme.id, skipped: true });
      // A retry or second tab must not pay for the same theme twice while the first call is still running.
      const lockKey = `${scan.id}:${theme.id}`;
      if (runningThemes.has(lockKey)) return Response.json({ theme: theme.id, skipped: true });
      runningThemes.add(lockKey);
      try {
      // The payer kind is fixed when the scan starts. Pool scans pick (and switch) tokens per call; a user-paid
      // scan needs that user's token on every step.
      let opts;
      if (scan.paid_by === "pool") opts = { userToken };
      else if (scan.paid_by === "user") opts = { userToken, env: [] };
      else if (scan.paid_by === "server") opts = { env: [process.env.APIFY_TOKEN] };
      if (scan.paid_by === "user" && !userToken) return Response.json({ error: "Token Apify tidak tersedia untuk pembaruan ini." }, { status: 401 });
      const get = async (p) => (scan.paid_by === "demo" ? fetchDemo(p) : (await fetchPooled(p, opts)).items);
      const base = { query: theme.query, asset: "all", ai: "", maxItems: PER_ORDER };
      // One run at a time per theme keeps the account's memory use low.
      const fresh = await get({ ...base, order: "newest" });
      const best = await get({ ...base, order: "downloads" });
      // Relevance surfaces recent assets that already sell; merged into demand (duplicates are dropped).
      const rel = await get({ ...base, order: "relevance" });
      // An empty newest sample would read as "no competition" for every keyword: treat it as a failed theme (retried).
      if (!fresh?.length || (best?.length ?? 0) < 5) throw Object.assign(new Error("Sampel tema terlalu sedikit"), { code: "EMPTY" });
      const { keywords, assets } = keywordTrends({ best: [...(best ?? []), ...(rel ?? [])], fresh: fresh ?? [] }, theme);
      await saveTheme(scan.id, theme.id, keywords, assets);
      return Response.json({ theme: theme.id, keywords: keywords.length, assets });
      } finally { runningThemes.delete(lockKey); }
    }

    if (body.action === "finish") {
      const done = await finishScan(await getScan(scan.id));
      return Response.json({ scan: done });
    }
    return Response.json({ error: "Aksi tidak dikenal." }, { status: 400 });
  } catch (e) {
    console.error("trends POST failed:", e.message);
    if (e.code === "BAD_TOKEN") return Response.json({ error: "Semua token Apify ditolak. Periksa token di Pengaturan Apify." }, { status: 401 });
    if (e.code === "MEMORY") return Response.json({ error: "Batas memori semua akun Apify penuh (terlalu banyak proses sekaligus), bukan kredit habis." }, { status: 503 });
    if (e.code === "NO_CREDIT") return Response.json({ error: "Kredit semua token Apify habis (atau batas bulanan tercapai). Tambah token di Pengaturan Apify." }, { status: 402 });
    if (e.code === "INVALID_INPUT" || e.code === "ACTOR_NOT_FOUND") return Response.json({ error: `Apify menolak permintaan (${e.code}). Kirim pesan ini ke pengembang.` }, { status: 502 });
    if (/fetch failed|supabase|ENOTFOUND|ECONNREFUSED/i.test(e.message)) return Response.json({ error: "Database (Supabase) tidak bisa dihubungi. Cek apakah project Supabase sedang di-pause, lalu klik Restore." }, { status: 503 });
    return Response.json({ error: "Gagal memperbarui tren. Coba lagi nanti." }, { status: 502 });
  }
}

// Demo scans (no token anywhere): generated sample data, never Apify.
const fetchDemo = (p) => fetchAssets(p, "");
