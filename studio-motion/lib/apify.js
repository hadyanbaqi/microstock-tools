// Calls the Apify actor kawsar/adobe-stock-scraper ($0.60 per 1.000 results on the free plan) and returns dataset
// items in the field names the rest of the app uses (id, title, nb_downloads, creation_date, ...).
// Without a token, returns generated demo data so the UI can be tried offline.

const ACTOR = "kawsar~adobe-stock-scraper";

// Our params → actor input: assetType / aiFilter use "all" for no filter; the actor has no "recent" order.
function actorInput({ query, creatorId, asset, ai, order, maxItems }) {
  const input = { maxItems, assetType: asset && asset !== "all" ? asset : "all", aiFilter: ai || "all",
    order: order === "recent" ? "newest" : order,
    // The actor's own examples run through Apify Proxy (included in its per-result price) to avoid Adobe blocking.
    proxyConfiguration: { useApifyProxy: true } };
  if (query) input.query = query;
  if (creatorId) input.creatorId = Number(creatorId);
  return input;
}

// Memory per run (MB). Apify accounts have a total memory cap for all runs at once (8 GB on the free plan);
// a smaller run leaves room for parallel searches. If the actor needs more, we retry with its default.
const RUN_MEMORY_MB = Number(process.env.APIFY_RUN_MEMORY_MB ?? 1024);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- one item shape ----------
const pick = (o, ...keys) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k]; return undefined; };
const toNum = (v) => (v === undefined || v === null || v === "" ? undefined : Number(String(v).replace(/[^\d.]/g, "")) || 0);

// Actor output (camelCase) → the Adobe-style names used everywhere else. Items already in that shape pass through.
export function normalizeItem(a) {
  if (!a || typeof a !== "object") return a;
  if ("nb_downloads" in a || "creation_date" in a) return a;
  const cat = pick(a, "categoryInfo", "category");
  const kws = pick(a, "keywordList", "keywords") ?? [];
  return {
    id: pick(a, "assetId", "id", "stockId"),
    title: pick(a, "assetTitle", "title") ?? "",
    details_url: pick(a, "detailsUrl", "details_url", "url"),
    thumbnail_url: pick(a, "thumbUrl", "thumb500Url", "thumbnailUrl", "thumbnail_url"),
    creator_id: pick(a, "creatorId", "creator_id"),
    creator_name: pick(a, "creatorName", "creator_name"),
    country_name: pick(a, "countryName", "country_name"),
    category: cat && typeof cat === "object" ? cat : cat ? { name: String(cat) } : undefined,
    keywords: (Array.isArray(kws) ? kws : String(kws).split(",")).map((k) => (typeof k === "string" ? { name: k.trim() } : k)).filter((k) => k?.name),
    creation_date: pick(a, "createdAt", "creationDate", "created_at", "uploadDate"),
    nb_downloads: toNum(pick(a, "downloadCount", "downloads", "nbDownloads")) ?? 0,
    nb_views: toNum(pick(a, "viewCount", "views", "nbViews")),
    width: toNum(pick(a, "pixelWidth", "width")),
    height: toNum(pick(a, "pixelHeight", "height")),
    is_gentech: !!pick(a, "isGenerativeAi", "isGentech", "is_gentech"),
    media_type_id: pick(a, "mediaTypeId", "media_type_id"),
    content_type: pick(a, "contentType", "content_type"),
  };
}

// Our params from a run's stored INPUT (used when importing earlier runs).
export function paramsFromInput(input = {}) {
  if (!input || typeof input !== "object") return {};
  if (!("assetType" in input) && !("aiFilter" in input)) return input;
  const { assetType, aiFilter, ...rest } = input;
  return { ...rest, asset: assetType ?? "all", ai: aiFilter && aiFilter !== "all" ? aiFilter : "" };
}

// token: the user's own token (from the browser) or the server's APIFY_TOKEN; none = demo data.
// memoryRetries: how often to wait for a full memory cap (the token pool passes 0: another account is tried instead).
export async function fetchAssets(params, token, { memoryRetries = 3 } = {}) {
  const { query = "", creatorId, asset = "all", maxItems = 100 } = params;
  if (!token) return demoAssets(query, maxItems, asset, creatorId);
  return (await runWithRetry(params, token, memoryRetries)).map(normalizeItem);
}

