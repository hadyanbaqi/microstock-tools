// Turns raw Adobe Stock items into microstock research insights.
import { detectType, typeInfo } from "./contentTypes.js";

const MONTH_MS = 30.44 * 864e5;

export const STOPWORDS = new Set(("a an and the of in on at for with to from by or is are be as into over under " +
  "vector illustration photo image stock background design isolated").split(" "));

// Raw actor items → normalized assets (shared by analyze() and the keyword trend scan).
export function toAssets(items, asset = "all", now = Date.now()) {
  return items.map((a) => {
    const created = a.creation_date ? new Date(String(a.creation_date).replace(" ", "T")) : null;
    const valid = created && !isNaN(created);
    const rawMonths = valid ? (now - created.getTime()) / MONTH_MS : null;
    const months = valid ? Math.max(1, rawMonths) : null; // age shown in months: at least 1
    // Speed floors the age at ~1 week, not a month: a 3-day-old asset with 30 downloads is not "30 per month".
    const velMonths = valid ? Math.max(0.25, rawMonths) : null;
    const downloads = a.nb_downloads ?? 0;
    // The actor reports views and dimensions; field names follow Adobe's (nb_views, width, height).
    // Adobe often reports a partial view count (e.g. 2 views for 9.000 downloads); fewer views than downloads is
    // impossible, so such counts are treated as missing instead of producing conversions of thousands of percent.
    const rawViews = num(a.nb_views ?? a.views);
    const views = rawViews && rawViews >= downloads ? rawViews : null;
    const width = num(a.width ?? a.dimensions?.width), height = num(a.height ?? a.dimensions?.height);
    return {
      id: a.id,
      title: a.title ?? "",
      url: a.details_url,
      thumb: a.thumbnail_url,
      creator: a.creator_name ?? "-",
      creatorId: a.creator_id ?? null,
      category: a.category?.name ?? "-",
      type: detectType(a, asset),
      isAI: !!a.is_gentech,
      created: valid ? created.toISOString().slice(0, 10) : "-",
      createdMs: valid ? created.getTime() : null,
      ageMonths: months ? Math.round(months) : null,
      downloads,
      views,
      // Downloads per 100 views: how well an asset converts buyers who see it.
      conversion: views ? +((downloads / views) * 100).toFixed(2) : null,
      orientation: orientation(width, height),
      size: width && height ? `${width}×${height}` : null,
      dlPerMonth: velMonths ? +(downloads / velMonths).toFixed(1) : 0,
      // 0–100 on a log scale of downloads per month: ~10/mo ≈ 35, ~100/mo ≈ 67, 1.000+/mo = 100.
      performance: velMonths ? Math.min(100, Math.round((100 * Math.log10(downloads / velMonths + 1)) / 3)) : 0,
      // Adobe keywords differ only by case across assets; merge them.
      keywords: [...new Set((a.keywords ?? []).map((k) => normKw(k.name)).filter(Boolean))],
    };
  });
}

