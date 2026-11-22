// Search results are kept so nobody pays Apify twice for the same data.
// With Supabase (SUPABASE_URL + SUPABASE_SECRET_KEY) results are stored permanently in `search_results`;
// without it, in a local file cache (development; on Vercel that is /tmp and may vanish).
// TTL (CACHE_TTL_HOURS) only decides whether a stored result still counts as fresh.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { hasDb, rest } from "./supabase.js";

const DIR = process.env.CACHE_DIR || (process.env.VERCEL ? path.join(os.tmpdir(), "stockscope-cache") : path.join(process.cwd(), ".cache"));
export const TTL_MS = Number(process.env.CACHE_TTL_HOURS ?? 48) * 3600e3;

export const keyFor = (obj) => crypto.createHash("sha1").update(JSON.stringify(obj)).digest("hex");

async function read(params) {
  const key = keyFor(params);
  if (hasDb) {
    try {
      const [row] = await rest(`search_results?key=eq.${key}&select=result,updated_at&limit=1`);
      if (row) return { data: row.result, at: new Date(row.updated_at).getTime() };
    } catch (e) {
      console.warn("saved result read failed:", e.message);
    }
  }
  try {
    const { at, data } = JSON.parse(await fs.readFile(path.join(DIR, key + ".json"), "utf8"));
    return { data, at };
  } catch {
    return null;
  }
}

// Fresh result (younger than the TTL) or null.
export async function getCached(params) {
  const hit = await read(params);
  return hit && Date.now() - hit.at < TTL_MS ? hit : null;
}

// Any stored result, however old (free to reopen).
export const getSaved = (params) => read(params);

// Same search stored with more assets (e.g. 100 when 60 is asked): reusing it costs nothing and loses no data.
const BIGGER = [60, 100, 200, 300];
export async function getStored(params, { freshOnly = false } = {}) {
  for (const n of [params.maxItems, ...BIGGER.filter((n) => n > params.maxItems)]) {
    const p = { ...params, maxItems: n };
    const hit = freshOnly ? await getCached(p) : await read(p);
    if (hit) return { ...hit, params: p };
  }
  return null;
}

// A failed write must never fail the search the user already paid for.
export async function setCached(params, data, source = "search") {
  if (hasDb) {
    try {
      await rest("search_results", {
        method: "POST", prefer: "resolution=merge-duplicates",
        body: {
          key: keyFor(params), params, query: params.query ?? "", creator_id: params.creatorId ?? "",
          item_count: data?.assets?.length ?? (data?.asset ? 1 : 0), result: data, source, updated_at: new Date().toISOString(),
        },
      });
      return;
    } catch (e) {
      console.warn("saved result write failed:", e.message);
    }
  }
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(path.join(DIR, keyFor(params) + ".json"), JSON.stringify({ at: Date.now(), data }));
  } catch (e) {
    console.warn("cache write failed:", e.message);
  }
}

// Remember that this workspace opened/paid for this search (its private "Tersimpan" list). Never fails the caller.
export async function recordHistory(owner, params) {
  if (!hasDb || !owner) return;
  try {
    await rest("search_history", { method: "POST", prefer: "resolution=merge-duplicates",
      body: { owner, key: keyFor(params), opened_at: new Date().toISOString() } });
  } catch (e) {
    console.warn("history write failed:", e.message);
  }
}

// This workspace's saved searches (newest first). Supabase only.
export async function listSaved(owner, limit = 40) {
  if (!hasDb || !owner) return [];
  const rows = await rest(`search_history?owner=eq.${encodeURIComponent(owner)}&order=opened_at.desc&limit=${limit}`
    + "&select=opened_at,r:search_results(key,params,query,creator_id,item_count,source,updated_at,velocity:result->summary->avgVelocity,score:result->summary->opportunityScore)");
  return rows.filter((x) => x.r && x.r.source !== "asset").map((x) => ({ ...x.r, opened_at: x.opened_at }));
}

// Every stored keyword search (web and Claude/MCP) with its summary, top keywords and brief: the free data behind
// "Bandingkan niche". Personal site, so not limited to this browser's workspace. Local .cache files without Supabase.
const pickRow = (r) => ({ key: r.key, params: r.params, count: r.item_count, source: r.source, at: r.updated_at,
  summary: r.summary ?? null, brief: r.brief ?? null, keywords: (r.keywords ?? []).slice(0, 10).map((k) => k.keyword) });
export async function listStoredSummaries(limit = 300) {
  if (hasDb) {
    const rows = await rest(`search_results?creator_id=eq.&source=neq.asset&order=updated_at.desc&limit=${limit}`
      + "&select=key,params,item_count,source,updated_at,summary:result->summary,brief:result->brief,keywords:result->keywords");
    return rows.filter((r) => r.params?.query && r.summary).map(pickRow);
  }
  const out = [];
  try {
    for (const f of (await fs.readdir(DIR)).filter((n) => n.endsWith(".json"))) {
      try {
        const { at, data, params } = JSON.parse(await fs.readFile(path.join(DIR, f), "utf8"));
        const p = params ?? data?.params;
        if (p?.query && !p.creatorId && data?.summary) out.push(pickRow({ key: f.slice(0, -5), params: p, item_count: data.summary.count, source: "search",
          updated_at: new Date(at).toISOString(), summary: data.summary, brief: data.brief, keywords: data.keywords }));
      } catch {}
    }
  } catch {}
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
}