async function runWithRetry(params, token, memoryRetries) {
  let memory = RUN_MEMORY_MB;
  // A full memory cap is temporary (other runs finish): wait and retry a few times before giving up.
  for (let attempt = 0; ; attempt++) {
    try {
      return await runActor(params, token, memory);
    } catch (e) {
      if (e.code === "MEMORY_TOO_LOW" && memory) { memory = 0; continue; }
      if (e.code === "MEMORY" && attempt < memoryRetries) { await sleep(6000 * (attempt + 1)); continue; }
      throw e;
    }
  }
}

async function runActor({ query = "", creatorId, asset = "all", ai = "", order = "downloads", maxItems = 100 }, token, memory) {
  const url = `https://api.apify.com/v2/actors/${ACTOR}/run-sync-get-dataset-items${memory ? `?memory=${memory}` : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(actorInput({ query, creatorId, asset, ai, order, maxItems })),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    let type = "", message = "";
    try { ({ type = "", message = "" } = JSON.parse(text).error ?? {}); } catch {}
    const err = new Error(`Apify error ${res.status} ${type}: ${(message || text).slice(0, 300)}`);
    err.apifyType = type;
    // Input validation fails before a run starts (no cost), e.g. an order/asset value the actor doesn't accept.
    if (res.status === 400) err.code = /memory/i.test(type + message) ? "MEMORY_TOO_LOW" : "INVALID_INPUT";
    // 403 "platform-feature-disabled: Monthly usage hard limit exceeded" = the account's monthly limit, not a bad token.
    if (res.status === 401 || res.status === 403) err.code = /usage|limit|platform-feature-disabled/i.test(type + " " + message) ? "NO_CREDIT" : "BAD_TOKEN";
    // 402 is also used when the account's memory cap is full (too many runs at once), which is not about credit.
    if (res.status === 402) err.code = /memory/i.test(type + message) ? "MEMORY" : "NO_CREDIT";
    if (res.status === 429) err.code = "MEMORY"; // rate limited: same handling, wait and retry
    if (res.status === 404) err.code = "ACTOR_NOT_FOUND";
    throw err;
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// ---------- demo data ----------
function rand(seed) {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

const DEMO_TYPES = [1, 2, 3, 4, 7, 6]; // Adobe media_type_id per content type
const DEMO_IDS = { photo: 0, illustration: 1, vector: 2, video: 3, template: 4, "3d": 5 };

function demoAssets(query, n, asset = "all", creatorId = "") {
  // Seed by query and type so each content type gets its own (still random) sample.
  const seed = query || `portfolio ${creatorId}`; // portfolio lookups have no query to borrow words from
  // Hash the whole text (not just its length) so different queries/IDs get different samples.
  const hash = [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 233280, 7);
  const r = rand(hash + 13 + (DEMO_IDS[asset] ?? 6) * 104729);
  const words = query.split(/\s+/).filter(Boolean);
  const pool = [...words, "background", "concept", "modern", "business", "people", "copy space", "banner",
    "abstract", "lifestyle", "celebration", "minimal", "flat", "illustration", "colorful", "happy", "team"];
  const creators = ["studio_a", "pixelmaker", "lensart", "fizkes", "visualnest", "creativebox"];
  const pickCreator = (i) => ({ creator_id: 208000000 + i * 1373, creator_name: creators[i] });
  // Same name for a demo contributor whether it shows up in a niche or in its own portfolio.
  const demoName = (id) => creators[(Number(id) - 208000000) / 1373] ?? `kontributor_${String(id).slice(-4)}`;
  const now = Date.now();
  return Array.from({ length: Math.min(n, 60) }, (_, i) => {
    const ageDays = Math.floor(r() * 1800) + 10;
    const kw = [...new Set(Array.from({ length: 12 }, () => pool[Math.floor(r() * pool.length)]))];
    return {
      id: 100000000 + Math.floor(r() * 9e8),
      title: `${query || "stock"} ${kw.slice(0, 3).join(" ")} #${i + 1}`.trim(),
      ...demoType(asset in DEMO_IDS ? DEMO_IDS[asset] : Math.floor(Math.pow(r(), 1.6) * DEMO_TYPES.length)),
      // A portfolio lookup returns only that contributor's assets.
      ...(creatorId ? { creator_id: Number(creatorId), creator_name: demoName(creatorId) } : pickCreator(Math.floor(r() * creators.length))),
      category: { name: ["Business", "People", "Holidays", "Backgrounds", "Technology"][Math.floor(r() * 5)] },
      keywords: kw.map((name) => ({ name })),
      creation_date: new Date(now - ageDays * 864e5).toISOString(),
      nb_downloads: Math.floor(Math.pow(r(), 3) * 6000),
      is_gentech: r() < 0.35,
      ...demoMedia(r), // views derive from downloads below, keeping demo conversion at 1–10%
      thumbnail_url: null,
      _demo: true,
    };
  }).map(({ viewsPerDownload, ...a }) => ({ ...a, nb_views: Math.max(200, a.nb_downloads * viewsPerDownload) }));
}

