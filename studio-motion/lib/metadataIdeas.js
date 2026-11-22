// Ready-to-paste stock metadata from one search: 40 keywords and SEO titles, following the owner's CSV rules
// (title ≤70 characters, no comma, main keyword first, ≥5 words; 40 keywords, most important first; no trademarks;
// only a-z 0-9 space and hyphen, like platforms.py checks). Pure functions: safe in the browser and on the server.
import { BRAND_RE } from "./brands.js";

export const TITLE_MAX = 70;
const OK = /^[a-z0-9][a-z0-9 -]*$/;
const SUFFIX = { vector: "vector", illustration: "illustration", video: "video loop", template: "template", "3d": "3d render", photo: "", all: "" };
// Filler that every asset carries: fine as keywords, wasted characters in a title (the suffix adds the format word).
const TITLE_SKIP = new Set(["vector", "illustration", "design", "graphic", "element", "elements", "art", "artwork", "image", "picture", "stock", "drawing", "isolated", "concept", "eps"]);
const clean = (k) => String(k || "").toLowerCase().replace(/[^a-z0-9 -]+/g, " ").replace(/\s+/g, " ").trim();
const usable = (k) => k && OK.test(k) && !BRAND_RE.test(k);

// Keywords in the order a CSV wants them: the searched phrase first, then the weighted ranking from analyze().
export function keywordList(data, n = 40) {
  const out = [];
  const add = (k) => { k = clean(k); if (usable(k) && !out.includes(k)) out.push(k); };
  add(data?.params?.query);
  for (const k of data?.keywords ?? []) add(k.keyword);
  return out.slice(0, n);
}

// Builds one title: seed phrases first, then keywords, adding only new words, until the next word would pass 70.
function build(seeds, suffix) {
  const words = [], room = TITLE_MAX - (suffix ? suffix.length + 1 : 0);
  const fits = (w) => [...words, w].join(" ").length <= room;
  for (const phrase of seeds) {
    for (const w of clean(phrase).split(" ")) {
      if (!w || words.includes(w) || TITLE_SKIP.has(w) || BRAND_RE.test(w)) continue;
      if (!fits(w)) return finish(words, suffix);
      words.push(w);
    }
  }
  return finish(words, suffix);
}
function finish(words, suffix) {
  const sw = suffix ? suffix.split(" ").filter((w) => !words.includes(w)) : [];
  const all = [...words, ...sw];
  if (all.length < 5) return null;
  const t = all.join(" ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Up to three different titles: by keyword ranking, by sales speed, and led by the best-selling title phrase.
export function titleIdeas(data) {
  const q = clean(data?.params?.query);
  const suffix = SUFFIX[data?.params?.asset] ?? "";
  const kws = (data?.keywords ?? []).map((k) => ({ ...k, keyword: clean(k.keyword) })).filter((k) => usable(k.keyword));
  const byRank = kws.map((k) => k.keyword);
  const bySpeed = [...kws].filter((k) => k.count >= 2).sort((a, b) => b.avgVelocity - a.avgVelocity).map((k) => k.keyword);
  const phrases = (data?.titlePhrases ?? []).map((p) => clean(p.phrase)).filter(usable);
  const ideas = [
    { label: "Keyword utama", title: build([q, ...byRank], suffix) },
    { label: "Paling cepat laku", title: build([q, ...bySpeed, ...byRank], suffix) },
    { label: "Frasa judul terlaris", title: build([...phrases.slice(0, 2), q, ...byRank], suffix) },
  ].filter((i) => i.title);
  const seen = new Set();
  return ideas.filter((i) => !seen.has(i.title.toLowerCase()) && seen.add(i.title.toLowerCase()));
}
