import { fetchPooled, payerFor } from "@/lib/tokenPool";
import { analyze } from "@/lib/analyze";
import { getStored, recordHistory, setCached } from "@/lib/cache";
import { workspaceFrom } from "@/lib/workspace";
import { allow, allowUser } from "@/lib/ratelimit";
import { userTokenFrom } from "@/lib/token";
import { normalizeParams } from "@/lib/params";

export const runtime = "nodejs";
export const maxDuration = 300;

// Identical requests already running share one Apify call (e.g. double clicks).
const inflight = new Map();

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const params = normalizeParams(body);
  const { query, creatorId } = params;
  if (!query && !creatorId) {
    return Response.json({ error: "Isi kata kunci atau Creator ID." }, { status: 400 });
  }

  const cached = await getStored(params, { freshOnly: true });
  // Kantong token first (most credit left), then the browser's own token, then the server's APIFY_TOKEN.
  const userToken = userTokenFrom(req);
  const payer = await payerFor(userToken);
  // An older stored copy of exactly this search (paid for before): always free to reopen.
  const saved = cached ?? (body.peek || body.useSaved ? await getStored(params) : null);
  // peek: would this search spend credit? Lets the browser confirm before an uncached fetch. Never calls Apify.
  if (body.peek) {
    return Response.json({ cached: !!cached, savedAt: saved?.at ?? null, payer, maxItems: params.maxItems });
  }
  const owner = workspaceFrom(req);
  if (cached) { await recordHistory(owner, cached.params); return Response.json({ ...cached.data, cached: true, fetchedAt: cached.at }); }
  if (body.useSaved && !saved) return Response.json({ error: "Salinan tersimpan tidak ditemukan. Tidak ada biaya yang dipakai." }, { status: 404 });
  if (body.useSaved && saved) { await recordHistory(owner, saved.params); return Response.json({ ...saved.data, cached: true, saved: true, fetchedAt: saved.at }); }

  const demo = payer === "demo";
  const key = JSON.stringify(params);
  let job = inflight.get(key);
  if (!job) {
    // Only calls on the server's token cost us money, so only they count against the limit.
    if (payer === "server" && !allow(clientIp(req))) {
      return Response.json({ error: "Batas pencarian per jam tercapai. Coba lagi nanti." }, { status: 429 });
    }
    if ((payer === "user" || payer === "pool") && !allowUser(clientIp(req))) {
      return Response.json({ error: "Terlalu banyak pencarian dalam satu jam. Coba lagi nanti." }, { status: 429 });
    }
    job = (async () => {
      const { items, source, label } = await fetchPooled(params, { userToken });
      if (!items?.length) {
        const err = new Error("empty result");
        err.code = "EMPTY";
        throw err;
      }
      const isDemo = source === "demo";
      const result = { params, demo: isDemo, tokenSource: isDemo ? "none" : source, tokenLabel: label, ...analyze(items, { query, asset: params.asset, creatorId }) };
      // Demo data must not be cached, or it would mask real data once APIFY_TOKEN is set.
      if (!isDemo) await setCached(params, result);
      return result;
    })().finally(() => inflight.delete(key));
    inflight.set(key, job);
  }

  try {
    const result = await job;
    if (!result.demo) await recordHistory(owner, params);
    return Response.json({ ...result, cached: false, fetchedAt: Date.now() });
  } catch (e) {
    console.error("research failed:", e.code ?? "", e.message);
    if (e.code === "EMPTY") {
      return Response.json({ error: creatorId
        ? "Kontributor tidak ditemukan atau tidak punya aset dengan filter ini. Periksa Creator ID/link profil."
        : "Tidak ada aset untuk pencarian ini. Coba keyword yang lebih umum atau ubah filter (jenis konten, AI)." }, { status: 404 });
    }
    if (e.code === "BAD_TOKEN") {
      return Response.json({ error: "Semua token Apify ditolak. Periksa token di Pengaturan Apify." }, { status: 401 });
    }
    if (e.code === "MEMORY") {
      return Response.json({ error: "Semua akun Apify sedang menjalankan terlalu banyak proses sekaligus (batas memori penuh), bukan kredit habis. Tunggu sebentar lalu coba lagi." }, { status: 503 });
    }
    if (e.code === "NO_CREDIT") {
      return Response.json({ error: "Kredit semua token Apify habis (atau batas bulanan tercapai). Tambah token di Pengaturan Apify atau cek Billing di console.apify.com." }, { status: 402 });
    }
    if (e.code === "INVALID_INPUT") {
      return Response.json({ error: `Actor Apify menolak pilihan ini (urutan “${params.order}” / jenis “${params.asset}”). Coba urutan atau jenis konten lain.` }, { status: 400 });
    }
    return Response.json({ error: "Gagal mengambil data dari Apify. Coba lagi nanti." }, { status: 502 });
  }
}

function clientIp(req) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}