export function analyze(items, { query = "", asset = "all", creatorId = "" } = {}) {
  const now = Date.now();

  const assets = toAssets(items, asset, now);

  const n = assets.length || 1;
  const total = sum(assets, (a) => a.downloads);
  const recent = assets.filter((a) => a.ageMonths !== null && a.ageMonths <= 12);
  const aiShare = assets.filter((a) => a.isAI).length / n;
  const avgDl = total / n;
  // Speed is only known for assets with an upload date; undated ones must not dilute the average.
  const avgVelocity = sum(assets, (a) => a.dlPerMonth) / (assets.filter((a) => a.ageMonths !== null).length || 1);
  const avgRecentVelocity = recent.length ? sum(recent, (a) => a.dlPerMonth) / recent.length : 0;

  const keywords = keywordStats(assets, n, avgVelocity, query);
  const queryWords = new Set(tokens(query));
  // Strong but underused: sells above niche average, yet few top sellers use it.
  const goldenKeywords = keywords
    .filter((k) => k.count >= 2 && k.share <= 25 && k.avgVelocity > avgVelocity && !queryWords.has(k.keyword))
    .sort((x, y) => y.avgVelocity - x.avgVelocity)
    .slice(0, 15);

  const cat = new Map();
  for (const a of assets) {
    const e = cat.get(a.category) ?? { name: a.category, assets: 0, downloads: 0 };
    e.assets++;
    e.downloads += a.downloads;
    cat.set(a.category, e);
  }
  const categories = [...cat.values()].sort((x, y) => y.downloads - x.downloads);

  const creators = new Map();
  for (const a of assets) {
    const key = a.creatorId ?? a.creator;
    const e = creators.get(key) ?? { name: a.creator, id: a.creatorId, assets: 0, downloads: 0, ai: 0 };
    e.assets++;
    e.downloads += a.downloads;
    if (a.isAI) e.ai++;
    creators.set(key, e);
  }
  const allCreators = [...creators.values()].sort((x, y) => y.downloads - x.downloads);
  const topCreators = allCreators.slice(0, 10).map((c) => ({ ...c, share: pct(c.downloads, total) }));
  // Share of downloads held by the 5 biggest creators: high means a closed niche.
  const dominance = total ? sum(allCreators.slice(0, 5), (c) => c.downloads) / total : 0;

  const types = typeStats(assets, total);
  const withViews = assets.filter((a) => a.views);
  const totalViews = sum(withViews, (a) => a.views);
  const orientations = groupBy(assets.filter((a) => a.orientation), (a) => a.orientation, total);

  // Opportunity score 0-100. Heuristic, tune weights as you learn.
  const parts = {
    demand: Math.min(1, Math.log10(avgDl + 1) / 4),
    momentum: Math.min(1, Math.log10(avgRecentVelocity + 1) / 2.5),
    freshness: recent.length / n,
    openness: 1 - dominance,
  };
  const base = 0.35 * parts.demand + 0.3 * parts.momentum + 0.2 * parts.freshness + 0.15 * parts.openness;
  const score = Math.round(100 * base * (1 - 0.3 * aiShare));

  return {
    summary: {
      count: assets.length,
      totalDownloads: total,
      avgDownloads: Math.round(avgDl),
      medianDownloads: median(assets.map((a) => a.downloads)),
      avgVelocity: +avgVelocity.toFixed(1),
      aiShare: Math.round(aiShare * 100),
      recentCount: recent.length,
      avgRecentVelocity: +avgRecentVelocity.toFixed(1),
      creatorCount: allCreators.length,
      // null when the actor returned no view counts.
      conversion: totalViews ? +((sum(withViews, (a) => a.downloads) / totalViews) * 100).toFixed(2) : null,
      dominance: Math.round(dominance * 100),
      opportunityScore: score,
      scoreParts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v * 100)])),
      verdict: verdict(score),
    },
    insights: [...insights({ assets, recent, aiShare, dominance, avgVelocity, n }), ...typeInsights(types)],
    aiVsHuman: {
      ai: group(assets.filter((a) => a.isAI)),
      human: group(assets.filter((a) => !a.isAI)),
    },
    ageBuckets: ageBuckets(assets),
    uploads: monthlyUploads(assets, now),
    assets: assets.sort((x, y) => y.downloads - x.downloads),
    keywords: keywords.slice(0, 80),
    goldenKeywords,
    titlePhrases: titlePhrases(assets),
    categories,
    types,
    orientations,
    performance: performance(assets, total),
    heatmap: heatmap(assets, categories),
    brief: brief({ assets, types, orientations, keywords, query, avgVelocity }),
    creator: creatorId ? creatorProfile(assets, creatorId) : null,
    topCreators,
  };
}

// Keywords ranked by what sells *now*: half the weight comes from assets ≤24 months old, so keywords
// carried by 5-year-old best sellers don't dominate. Trend compares their share in recent vs older assets.
const RECENT_MONTHS = 24;
function keywordStats(assets, n, avgVelocity, query) {
  const isRecent = (a) => a.ageMonths !== null && a.ageMonths <= RECENT_MONTHS;
  const nRecent = assets.filter(isRecent).length;
  const nOld = assets.length - nRecent;
  const kw = new Map();
  for (const a of assets) {
    for (const k of a.keywords) {
      const e = kw.get(k) ?? { keyword: k, count: 0, recent: 0, downloads: 0, velocity: 0 };
      e.count++;
      if (isRecent(a)) e.recent++;
      e.downloads += a.downloads;
      e.velocity += a.dlPerMonth;
      kw.set(k, e);
    }
  }
  const queryWords = new Set(tokens(query));
  return [...kw.values()]
    .map((e) => {
      const avgVel = e.velocity / e.count;
      const share = e.count / n;
      const shareRecent = nRecent ? e.recent / nRecent : share;
      const shareOld = nOld ? (e.count - e.recent) / nOld : share;
      const lift = avgVelocity ? Math.min(2, avgVel / avgVelocity) : 1;
      const score = (0.5 * share + 0.5 * shareRecent) * (0.6 + 0.4 * lift) + (queryWords.has(e.keyword) ? 1 : 0);
      const diff = shareRecent - shareOld;
      const trend = !queryWords.has(e.keyword) && nRecent >= 5 && nOld >= 5 && e.count >= 3
        ? (diff >= 0.1 ? "naik" : diff <= -0.1 ? "turun" : "stabil") : "stabil";
      return {
        keyword: e.keyword,
        count: e.count,
        share: Math.round(share * 100),
        shareRecent: Math.round(shareRecent * 100),
        downloads: e.downloads,
        avgDownloads: Math.round(e.downloads / e.count),
        avgVelocity: +avgVel.toFixed(1),
        trend,
        score: +score.toFixed(3),
      };
    })
    .sort((x, y) => y.score - x.score || y.avgVelocity - x.avgVelocity);
}

