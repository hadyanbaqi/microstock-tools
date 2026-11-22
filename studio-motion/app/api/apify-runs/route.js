import { analyze } from "@/lib/analyze";
import { listRuns, runResult } from "@/lib/apify";
import { getStored, keyFor, recordHistory, setCached } from "@/lib/cache";
import { allowCheck, clientIp } from "@/lib/ratelimit";
import { workspaceFrom } from "@/lib/workspace";
import { normalizeParams } from "@/lib/params";
import { hasDb, rest } from "@/lib/supabase";
import { userTokenFrom } from "@/lib/token";
import { readableTokens } from "@/lib/tokenPool";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

// Searches paid for earlier on this Apify account, recoverable for free while Apify still keeps the data.
const paramsOf = (input) => normalizeParams({ ...input, creatorId: input?.creatorId ? String(input.creatorId) : "" });
// The browser's own token and the owner's token pool (personal site, behind the login). Never the env server token.
async function sourcesOf(req) {
  const user = userTokenFrom(req);
  const pool = await readableTokens().catch(() => []);
  const list = pool.filter((p) => p.token !== user);
  return user ? [{ id: null, label: "token browser", token: user }, ...list] : list;
}

export async function GET(req) {
  if (!allowCheck(clientIp(req))) return Response.json({ error: "Terlalu banyak permintaan. Coba lagi nanti." }, { status: 429 });
  const sources = await sourcesOf(req);
  if (!sources.length) return Response.json({ error: "Pasang token Apify dulu untuk melihat pencarian lama." }, { status: 401 });
  try {
    // Every account in parallel; one failing account (rejected token) does not hide the others.
    const per = await Promise.all(sources.map((s) => listRuns(s.token)
      .then((rs) => rs.map((r) => ({ ...r, tokenId: s.id, tokenLabel: s.label })))
      .catch((e) => { if (sources.length === 1) throw e; console.warn("apify runs for one token failed:", e.message); return []; })));
    const runs = per.flat().filter((r) => r.input && (r.input.query || r.input.creatorId))
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    const keys = runs.map((r) => keyFor(paramsOf(r.input)));
    let saved = new Set();
    if (hasDb && keys.length) {
      const rows = await rest(`search_results?key=in.(${[...new Set(keys)].join(",")})&select=key`).catch(() => []);
      saved = new Set(rows.map((x) => x.key));
    }
    return Response.json({
      runs: runs.map((r, i) => ({ id: r.id, startedAt: r.startedAt, usd: r.usd, items: r.items, available: r.available,
        params: paramsOf(r.input), saved: saved.has(keys[i]), tokenId: r.tokenId, tokenLabel: sources.length > 1 ? r.tokenLabel : undefined })),
    });
  } catch (e) {
    console.error("apify runs failed:", e.message);
    if (e.code === "BAD_TOKEN") return Response.json({ error: "Token Apify ditolak." }, { status: 401 });
    return Response.json({ error: "Gagal membaca riwayat Apify. Coba lagi nanti." }, { status: 502 });
  }
}

// Import one run: analyze its stored items and keep the result like a normal search (free).
export async function POST(req) {
  if (!allowCheck(clientIp(req))) return Response.json({ error: "Terlalu banyak permintaan. Coba lagi nanti." }, { status: 429 });
  const { runId, tokenId } = (await req.json().catch(() => null)) ?? {};
  // A run belongs to one account: the pool token it was listed with, else the browser's token.
  const sources = await sourcesOf(req);
  const token = (tokenId ? sources.find((s) => s.id === tokenId) : sources.find((s) => s.id === null) ?? sources[0])?.token;
  if (!token) return Response.json({ error: "Pasang token Apify dulu." }, { status: 401 });
  if (!/^[A-Za-z0-9]{8,32}$/.test(String(runId ?? ""))) return Response.json({ error: "ID run tidak valid." }, { status: 400 });
  try {
    const got = await runResult(token, runId);
    if (!got || !got.items?.length) return Response.json({ error: "Data run ini sudah tidak tersedia di Apify (biasanya dihapus setelah ±7 hari)." }, { status: 404 });
    const params = paramsOf(got.input);
    if (!params.query && !params.creatorId) return Response.json({ error: "Run ini bukan pencarian keyword atau kontributor." }, { status: 400 });
    const result = { params, demo: false, tokenSource: "user", recovered: true,
      ...analyze(got.items, { query: params.query, asset: params.asset, creatorId: params.creatorId }) };
    // A smaller or older run must not replace a fuller stored copy of the same search.
    const have = await getStored(params).catch(() => null);
    if ((have?.data?.assets?.length ?? 0) <= got.items.length) await setCached(params, result, "apify-import");
    await recordHistory(workspaceFrom(req), params);
    return Response.json({ params, count: got.items.length });
  } catch (e) {
    console.error("apify import failed:", e.message);
    if (e.code === "BAD_TOKEN") return Response.json({ error: "Token Apify ditolak." }, { status: 401 });
    return Response.json({ error: "Gagal memulihkan data dari Apify. Coba lagi nanti." }, { status: 502 });
  }
}