function demoType(t) {
  return { media_type_id: DEMO_TYPES[t], details_url: "https://stock.adobe.com" };
}

// Views and dimensions, like the real output, so conversion and orientation can be tried in demo mode.
function demoMedia(r) {
  const [width, height] = [[6000, 4000], [4000, 6000], [5000, 5000], [1920, 1080]][Math.floor(r() * 4)];
  return { width, height, viewsPerDownload: 10 + Math.floor(r() * 90) };
}

// Checks a token against the Apify account API: returns the username and this month's usage when available.
export async function checkToken(token) {
  const get = (path) => fetch(`https://api.apify.com/v2${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const me = await get("/users/me");
  if (me.status === 401 || me.status === 403) return { ok: false, error: "Token Apify tidak valid." };
  if (!me.ok) throw new Error(`Apify error ${me.status}`);
  const user = (await me.json()).data ?? {};
  // Usage is a nice-to-have; ignore failures.
  const limits = await get("/users/me/limits").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const usage = limits?.data?.current?.monthlyUsageUsd;
  const max = limits?.data?.limits?.maxMonthlyUsageUsd;
  return { ok: true, username: user.username ?? null, plan: user.plan?.id ?? null,
    usageUsd: Number.isFinite(usage) ? usage : null, limitUsd: Number.isFinite(max) ? max : null };
}

// ---------- earlier runs (recover paid results) ----------
// Apify keeps each run's dataset for a while (about 7 days on the free plan). Reading it costs nothing.
async function apifyGet(path, token) {
  const res = await fetch(`https://api.apify.com/v2${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error("Token Apify ditolak."), { code: "BAD_TOKEN" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Apify error ${res.status}`);
  return res.json();
}

// Recent successful runs of the actor on this account, with their input and whether the data still exists.
export async function listRuns(token, limit = 25) {
  const runs = (await apifyGet(`/acts/${ACTOR}/runs?desc=1&limit=${limit}&status=SUCCEEDED`, token))?.data?.items ?? [];
  return Promise.all(runs.map(async (r) => {
    const [input, ds] = await Promise.all([
      apifyGet(`/key-value-stores/${r.defaultKeyValueStoreId}/records/INPUT`, token).catch(() => null),
      apifyGet(`/datasets/${r.defaultDatasetId}`, token).catch(() => null),
    ]);
    return { id: r.id, startedAt: r.startedAt, usd: r.usageTotalUsd ?? null, input: input ? paramsFromInput(input) : null,
      items: ds?.data?.itemCount ?? null, available: !!ds };
  }));
}

// One run's input and items (null when the run or its dataset is gone).
export async function runResult(token, runId) {
  const run = (await apifyGet(`/actor-runs/${encodeURIComponent(runId)}`, token))?.data;
  if (!run) return null;
  const input = await apifyGet(`/key-value-stores/${run.defaultKeyValueStoreId}/records/INPUT`, token).catch(() => null);
  const items = await apifyGet(`/datasets/${run.defaultDatasetId}/items?clean=true&format=json&limit=300`, token);
  return items ? { run, input: paramsFromInput(input ?? {}), items: items.map(normalizeItem) } : null;
}