// Most common 2-3 word phrases in titles of the 30 best sellers, to help write titles.
function titlePhrases(assets) {
  const counts = new Map();
  for (const a of assets.slice(0, 30)) {
    const w = tokens(a.title);
    const seen = new Set();
    for (const size of [2, 3]) {
      for (let i = 0; i + size <= w.length; i++) {
        const gram = w.slice(i, i + size);
        if (STOPWORDS.has(gram[0]) || STOPWORDS.has(gram[size - 1])) continue;
        const p = gram.join(" ");
        if (seen.has(p)) continue;
        seen.add(p);
        counts.set(p, (counts.get(p) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((x, y) => y[1] - x[1] || y[0].split(" ").length - x[0].split(" ").length)
    .slice(0, 12)
    .map(([phrase, count]) => ({ phrase, count }));
}

// Downloads and sales speed per content type: which format sells best for this niche.
function typeStats(assets, total) {
  const m = new Map();
  for (const a of assets) {
    const e = m.get(a.type) ?? [];
    e.push(a);
    m.set(a.type, e);
  }
  return [...m.entries()]
    .map(([type, list]) => ({ type, ...group(list), downloads: sum(list, (a) => a.downloads), share: pct(sum(list, (a) => a.downloads), total) }))
    .sort((x, y) => y.downloads - x.downloads);
}

function typeInsights(types) {
  const known = types.filter((t) => typeInfo(t.type) && t.count >= 3);
  if (known.length < 2) return [];
  const best = [...known].sort((x, y) => y.avgVelocity - x.avgVelocity)[0];
  const rest = known.filter((t) => t !== best);
  const others = rest.reduce((s, t) => s + t.avgVelocity * t.count, 0) / (rest.reduce((s, t) => s + t.count, 0) || 1);
  if (best.avgVelocity < others * 1.2) return [];
  return [{ type: "good", text: `${typeInfo(best.type).label} terjual paling cepat di niche ini (${best.avgVelocity} dl/bln vs ${others.toFixed(1)} jenis lain). Prioritaskan format ini.` }];
}

// Content brief: turns the sample into "what to make". Everything is compared on sales speed (dl/month),
// using the fastest-selling quarter of the sample as the "winners".
function brief({ assets, types, orientations, keywords, query, avgVelocity }) {
  const qw = new Set(tokens(query));
  const best = (groups, ok = () => true) => {
    const g = groups.filter((x) => x.count >= 3 && ok(x)).sort((x, y) => y.avgVelocity - x.avgVelocity);
    if (!g.length) return null;
    const rest = g.slice(1);
    const others = rest.reduce((s, x) => s + x.avgVelocity * x.count, 0) / (rest.reduce((s, x) => s + x.count, 0) || 1);
    return { name: g[0].type ?? g[0].name, avgVelocity: g[0].avgVelocity, others: rest.length ? +others.toFixed(1) : null, count: g[0].count };
  };
  const format = best(types, (t) => typeInfo(t.type)) ?? (types.length === 1 && typeInfo(types[0].type) ? { name: types[0].type } : null);
  const orientation = best(orientations);
  const cats = [];
  for (const name of new Set(assets.map((a) => a.category))) {
    const list = assets.filter((a) => a.category === name && a.ageMonths !== null && a.ageMonths <= RECENT_MONTHS);
    cats.push({ name, ...group(list) });
  }
  const category = best(cats.filter((c) => c.name !== "-"));

  const ai = assets.filter((a) => a.isAI), human = assets.filter((a) => !a.isAI);
  let aiAdvice = { level: "bebas", text: "AI atau non-AI sama-sama laku" };
  if (ai.length >= 3 && human.length >= 3) {
    const av = group(ai).avgVelocity, hv = group(human).avgVelocity;
    const r = hv > 0 && av > 0 ? av / hv : null; // a group that sells nothing has no meaningful ratio
    if (hv > 0 && av === 0) aiAdvice = { level: "non-ai", text: "Non-AI (aset AI di daftar ini belum terjual)" };
    else if (hv === 0 && av > 0) aiAdvice = { level: "ai", text: "AI boleh (aset non-AI di daftar ini belum terjual)" };
    else if (r === null) { /* both zero: keep "bebas" */ }
    else if (r <= 0.8) aiAdvice = { level: "non-ai", text: `Non-AI (laku ${(1 / r).toFixed(1)}× lebih cepat dari AI)` };
    else if (r >= 1.25) aiAdvice = { level: "ai", text: `AI boleh (laku ${r.toFixed(1)}× lebih cepat dari non-AI)` };
  } else if (!ai.length && human.length >= 3) aiAdvice = { level: "non-ai", text: "Non-AI (aset AI belum ada di daftar teratas)" };

  const bySpeed = [...assets].sort((x, y) => y.dlPerMonth - x.dlPerMonth);
  const winners = bySpeed.slice(0, Math.max(5, Math.ceil(assets.length / 4)));
  const nW = winners.length || 1, nA = assets.length || 1;
  const inW = new Map();
  for (const a of winners) for (const k of a.keywords) inW.set(k, (inW.get(k) ?? 0) + 1);
  const all = new Map(keywords.map((k) => [k.keyword, k]));
  // Elements typical of fast sellers: used by winners clearly more often than by the sample overall.
  const elements = [...inW.entries()]
    .filter(([k, c]) => c >= 2 && !qw.has(k) && all.get(k))
    .map(([k, c]) => ({ keyword: k, shareWinners: Math.round((c / nW) * 100), lift: (c / nW) / (all.get(k).count / nA) }))
    .filter((e) => e.lift >= 1.2)
    .sort((x, y) => y.shareWinners * y.lift - x.shareWinners * x.lift)
    .slice(0, 8);
  // Common but slow: lots of assets use them, yet those assets sell below the niche average.
  const avoid = keywords
    .filter((k) => !qw.has(k.keyword) && k.share >= 20 && avgVelocity && k.avgVelocity < avgVelocity * 0.7)
    .slice(0, 4)
    .map((k) => ({ keyword: k.keyword, share: k.share, avgVelocity: k.avgVelocity }));

  const recent = bySpeed.filter((a) => a.ageMonths !== null && a.ageMonths <= RECENT_MONTHS);
  const references = (recent.length >= 3 ? recent : bySpeed).slice(0, 6);

  return {
    format, orientation, category, ai: aiAdvice, elements, avoid, references,
    // Phrases that add something beyond the query itself.
    phrases: titlePhrases(winners).filter((p) => {
      const w = p.phrase.split(" ");
      return new Set(w).size === w.length && w.some((x) => !qw.has(x));
    }).slice(0, 6),
    keywords: keywords.slice(0, 25).map((k) => k.keyword),
    winnersVelocity: group(winners).avgVelocity,
    avgVelocity: +avgVelocity.toFixed(1),
  };
}

// Market heatmap: average downloads/month per category (rows) and upload age (columns, oldest → newest,
// so a row that darkens to the right = new assets in that category still sell = heating up).
const HEAT_COLS = [["> 3 thn", 36, Infinity], ["2–3 thn", 24, 36], ["1–2 thn", 12, 24], ["6–12 bln", 6, 12], ["≤6 bln", 0, 6]];
function heatmap(assets, categories) {
  const totalVel = sum(assets, (a) => a.dlPerMonth) || 1;
  const trendOf = (list) => {
    const recent = group(list.filter((a) => a.ageMonths <= 12));
    const older = group(list.filter((a) => a.ageMonths > 12));
    let trend = "stabil", ratio = null;
    if (recent.count >= 2 && older.count >= 2) {
      ratio = +(recent.avgVelocity / (older.avgVelocity || 1)).toFixed(1);
      trend = ratio >= 1.5 ? "memanas" : ratio <= 0.6 ? "mendingin" : "stabil";
    } else if (recent.count >= 2 && !older.count) trend = "memanas";
    else if (!recent.count && older.count >= 2) trend = "mendingin";
    return { trend, ratio, recent: recent.count };
  };
  const row = (name, list) => ({
    category: name, assets: list.length, downloads: sum(list, (a) => a.downloads),
    velocity: +sum(list, (a) => a.dlPerMonth).toFixed(1),
    share: Math.round((sum(list, (a) => a.dlPerMonth) / totalVel) * 1000) / 10,
    avgVelocity: group(list).avgVelocity,
    ...trendOf(list.filter((a) => a.ageMonths !== null)),
  });
  const rows = categories.slice(0, 8).map((c) => {
    const list = assets.filter((a) => a.category === c.name);
    const dated = list.filter((a) => a.ageMonths !== null);
    const cells = HEAT_COLS.map(([, lo, hi]) => group(dated.filter((a) => (lo === 0 ? a.ageMonths >= 0 : a.ageMonths > lo) && a.ageMonths <= hi)));
    return { ...row(c.name, list), cells };
  });
  const max = Math.max(1, ...rows.flatMap((r) => r.cells.map((x) => x.avgVelocity)));
  // Treemap: every category sized by its share of sales speed (dl/month), top 9 + "Lainnya".
  const all = categories.map((c) => row(c.name, assets.filter((a) => a.category === c.name)))
    .sort((x, y) => y.velocity - x.velocity);
  const rest = all.slice(9);
  const tiles = all.slice(0, 9);
  if (rest.length) {
    const names = new Set(rest.map((r) => r.category));
    tiles.push({ ...row("Lainnya", assets.filter((a) => names.has(a.category))), trend: "stabil", ratio: null, others: rest.length });
  }
  return { cols: HEAT_COLS.map(([l]) => l), rows, max, tiles: tiles.filter((t) => t.velocity > 0) };
}

// How downloads spread across the sample: buckets, hit rate and concentration (pareto).
function performance(assets, total) {
  const defs = [["0", 0, 0], ["1–9", 1, 9], ["10–99", 10, 99], ["100–999", 100, 999], ["1.000+", 1000, Infinity]];
  const n = assets.length || 1;
  const buckets = defs.map(([label, lo, hi]) => {
    const c = assets.filter((a) => a.downloads >= lo && a.downloads <= hi).length;
    return { label, count: c, share: Math.round((c / n) * 100) };
  });
  const sorted = [...assets].sort((x, y) => y.downloads - x.downloads);
  const top10 = sorted.slice(0, Math.max(1, Math.ceil(assets.length * 0.1)));
  return {
    buckets,
    hitRate: Math.round((assets.filter((a) => a.downloads >= 100).length / n) * 100),
    zeroShare: Math.round((assets.filter((a) => a.downloads === 0).length / n) * 100),
    top10Share: total ? Math.round((sum(top10, (a) => a.downloads) / total) * 100) : 0,
    totalVelocity: +sum(assets, (a) => a.dlPerMonth).toFixed(1),
  };
}

// Name of the contributor behind a creatorId search (most common name in the results).
function creatorProfile(assets, creatorId) {
  const own = assets.filter((a) => String(a.creatorId) === String(creatorId));
  const list = own.length ? own : assets;
  const names = new Map();
  for (const a of list) names.set(a.creator, (names.get(a.creator) ?? 0) + 1);
  const name = [...names.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
  const dated = list.filter((a) => a.createdMs !== null).map((a) => a.createdMs);
  return {
    id: String(creatorId),
    name,
    firstUpload: dated.length ? new Date(Math.min(...dated)).toISOString().slice(0, 10) : null,
    lastUpload: dated.length ? new Date(Math.max(...dated)).toISOString().slice(0, 10) : null,
  };
}

function groupBy(list, key, total) {
  const m = new Map();
  for (const a of list) m.set(key(a), [...(m.get(key(a)) ?? []), a]);
  return [...m.entries()]
    .map(([name, l]) => ({ name, ...group(l), share: pct(sum(l, (a) => a.downloads), total) }))
    .sort((x, y) => y.count - x.count);
}

function orientation(w, h) {
  if (!w || !h) return null;
  const r = w / h;
  return r > 1.05 ? "horizontal" : r < 0.95 ? "vertikal" : "persegi";
}

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

function group(list) {
  return {
    count: list.length,
    avgDownloads: Math.round(sum(list, (a) => a.downloads) / (list.length || 1)),
    avgVelocity: +(sum(list, (a) => a.dlPerMonth) / (list.filter((a) => a.ageMonths !== null).length || 1)).toFixed(1),
  };
}

function ageBuckets(assets) {
  const defs = [
    ["≤ 6 bln", 0, 6], ["6–12 bln", 6, 12], ["1–2 thn", 12, 24], ["2–3 thn", 24, 36], ["> 3 thn", 36, Infinity],
  ];
  return defs.map(([label, lo, hi]) => {
    const list = assets.filter((a) => a.ageMonths !== null && a.ageMonths > lo && a.ageMonths <= hi);
    return { label, ...group(list) };
  });
}

// Assets created per month over the last 12 months (of the sample).
function monthlyUploads(assets, now) {
  const d = new Date(now);
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    months.push({ month: m.toISOString().slice(0, 7), count: 0 });
  }
  const idx = new Map(months.map((m, i) => [m.month, i]));
  for (const a of assets) {
    if (a.createdMs === null) continue;
    const i = idx.get(new Date(a.createdMs).toISOString().slice(0, 7));
    if (i !== undefined) months[i].count++;
  }
  return months;
}

function insights({ assets, recent, aiShare, dominance, avgVelocity, n }) {
  const out = [];
  const ai = assets.filter((a) => a.isAI);
  const human = assets.filter((a) => !a.isAI);
  if (ai.length >= 3 && human.length >= 3) {
    const av = sum(ai, (a) => a.dlPerMonth) / ai.length, hv = sum(human, (a) => a.dlPerMonth) / human.length;
    const r = av > 0 && hv > 0 ? av / hv : 1; // no ratio when one side sells nothing
    if (r >= 1.2) out.push({ type: "good", text: `Aset AI terjual ${r.toFixed(1)}× lebih cepat dari non-AI di niche ini. Konten AI berkualitas masih diterima pembeli.` });
    else if (r <= 0.8) out.push({ type: "warn", text: `Aset non-AI terjual ${(1 / r).toFixed(1)}× lebih cepat dari AI. Pembeli niche ini lebih suka foto/karya asli.` });
  }
  if (aiShare >= 0.5) out.push({ type: "warn", text: `${Math.round(aiShare * 100)}% aset teratas adalah AI. Persaingan dari konten AI tinggi.` });
  if (dominance >= 0.6) out.push({ type: "warn", text: `5 kontributor teratas menguasai ${Math.round(dominance * 100)}% download. Niche dikuasai pemain besar; cari sub-niche.` });
  else if (dominance > 0 && dominance <= 0.3) out.push({ type: "good", text: `Download tersebar di banyak kontributor (top 5 hanya ${Math.round(dominance * 100)}%). Pendatang baru masih punya ruang.` });
  if (!n) return out;
  if (recent.length / n >= 0.25) {
    const rv = sum(recent, (a) => a.dlPerMonth) / (recent.length || 1);
    if (rv >= avgVelocity) out.push({ type: "good", text: `${recent.length} aset berumur ≤12 bulan sudah masuk daftar terlaris dan terjual cepat. Pasar masih menerima aset baru.` });
  } else if (recent.length / n <= 0.1) {
    out.push({ type: "warn", text: `Hanya ${recent.length} aset baru (≤12 bln) di daftar teratas. Aset lama mendominasi; sulit menembus urutan atas.` });
  }
  const top = assets[0];
  if (top && top.downloads > 0) {
    const topShare = top.downloads / (sum(assets, (a) => a.downloads) || 1);
    if (topShare >= 0.3) out.push({ type: "info", text: `Satu aset ("${top.title.slice(0, 60)}") memegang ${Math.round(topShare * 100)}% download sampel. Pelajari gaya dan komposisinya.` });
  }
  return out;
}

function verdict(score) {
  if (score >= 60) return { level: "good", text: "Peluang bagus: permintaan ada dan aset baru masih laku." };
  if (score >= 35) return { level: "mid", text: "Kompetitif: bisa masuk dengan sudut pandang/gaya yang berbeda." };
  return { level: "low", text: "Jenuh atau permintaan rendah: pertimbangkan sub-niche lain." };
}

export function normKw(s) {
  return String(s ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

export function tokens(s) {
  return String(s ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
