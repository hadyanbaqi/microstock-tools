// Keyword trends for one theme from two samples: best-selling assets (demand) and newest uploads (supply).
// Signals per keyword (laku, naik, dipakai aset terlaris, upload baru, AI) → one label: naik | celah | stabil | jenuh.
import { STOPWORDS, toAssets, tokens } from "./analyze.js";
import { typeLabel } from "./contentTypes.js";

const DAY = 864e5;
// Words on almost every asset: they never signal a trend.
const GENERIC = new Set(("background backgrounds concept illustration vector design isolated image photo stock graphic " +
  "art abstract white modern copy space banner template element elements beautiful view closeup close up nobody").split(" "));

const med = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const clamp = (v) => Math.max(0, Math.min(1, v));
const r1 = (v) => Math.round(v * 10) / 10;

// Best value of `key` among assets: highest median dl/month with ≥2 assets, else the most common.
function topBy(list, key) {
  const m = new Map();
  for (const a of list) if (a[key]) m.set(a[key], [...(m.get(a[key]) ?? []), a.dlPerMonth]);
  const rows = [...m.entries()].map(([k, v]) => ({ k, n: v.length, v: med(v) }));
  const pick = rows.filter((r) => r.n >= 2).sort((a, b) => b.v - a.v)[0] ?? rows.sort((a, b) => b.n - a.n)[0];
  return pick?.k ?? null;
}

// best = best-selling sample (demand: what buyers download), fresh = newest uploads (supply: what
// contributors are uploading right now, mostly days old with no sales yet).
export function keywordTrends({ best: bestItems = [], fresh: freshItems = [] }, theme, { now = Date.now(), limit = 12, maxJenuh = 3 } = {}) {
  const prep = (items) => {
    const seen = new Set();
    return toAssets(items.filter((i) => i.id == null || (!seen.has(String(i.id)) && seen.add(String(i.id)))), "all", now);
  };
  const best = prep(bestItems).filter((a) => a.createdMs);
  const fresh = prep(freshItems);
  const total = new Set([...best, ...fresh].map((a) => String(a.id))).size;
  if (best.length < 5) return { keywords: [], assets: total };

  const age = (a) => (now - a.createdMs) / DAY;
  const base = med(best.map((a) => a.dlPerMonth)) || 0.1;
  const skip = new Set(tokens(theme.query));
  const ok = (k) => k.length > 2 && !STOPWORDS.has(k) && !GENERIC.has(k) && !skip.has(k) && !/^\d+$/.test(k);
  const byKw = new Map();
  const add = (list, key) => {
    for (const a of list) for (const k of a.keywords) if (ok(k)) {
      const e = byKw.get(k) ?? { best: [], fresh: [] };
      e[key].push(a);
      byKw.set(k, e);
    }
  };
  add(best, "best");
  add(fresh, "fresh");

  const rows = [];
  for (const [keyword, { best: b, fresh: f }] of byKw) {
    if (b.length < 2 && f.length < 3) continue;
    // New sellers: best-sellers uploaded within the last year (younger than 2 weeks is too early to judge).
    const young = b.filter((a) => age(a) >= 14 && age(a) <= 365);
    const old = b.filter((a) => age(a) > 365);
    const mv = med((young.length ? young : b).map((a) => a.dlPerMonth));
    const ratio = young.length && old.length ? r1(med(young.map((a) => a.dlPerMonth)) / Math.max(med(old.map((a) => a.dlPerMonth)), 0.1)) : null;
    const demand = Math.round((b.length / best.length) * 100);
    const supply = fresh.length ? Math.round((f.length / fresh.length) * 100) : 0;
    const aiList = f.length >= 2 ? f : b;
    const ai = aiList.length ? Math.round((aiList.filter((a) => a.isAI).length / aiList.length) * 100) : 0;

    let label = null;
    if (young.length >= 2 && (ratio == null ? !old.length : ratio >= 1.5)) label = "naik";
    else if (demand >= 6 && supply <= demand * 0.5) label = "celah";
    else if (supply >= 8 && supply >= Math.max(demand, 1) * 2) label = "jenuh";
    else if (demand >= 8) label = "stabil";
    if (!label) continue;

    const momentum = ratio ?? (young.length >= 2 && !old.length ? 2 : 1);
    const score = r1(100 * (0.35 * clamp(demand / 30) + 0.25 * clamp(momentum / 3)
      + 0.2 * clamp(Math.log2(mv / base + 1) / 2) + 0.1 * (1 - clamp(supply / Math.max(demand, 1) / 3)) + 0.1 * (1 - ai / 100)));

    const co = new Map();
    for (const a of b) for (const k of a.keywords) if (k !== keyword && ok(k)) co.set(k, (co.get(k) ?? 0) + 1);
    const pairs = [...co.entries()].filter(([, n]) => n >= 2).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k]) => k);
    const pool = b.length ? b : f;
    const fmt = topBy(pool, "type");
    rows.push({
      theme: theme.id, keyword, label, score,
      median_velocity: r1(mv), ratio,
      // Stored columns: sold_share = % of best-sellers using the keyword (demand), supply_share = % of newest
      // uploads using it, new_assets = best-sellers ≤1 year old using it.
      sold_share: demand, supply_share: supply, ai_share: ai, new_assets: young.length,
      best_format: fmt && fmt !== "unknown" && fmt !== "image" ? typeLabel(fmt) : null, best_orientation: topBy(pool, "orientation"), pairs,
      samples: [...pool].sort((x, y) => y.dlPerMonth - x.dlPerMonth).slice(0, 3)
        .map((a) => ({ id: String(a.id), title: a.title.slice(0, 140), thumb: a.thumb ?? null, url: a.url ?? null, v: a.dlPerMonth })),
    });
  }
  const good = rows.filter((x) => x.label !== "jenuh").sort((x, y) => y.score - x.score).slice(0, limit);
  const jenuh = rows.filter((x) => x.label === "jenuh").sort((x, y) => y.supply_share - x.supply_share).slice(0, maxJenuh);
  return { keywords: [...good, ...jenuh], assets: total };
}
